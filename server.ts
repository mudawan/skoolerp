import express from 'express';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import rateLimit, { Store } from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import {
  dbService,
  DbUser,
  DbInstitution,
  SimpleEntityConfig,
  CLASS_ENTITY_CONFIG,
  FAMILY_ENTITY_CONFIG,
  BUS_ENTITY_CONFIG,
  STOP_ENTITY_CONFIG,
  TRANSPORT_ASSIGNMENT_ENTITY_CONFIG,
  FEE_TEMPLATE_ENTITY_CONFIG,
  BANK_ACCOUNT_ENTITY_CONFIG,
} from './server/db';
import { hashPassword, verifyPassword } from './src/utils/passwords';
import { isPermissionAllowed, ALL_PERMISSION_CODES } from './src/utils/permissions';
import { PAYMENT_MODES, DEFAULT_PAYMENT_MODE, isPaymentMode } from './src/utils/paymentMode';
import { applyCarryForward, CURRENCY_OPTIONS } from './src/utils/feeMath';
import type { FeeVoucher } from './src/types';

const PORT = 3000;
const SESSION_COOKIE_NAME = 'school_session_token';
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthenticatedRequest extends express.Request {
  user?: DbUser;
  institution?: DbInstitution | null;
  institutionId?: string;
  sessionToken?: string;
}

function mintSecureToken(): string {
  return 'stk_' + crypto.randomBytes(32).toString('hex');
}

function setSessionCookie(res: express.Response, token: string) {
  // Option B: Ephemeral session cookie (no maxAge) so the browser automatically
  // discards the cookie when the browser session ends / window closes.
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

async function startServer() {
  const app = express();

  // Only trust X-Forwarded-For / X-Forwarded-Proto when this app is actually
  // deployed behind a reverse proxy we control (see nginx.conf). Setting
  // this unconditionally would let any direct client spoof its own IP via
  // the X-Forwarded-For header, defeating the rate limiters below. When
  // NOT running behind a reverse proxy, leave TRUST_PROXY unset/false so
  // req.ip reflects the real TCP peer instead.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1); // trust exactly one hop (the nginx in nginx.conf)
  }

  // Parse cookies first for session tokens
  app.use(cookieParser());

  // Parse JSON payloads up to 50MB (to support bulk uploads, CSV imports, and document attachments)
  app.use(express.json({ limit: '50mb' }));

  /**
   * Rate-limit store shared across every app instance via Postgres, so a
   * horizontally-scaled deployment (multiple replicas behind a load
   * balancer) enforces one real limit per client instead of giving an
   * attacker one free set of attempts per replica.
   */
  class SharedRateLimitStore implements Store {
    windowMs = 0;
    private localCounts = new Map<string, { count: number; resetTime: Date }>();

    init(options: { windowMs: number }) {
      this.windowMs = options.windowMs;
    }

    async increment(key: string) {
      const pgResult = await dbService.incrementRateLimitCounter(key, this.windowMs).catch((err) => {
        console.error('[RateLimit] Postgres counter increment failed, falling back to in-process count:', err);
        return null;
      });
      if (pgResult) {
        return { totalHits: pgResult.totalHits, resetTime: pgResult.resetTime };
      }

      // Fallback path: local in-process counter during transient connection errors.
      // Not shared across instances, but guarantees request servicing is not blocked.
      const now = Date.now();
      const existing = this.localCounts.get(key);
      if (!existing || existing.resetTime.getTime() <= now) {
        const resetTime = new Date(now + this.windowMs);
        this.localCounts.set(key, { count: 1, resetTime });
        return { totalHits: 1, resetTime };
      }
      existing.count += 1;
      return { totalHits: existing.count, resetTime: existing.resetTime };
    }

    async decrement(key: string) {
      await dbService.decrementRateLimitCounter(key).catch(() => {});
      const existing = this.localCounts.get(key);
      if (existing) existing.count = Math.max(0, existing.count - 1);
    }

    async resetKey(key: string) {
      await dbService.resetRateLimitCounter(key).catch(() => {});
      this.localCounts.delete(key);
    }
  }

  // Rate limiting for unauthenticated, credential/code-guessing-sensitive
  // endpoints. Backed by SharedRateLimitStore so limits hold correctly
  // whether this runs as one instance or many.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new SharedRateLimitStore(),
    message: { success: false, error: 'Too many attempts. Please wait a while and try again.' },
  });

  // Institution/account creation is cheaper to abuse for spam than to guess
  // credentials, but still deserves a (looser) ceiling.
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: new SharedRateLimitStore(),
    message: { success: false, error: 'Too many registration attempts from this location. Please try again later.' },
  });

  // Initialize Database Schema (no demo seeding - clean state for institutions)
  await dbService.init();

  // Enforce zero caching on all API endpoints across all browsers, proxies, and intermediaries
  // CSRF defence in depth (on top of the SameSite=Lax session cookie): browsers
  // always attach an Origin (or at least a Referer) header to cross-site
  // state-changing requests, so reject any unsafe-method request whose origin
  // is not this server. Requests with neither header (curl, server-to-server)
  // are not browser CSRF vectors and are allowed. Extra trusted origins can be
  // listed in ALLOWED_ORIGINS (comma-separated), e.g. when behind a proxy.
  const extraAllowedHosts = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      try {
        return new URL(o).host.toLowerCase();
      } catch {
        return o.toLowerCase();
      }
    });
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const source = (req.headers.origin as string) || (req.headers.referer as string);
    if (!source) return next();
    let sourceHost = '';
    try {
      sourceHost = new URL(source).host.toLowerCase();
    } catch {
      return res.status(403).json({ success: false, error: 'Cross-site request blocked (invalid origin).' });
    }
    const ownHosts = [req.headers.host, req.headers['x-forwarded-host']]
      .flatMap((h) => String(h || '').split(','))
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (ownHosts.includes(sourceHost) || extraAllowedHosts.includes(sourceHost)) return next();
    return res.status(403).json({ success: false, error: 'Cross-site request blocked.' });
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Authentication resolution middleware: extracts user & institution from HTTP-only cookie or Bearer header
  async function resolveAuthSession(
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const token = cookieToken || bearerToken;

      if (token) {
        const sessionData = await dbService.getSessionWithUser(token);
        if (sessionData) {
          req.user = sessionData.user;
          req.institution = sessionData.institution;
          req.institutionId = sessionData.user.institution_id;
          req.sessionToken = token;
        }
      }

      next();
    } catch (err) {
      console.error('[Auth Middleware] Session resolution error:', err);
      next();
    }
  }

  // RBAC Guard Middleware generator: verifies session and required permissions
  //
  // IMPORTANT: this validates `requiredPermission` against the canonical
  // ALL_PERMISSION_CODES catalog (src/utils/permissions.ts) the moment the
  // route is registered (i.e. at server startup, since requireAuth(x) is
  // invoked synchronously as an argument to app.post/app.get). This is
  // deliberate: a previous incident had routes calling
  // requireAuth('fees:generate_vouchers') where the real permission code was
  // 'fees.generate' — the mismatch meant isPermissionAllowed() always
  // returned false for non-Admins, silently turning the check into a
  // de facto Admin-only gate with no error or warning anywhere. Throwing here
  // turns that entire bug class into a loud, immediate boot-time failure
  // instead of a silent authorization hole.
  function requireAuth(requiredPermission?: string) {
    if (requiredPermission && !ALL_PERMISSION_CODES.includes(requiredPermission)) {
      throw new Error(
        `[RBAC CONFIG ERROR] requireAuth() was called with unknown permission code '${requiredPermission}'. ` +
          `This code does not exist in ALL_PERMISSION_CODES (src/utils/permissions.ts). ` +
          `Fix the route definition or add the permission to the catalog before deploying.`
      );
    }

    return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
      // 1. Verify user session exists
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required. Please sign in to continue.',
        });
      }

      // 2. Check user status
      if (req.user.status === 'deactivated') {
        return res.status(403).json({
          success: false,
          error: 'Your account has been deactivated. Please contact an administrator.',
        });
      }

      // 3. Multi-tenant isolation: ensure client header matches user institution
      // NOTE: This check intentionally applies to EVERY role, including Admin.
      // "Admin" is a per-institution role (any self-registered user can become
      // an Admin of their own institution), not a cross-tenant super-user role.
      // Exempting Admin here previously allowed any Admin to access/mutate any
      // other institution's data simply by sending a different
      // x-institution-id header. Do not reintroduce a role-based bypass here;
      // a genuine cross-tenant operator role should be modeled separately
      // (e.g. 'SuperAdmin') and explicitly audited, never implied by 'Admin'.
      const requestedTenant =
        (req.headers['x-institution-id'] as string) ||
        (req.body?.institutionId as string) ||
        (req.query?.institutionId as string);

      if (requestedTenant && requestedTenant !== req.user.institution_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: Tenant cross-boundary request forbidden.',
        });
      }

      // 4. Check Granular RBAC Permissions
      if (requiredPermission) {
        const allowed = isPermissionAllowed(
          {
            role: req.user.role as any,
            permissions: req.user.permissions,
          },
          requiredPermission
        );

        if (!allowed) {
          return res.status(403).json({
            success: false,
            error: `Access denied: Insufficient privileges (requires '${requiredPermission}').`,
          });
        }
      }

      next();
    };
  }

  /**
   * Writes a server-generated audit log entry. Operator identity always
   * comes from the authenticated req.user (never from the client body) so
   * the log can't be forged or attributed to the wrong account. Failures to
   * write the audit log are logged but never block or fail the underlying
   * mutation — the audit trail should not become a new source of outages.
   */
  async function recordAudit(
    req: AuthenticatedRequest,
    entry: {
      actionType: string;
      actionTitle: string;
      module: 'Collections' | 'Vouchers' | 'Defaulters' | 'Students' | 'Settings' | 'Security' | 'System';
      description?: string;
      targetId?: string;
      targetLabel?: string;
      month?: string;
      amount?: number;
      previousValue?: string | number;
      newValue?: string | number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const institutionId = req.institutionId as string;
      await dbService.appendAuditLog(institutionId, {
        operatorId: req.user?.id,
        operatorUsername: req.user?.username,
        operatorName: req.user?.full_name,
        operatorRole: req.user?.role,
        ...entry,
      });
    } catch (err) {
      console.error('[Audit] Failed to record audit log entry:', err);
    }
  }

  // Setup edits are audited only for tables that change what students owe or
  // where payments go; classes, families, transport rosters etc. are not.
  const AUDITED_SIMPLE_ENTITY_TABLES = new Set(['fee_templates', 'bank_accounts']);

  // Human-readable naming for audited simple entities. Raw database ids are
  // never used as the visible subject; they go into metadata.recordId, which
  // is only returned to Admins.
  const AUDIT_ENTITY_NOUN: Record<string, string> = { fee_templates: 'Fee Template', bank_accounts: 'Bank Account' };
  const auditEntityLabel = (table: string, rec: any): string => {
    if (!rec) return '';
    if (table === 'bank_accounts') {
      return [rec.bankName, rec.accountTitle].filter(Boolean).join(' – ') || '';
    }
    if (table === 'fee_templates') {
      const scope = rec.studentId ? 'student override' : rec.classId ? 'class override' : 'global';
      const month = rec.month && rec.month !== 'all' ? rec.month : 'all months';
      return rec.label ? `${rec.label} (${scope}, ${month})` : '';
    }
    return rec.name || rec.label || '';
  };

  /**
   * Registers standard GET (list)/POST (create)/PUT :id (update)/DELETE :id
   * routes for one of the "simple entity" tables (classes, families, buses,
   * stops, transport assignments, fee templates, bank accounts). Avoids
   * hand-writing ~28 near-identical route handlers for these structurally
   * simple, institution-scoped collections.
   */
  function registerSimpleEntityCrud(opts: {
    path: string;
    config: SimpleEntityConfig;
    viewPermission: string;
    managePermission: string;
    deletePermission?: string;
    orderBy?: string;
  }) {
    const { path, config, viewPermission, managePermission } = opts;
    const deletePermission = opts.deletePermission || managePermission;

    app.get(path, requireAuth(viewPermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId as string;
        const items = await dbService.listSimpleEntities(config, institutionId, opts.orderBy);
        res.json({ success: true, items });
      } catch (err: any) {
        console.error(`[API] Failed to list ${path}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to list.' });
      }
    });

    app.post(path, requireAuth(managePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId as string;
        const body = { ...(req.body || {}) };
        // Family numbers are issued by the server (atomic sequence) so they can never repeat.
        // A caller-supplied number is kept only when it is a real one (e.g. a restore);
        // blank or the client's provisional marker is replaced.
        if (config.table === 'families') {
          const given = typeof body.familyNo === 'string' ? body.familyNo.trim() : '';
          if (!given || given === 'FAM-PENDING') {
            body.familyNo = await dbService.allocateFamilyNumber(institutionId);
          }
        }
        const created = await dbService.createSimpleEntity(config, institutionId, body);
        dbService.incrementRevision(institutionId);
        if (AUDITED_SIMPLE_ENTITY_TABLES.has(config.table)) {
          await recordAudit(req, {
            actionType: 'settings_change',
            actionTitle: `${AUDIT_ENTITY_NOUN[config.table] || config.table} created`,
            module: 'Settings',
            description: `Created ${(AUDIT_ENTITY_NOUN[config.table] || config.table).toLowerCase()}${auditEntityLabel(config.table, created) ? ` '${auditEntityLabel(config.table, created)}'` : ''}.`,
            targetLabel: auditEntityLabel(config.table, created) || undefined,
            metadata: { recordId: created?.id },
          });
        }
        res.json({ success: true, item: created });
      } catch (err: any) {
        console.error(`[API] Failed to create ${path}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to create.' });
      }
    });

    app.put(`${path}/:id`, requireAuth(managePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId as string;
        const updated = await dbService.updateSimpleEntity(config, institutionId, req.params.id, req.body || {});
        if (!updated) return res.status(404).json({ success: false, error: 'Not found.' });
        dbService.incrementRevision(institutionId);
        if (AUDITED_SIMPLE_ENTITY_TABLES.has(config.table)) {
          await recordAudit(req, {
            actionType: 'settings_change',
            actionTitle: `${AUDIT_ENTITY_NOUN[config.table] || config.table} updated`,
            module: 'Settings',
            description: `Updated ${(AUDIT_ENTITY_NOUN[config.table] || config.table).toLowerCase()}${auditEntityLabel(config.table, updated) ? ` '${auditEntityLabel(config.table, updated)}'` : ''}.`,
            targetLabel: auditEntityLabel(config.table, updated) || undefined,
            metadata: { recordId: updated?.id, changedFields: Object.keys(req.body || {}) },
          });
        }
        res.json({ success: true, item: updated });
      } catch (err: any) {
        console.error(`[API] Failed to update ${path}/${req.params.id}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to update.' });
      }
    });

    app.delete(`${path}/:id`, requireAuth(deletePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId as string;
        // Read the record first so the audit entry can name what was deleted.
        const before = AUDITED_SIMPLE_ENTITY_TABLES.has(config.table)
          ? await dbService.getSimpleEntityById(config, institutionId, req.params.id)
          : null;
        const deleted = await dbService.deleteSimpleEntity(config, institutionId, req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Not found.' });
        dbService.incrementRevision(institutionId);
        if (AUDITED_SIMPLE_ENTITY_TABLES.has(config.table)) {
          await recordAudit(req, {
            actionType: 'settings_change',
            actionTitle: `${AUDIT_ENTITY_NOUN[config.table] || config.table} deleted`,
            module: 'Settings',
            description: `Deleted ${(AUDIT_ENTITY_NOUN[config.table] || config.table).toLowerCase()}${auditEntityLabel(config.table, before) ? ` '${auditEntityLabel(config.table, before)}'` : ''}.`,
            targetLabel: auditEntityLabel(config.table, before) || undefined,
            metadata: { recordId: req.params.id },
          });
        }
        res.json({ success: true });
      } catch (err: any) {
        console.error(`[API] Failed to delete ${path}/${req.params.id}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to delete.' });
      }
    });
  }

  // Apply authentication resolution globally
  app.use(resolveAuthSession);

  // Live SSE clients list partitioned by institution
  interface SseClient {
    id: string;
    institutionId: string;
    res: express.Response;
  }
  let sseClients: SseClient[] = [];
  const MAX_SSE_CLIENTS = 500;

  function broadcastEvent(event: any, targetInstitutionId?: string) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    sseClients.forEach((client) => {
      if (!targetInstitutionId || client.institutionId === targetInstitutionId) {
        try {
          client.res.write(payload);
        } catch {
          // Handled by close listener
        }
      }
    });
  }

  // --- Multi-Tenant Authentication & Onboarding APIs ---

  // 1. Register a new institution (creates School + Admin User X)
  app.post('/api/auth/register-institution', registrationLimiter, async (req, res) => {
    try {
      const {
        schoolName,
        schoolCode,
        currency,
        address,
        phone,
        email,
        regNo,
        adminName,
        adminUsername,
        adminEmail,
        adminPassword,
      } = req.body;

      if (!schoolName || !schoolName.trim()) {
        return res.status(400).json({ success: false, error: 'School / Institution Name is required.' });
      }

      if (!adminUsername || !adminUsername.trim()) {
        return res.status(400).json({ success: false, error: 'Admin username is required.' });
      }

      if (!adminPassword || adminPassword.trim().length < 8 || adminPassword.trim().length > 20) {
        return res.status(400).json({ success: false, error: 'Admin password must be between 8 and 20 characters.' });
      }

      // Use client-provided unique code if available, otherwise generate
      let cleanCode = '';
      if (schoolCode && typeof schoolCode === 'string' && schoolCode.trim()) {
        const candidate = schoolCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        const existing = await dbService.getInstitutionByCode(candidate);
        if (!existing) {
          cleanCode = candidate;
        }
      }

      if (!cleanCode) {
        // Internally generate unique school code (e.g. SCH-102, CMS-482)
        const cleanWords = schoolName.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        let prefix = '';
        if (cleanWords.length >= 3) {
          prefix = (cleanWords[0][0] + cleanWords[1][0] + cleanWords[2][0]).toUpperCase();
        } else if (cleanWords.length === 2) {
          prefix = (cleanWords[0].substring(0, 2) + cleanWords[1].substring(0, 2)).toUpperCase();
        } else if (cleanWords.length === 1) {
          prefix = cleanWords[0].substring(0, 4).toUpperCase();
        } else {
          prefix = 'SCH';
        }
        if (prefix.length < 3) {
          prefix = (prefix + 'SCH').substring(0, 3);
        }

        // Guarantee collision-free uniqueness
        let attempts = 0;
        while (attempts < 50) {
          const randomNum = Math.floor(100 + Math.random() * 900);
          const candidate = `${prefix}-${randomNum}`;
          const existing = await dbService.getInstitutionByCode(candidate);
          if (!existing) {
            cleanCode = candidate;
            break;
          }
          attempts++;
        }
        if (!cleanCode) {
          cleanCode = `${prefix}-${Date.now().toString().slice(-4)}`;
        }
      }

      const passwordHash = await hashPassword(adminPassword.trim());

      const result = await dbService.createInstitution(
        {
          name: schoolName.trim(),
          code: cleanCode,
          registrationNo: regNo?.trim(),
          address: address?.trim(),
          phone: phone?.trim(),
          email: email?.trim() || adminEmail?.trim(),
          currency: CURRENCY_OPTIONS.some((c) => c.code === String(currency || '').trim().toUpperCase())
            ? String(currency).trim().toUpperCase()
            : 'USD',
        },
        {
          fullName: adminName?.trim() || adminUsername.trim(),
          username: adminUsername.trim().toLowerCase(),
          email: adminEmail?.trim(),
          passwordHash,
          permissions: [], // Admin role inherits all permissions
        }
      );

      if (!result.success || !result.institution || !result.admin) {
        return res.status(400).json({ success: false, error: result.error || 'Failed to create institution.' });
      }

      // Mint session token and set HTTP-only cookie
      const sessionToken = mintSecureToken();
      await dbService.createSession(sessionToken, result.admin.id, result.institution.id, SESSION_COOKIE_MAX_AGE);
      setSessionCookie(res, sessionToken);

      // Identity comes from the just-created institution/admin records
      // (server-generated, not raw client input) — recordAudit isn't used
      // here because there's no req.user yet; this request is what
      // creates the very first one.
      await dbService.appendAuditLog(result.institution.id, {
        operatorId: result.admin.id,
        operatorUsername: result.admin.username,
        operatorName: result.admin.full_name,
        operatorRole: result.admin.role,
        actionType: 'operator_security',
        actionTitle: 'Institution Registered',
        module: 'Security',
        description: `Institution '${result.institution.name}' (${result.institution.code}) was registered with admin account '${result.admin.username}'.`,
      });

      const userClientData = {
        id: result.admin.id,
        institutionId: result.institution.id,
        institutionName: result.institution.name,
        username: result.admin.username,
        name: result.admin.full_name,
        role: result.admin.role,
        permissions: result.admin.permissions,
        email: result.admin.email,
        lastLogin: result.admin.last_login_at,
        status: result.admin.status,
      };

      res.json({
        success: true,
        institution: result.institution,
        user: userClientData,
        token: sessionToken,
      });
    } catch (err: any) {
      console.error('[API] Error registering institution:', err);
      res.status(500).json({ success: false, error: err?.message || 'Server registration failure' });
    }
  });

  // 2. Validate Invite Code or Institution Code
  app.post('/api/auth/validate-code', authLimiter, async (req, res) => {
    try {
      const code = (req.body.code || '').trim();
      if (!code) {
        return res.status(400).json({ success: false, error: 'Code is required.' });
      }

      // Check if it matches an operator invite first
      const invite = await dbService.getInviteByCode(code);
      if (invite) {
        if (invite.status === 'claimed') {
          return res.status(400).json({ success: false, error: 'This invite code has already been claimed.' });
        }
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          return res.status(400).json({ success: false, error: 'This invite code has expired.' });
        }
        const institution = await dbService.getInstitutionById(invite.institution_id);
        return res.json({
          success: true,
          type: 'invite',
          invite: {
            id: invite.id,
            inviteCode: invite.invite_code,
            fullName: invite.full_name,
            assignedRole: invite.assigned_role,
            permissions: invite.permissions,
          },
          institution: institution
            ? {
                id: institution.id,
                name: institution.name,
                code: institution.code,
                currency: institution.currency,
                logoUrl: institution.logo_url,
              }
            : null,
        });
      }

      // Otherwise check if it matches an institution shortcode
      const institution = await dbService.getInstitutionByCode(code);
      if (institution) {
        return res.json({
          success: true,
          type: 'institution',
          institution: {
            id: institution.id,
            name: institution.name,
            code: institution.code,
            currency: institution.currency,
            address: institution.address,
            logoUrl: institution.logo_url,
          },
        });
      }

      return res.status(404).json({ success: false, error: `No institution or active invite found matching '${code}'.` });
    } catch (err: any) {
      console.error('[API] Error validating code:', err);
      res.status(500).json({ success: false, error: 'Failed to validate code.' });
    }
  });

  // 3. Register a user connecting to an existing institution (via invite code or institution code)
  app.post('/api/auth/register-user', authLimiter, async (req, res) => {
    try {
      const { code, fullName, username, password, email } = req.body;

      if (!code || !code.trim()) {
        return res.status(400).json({ success: false, error: 'Institution code or Invite code is required.' });
      }
      if (!username || !username.trim()) {
        return res.status(400).json({ success: false, error: 'Username is required.' });
      }
      if (!password || password.trim().length < 8 || password.trim().length > 20) {
        return res.status(400).json({ success: false, error: 'Password must be between 8 and 20 characters.' });
      }

      const cleanCode = code.trim();
      let targetInstitutionId: string = '';
      let assignedRole: string = 'Viewer';
      let permissions: string[] = [];
      let isInvite = false;

      // Check invite code
      const invite = await dbService.getInviteByCode(cleanCode);
      if (invite && invite.status === 'pending') {
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          return res.status(400).json({ success: false, error: 'This invite code has expired.' });
        }
        targetInstitutionId = invite.institution_id;
        assignedRole = invite.assigned_role;
        permissions = invite.permissions || [];
        isInvite = true;
      } else {
        // Check institution code. Anyone who knows/guesses a school's public
        // join code can reach this branch with no admin approval, so the
        // resulting account must be given the least-privilege role.
        // IMPORTANT: `permissions` is intentionally left as [] here (it is
        // only ever populated in the invite branch above, from permissions
        // an admin explicitly assigned). Do NOT "fix" this by deriving
        // permissions from ROLE_PRESET_PERMISSIONS[assignedRole] — that
        // would silently grant full role capabilities to every
        // unauthenticated self-joined account. `assignedRole` here exists
        // only as a display label, and must stay consistent with the empty
        // permission set, hence 'Viewer' rather than 'Accountant'.
        const institution = await dbService.getInstitutionByCode(cleanCode);
        if (!institution) {
          return res.status(404).json({ success: false, error: 'Invalid institution code or invite code.' });
        }
        targetInstitutionId = institution.id;
        assignedRole = 'Viewer'; // Least-privilege default for unapproved self-joins
      }

      const passwordHash = await hashPassword(password.trim());
      const createRes = await dbService.createUser({
        institutionId: targetInstitutionId,
        username: username.trim().toLowerCase(),
        email: email?.trim(),
        passwordHash,
        fullName: fullName?.trim() || username.trim(),
        role: assignedRole,
        permissions,
        createdBy: isInvite ? 'invite_claim' : 'direct_connect',
      });

      if (!createRes.success || !createRes.user) {
        return res.status(400).json({ success: false, error: createRes.error || 'Failed to create account.' });
      }

      if (isInvite) {
        await dbService.claimInvite(cleanCode);
      }

      const institution = await dbService.getInstitutionById(targetInstitutionId);

      // Mint session token and set HTTP-only cookie
      const sessionToken = mintSecureToken();
      await dbService.createSession(sessionToken, createRes.user.id, targetInstitutionId, SESSION_COOKIE_MAX_AGE);
      setSessionCookie(res, sessionToken);

      // Identity comes from the just-created user record — recordAudit
      // isn't used here because there's no req.user yet at this point.
      await dbService.appendAuditLog(targetInstitutionId, {
        operatorId: createRes.user.id,
        operatorUsername: createRes.user.username,
        operatorName: createRes.user.full_name,
        operatorRole: createRes.user.role,
        actionType: 'operator_security',
        actionTitle: 'Operator Account Registered',
        module: 'Security',
        description: isInvite
          ? `Operator account '${createRes.user.username}' was registered by claiming an invite (role: ${createRes.user.role}).`
          : `Operator account '${createRes.user.username}' self-joined via institution code (role: ${createRes.user.role}).`,
      });

      const userClientData = {
        id: createRes.user.id,
        institutionId: targetInstitutionId,
        institutionName: institution?.name || '',
        username: createRes.user.username,
        name: createRes.user.full_name,
        role: createRes.user.role,
        permissions: createRes.user.permissions,
        email: createRes.user.email,
        lastLogin: createRes.user.last_login_at,
        status: createRes.user.status,
      };

      res.json({
        success: true,
        user: userClientData,
        institution,
        token: sessionToken,
      });
    } catch (err: any) {
      console.error('[API] Error registering user to institution:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to complete registration.' });
    }
  });

  // 4. Multi-Tenant Login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { username, password, institutionCode } = req.body;
      const cleanUsername = (username || '').trim().toLowerCase();
      const cleanCode = (institutionCode || '').trim().toUpperCase();

      if (!cleanUsername || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
      }

      if (!cleanCode) {
        return res.status(400).json({
          success: false,
          error: 'Institution Code is required. Please enter your Institution Code to sign in.',
        });
      }

      const inst = await dbService.getInstitutionByCode(cleanCode);
      if (!inst) {
        return res.status(401).json({
          success: false,
          error: `Institution Code '${cleanCode}' was not found. Please verify your Institution Code.`,
        });
      }

      const dbUser = await dbService.getUserByUsername(cleanUsername, inst.id);
      if (!dbUser) {
        return res.status(401).json({
          success: false,
          error: `User '${cleanUsername}' was not found in institution '${inst.name}'. Please verify your username and institution code.`,
        });
      }

      const valid = await verifyPassword(password, dbUser.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid password. Please try again.' });
      }

      if (dbUser.status === 'deactivated') {
        return res.status(403).json({
          success: false,
          error: 'This account has been deactivated. Contact your institution administrator.',
        });
      }

      // Update last login
      const now = new Date().toISOString();
      await dbService.updateUser(dbUser.id, { last_login_at: now });

      const institution = await dbService.getInstitutionById(dbUser.institution_id);

      // Mint session token and set HTTP-only cookie
      const sessionToken = mintSecureToken();
      await dbService.createSession(sessionToken, dbUser.id, dbUser.institution_id, SESSION_COOKIE_MAX_AGE);
      setSessionCookie(res, sessionToken);

      // Identity here comes from dbUser, which was only reached after a
      // successful password check above — server-validated, not
      // client-supplied, so this doesn't reopen the forgery concern
      // recordAudit's operator-identity restriction exists to prevent.
      // recordAudit itself isn't used because there's no req.user yet at
      // this point in the request (that's what this call is establishing).
      await dbService.appendAuditLog(dbUser.institution_id, {
        operatorId: dbUser.id,
        operatorUsername: dbUser.username,
        operatorName: dbUser.full_name,
        operatorRole: dbUser.role,
        actionType: 'operator_security',
        actionTitle: 'Operator Login',
        module: 'Security',
        description: `Operator '${dbUser.username}' logged in.`,
      });

      const userClientData = {
        id: dbUser.id,
        institutionId: dbUser.institution_id,
        institutionName: institution?.name || '',
        username: dbUser.username,
        name: dbUser.full_name,
        role: dbUser.role,
        permissions: dbUser.permissions,
        email: dbUser.email,
        lastLogin: now,
        status: dbUser.status,
      };

      res.json({
        success: true,
        user: userClientData,
        institution,
        token: sessionToken,
      });
    } catch (err: any) {
      console.error('[API] Login error:', err);
      res.status(500).json({ success: false, error: 'Authentication service error.' });
    }
  });

  // Current authenticated user session inspector
  app.get('/api/auth/me', async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const userClientData = {
      id: req.user.id,
      institutionId: req.user.institution_id,
      institutionName: req.institution?.name || '',
      username: req.user.username,
      name: req.user.full_name,
      role: req.user.role,
      permissions: req.user.permissions,
      email: req.user.email,
      lastLogin: req.user.last_login_at,
      status: req.user.status,
    };
    res.json({
      success: true,
      user: userClientData,
      institution: req.institution,
    });
  });

  // Per-user UI preferences (theme + sidebar), persisted in the database
  const THEME_COLORS = ['teal', 'navy', 'indigo', 'emerald', 'amber', 'rose', 'slate'];
  const SIDEBAR_THEMES = ['dark', 'light', 'branded'];

  app.get('/api/auth/preferences', async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    try {
      const preferences = await dbService.getUserPreferences(req.user.id);
      res.json({ success: true, preferences });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to load preferences' });
    }
  });

  app.put('/api/auth/preferences', async (req: AuthenticatedRequest, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    try {
      const body = req.body || {};
      const patch: Record<string, any> = {};
      if (body.themeConfig && typeof body.themeConfig === 'object') {
        const t = body.themeConfig;
        const themeConfig: Record<string, string> = {};
        if (THEME_COLORS.includes(t.color)) themeConfig.color = t.color;
        if (SIDEBAR_THEMES.includes(t.sidebarTheme)) themeConfig.sidebarTheme = t.sidebarTheme;
        if (Object.keys(themeConfig).length > 0) patch.themeConfig = themeConfig;
      }
      if (typeof body.sidebarCollapsed === 'boolean') patch.sidebarCollapsed = body.sidebarCollapsed;
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid preferences supplied.' });
      }
      const current = await dbService.getUserPreferences(req.user.id);
      if (patch.themeConfig) patch.themeConfig = { ...(current.themeConfig || {}), ...patch.themeConfig };
      const preferences = await dbService.updateUserPreferences(req.user.id, patch);
      res.json({ success: true, preferences });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to save preferences' });
    }
  });

  // Authenticated Logout: revokes session from database and clears HTTP-only cookie
  app.post('/api/auth/logout', async (req: AuthenticatedRequest, res) => {
    try {
      if (req.sessionToken) {
        await dbService.deleteSession(req.sessionToken);
      }
      clearSessionCookie(res);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (err: any) {
      clearSessionCookie(res);
      res.json({ success: true });
    }
  });

  // 5. List Institutions (for discovery / joining)
  // Public, unauthenticated institution directory. Deliberately does NOT
  // include `code` — that value is a de facto self-registration credential
  // (see /api/auth/register-user's institution-code branch) and must not be
  // handed out to anyone who can call this endpoint. (Verified: no current
  // client code path calls this for a "browse schools" UI, so omitting the
  // code here is not a functional regression.)
  // 6. Operator Invites Management
  function toClientUser(u: DbUser) {
    return {
      id: u.id,
      institutionId: u.institution_id,
      username: u.username,
      name: u.full_name,
      role: u.role,
      permissions: u.permissions,
      email: u.email,
      lastLogin: u.last_login_at,
      status: u.status,
    };
  }

  // List users for this institution (Users & Permissions panel)
  app.get('/api/users', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const dbUsers = await dbService.listUsers(institutionId);
      res.json({ success: true, users: dbUsers.map(toClientUser) });
    } catch (err: any) {
      console.error('[API] Failed to list users:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list users.' });
    }
  });

  // Create an operator account directly (as opposed to the invite-code
  // self-join flow). Requires the same permission as everything else on
  // this panel.
  app.post('/api/users', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { username, name, email, password, role, permissions } = req.body || {};
      if (!username || !username.trim()) {
        return res.status(400).json({ success: false, error: 'Username is required.' });
      }
      if (!password || password.trim().length < 8 || password.trim().length > 20) {
        return res.status(400).json({ success: false, error: 'Password must be between 8 and 20 characters.' });
      }
      if (!role) {
        return res.status(400).json({ success: false, error: 'Role is required.' });
      }

      const passwordHash = await hashPassword(password.trim());
      const result = await dbService.createUser({
        institutionId,
        username: username.trim(),
        email,
        passwordHash,
        fullName: name?.trim() || username.trim(),
        role,
        permissions: Array.isArray(permissions) ? permissions : [],
        createdBy: req.user?.full_name || 'Admin',
      });

      if (!result.success || !result.user) {
        return res.status(409).json({ success: false, error: result.error || 'Failed to create user.' });
      }

      await recordAudit(req, {
        actionType: 'operator_security',
        actionTitle: 'Operator Account Created',
        module: 'Security',
        description: `Created operator account '${result.user.username}' with role '${result.user.role}'.`,
        targetId: result.user.username,
        targetLabel: result.user.full_name,
        metadata: { recordId: result.user.id, role: result.user.role, permissions: result.user.permissions },
      });
      dbService.incrementRevision(institutionId);

      res.json({ success: true, user: toClientUser(result.user) });
    } catch (err: any) {
      console.error('[API] Failed to create user:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to create user.' });
    }
  });

  // Update an operator account: name/email/role/permissions/status
  // (activate/deactivate) and optionally reset the password. This is the
  // route that actually has to exist for permission edits and account
  // deactivation to take effect — previously these only updated local
  // client state and silently never reached the server at all.
  app.put('/api/users/:id', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const target = await dbService.getUserById(req.params.id);
      if (!target || target.institution_id !== institutionId) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }
      if (target.id === req.user!.id && req.body.status === 'deactivated') {
        return res.status(400).json({ success: false, error: 'You cannot deactivate your own account.' });
      }

      const updates: Partial<DbUser> = {};
      if (req.body.name !== undefined) updates.full_name = String(req.body.name).trim();
      if (req.body.username !== undefined) {
        const newUsername = String(req.body.username).trim().toLowerCase();
        if (!newUsername) {
          return res.status(400).json({ success: false, error: 'Username cannot be empty.' });
        }
        if (newUsername !== target.username) {
          const existing = await dbService.getUserByUsername(newUsername, institutionId);
          if (existing) {
            return res.status(409).json({ success: false, error: `Username '${newUsername}' is already taken.` });
          }
        }
        updates.username = newUsername;
      }
      if (req.body.email !== undefined) updates.email = req.body.email ? String(req.body.email) : '';
      if (req.body.role !== undefined) updates.role = req.body.role;
      if (Array.isArray(req.body.permissions)) updates.permissions = req.body.permissions;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.password) {
        const pTrimmed = String(req.body.password).trim();
        if (pTrimmed.length < 8 || pTrimmed.length > 20) {
          return res.status(400).json({ success: false, error: 'Password must be between 8 and 20 characters.' });
        }
        updates.password_hash = await hashPassword(pTrimmed);
      }

      await dbService.updateUser(req.params.id, updates);
      const updated = await dbService.getUserById(req.params.id);

      await recordAudit(req, {
        actionType: 'operator_security',
        actionTitle:
          req.body.status === 'deactivated'
            ? 'Operator Account Deactivated'
            : req.body.status === 'active' && target.status === 'deactivated'
            ? 'Operator Account Reactivated'
            : req.body.password
            ? 'Operator Password Reset'
            : 'Operator Account Updated',
        module: 'Security',
        description: `Updated operator account '${target.username}'.`,
        targetId: target.username,
        targetLabel: target.full_name,
        metadata: { recordId: target.id, changedFields: Object.keys(updates) },
      });
      dbService.incrementRevision(institutionId);

      res.json({ success: true, user: updated ? toClientUser(updated) : undefined });
    } catch (err: any) {
      console.error('[API] Failed to update user:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to update user.' });
    }
  });

  app.delete('/api/users/:id', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
      }
      const target = await dbService.getUserById(req.params.id);
      if (!target || target.institution_id !== institutionId) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }
      const deleted = await dbService.deleteUser(institutionId, req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: 'User not found.' });

      await recordAudit(req, {
        actionType: 'operator_security',
        actionTitle: 'Operator Account Deleted',
        module: 'Security',
        description: `Deleted operator account '${target.username}'.`,
        targetId: target.username,
        targetLabel: target.full_name,
        metadata: { recordId: target.id },
      });
      dbService.incrementRevision(institutionId);

      res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Failed to delete user:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete user.' });
    }
  });

  app.post('/api/invites/create', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId;
      const { fullName, assignedRole, permissions } = req.body;

      if (!institutionId) {
        return res.status(400).json({ success: false, error: 'Institution ID is required.' });
      }
      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ success: false, error: 'Staff member full name is required.' });
      }

      const result = await dbService.createInvite({
        institutionId,
        fullName: fullName.trim(),
        assignedRole: assignedRole || 'Accountant',
        permissions: permissions || [],
        createdBy: req.user?.full_name || 'Admin',
      });

      if (!result.success || !result.invite) {
        return res.status(400).json({ success: false, error: result.error || 'Failed to create invite.' });
      }

      await recordAudit(req, {
        actionType: 'operator_security',
        actionTitle: 'Operator Invite Created',
        module: 'Security',
        description: `Created an invite for ${fullName.trim()} with role '${assignedRole || 'Accountant'}' and ${(permissions || []).length} explicit permission(s).`,
        targetLabel: fullName.trim(),
        metadata: { assignedRole: assignedRole || 'Accountant', permissions: permissions || [] },
      });
      dbService.incrementRevision(institutionId);

      const inst = await dbService.getInstitutionById(institutionId);

      res.json({
        success: true,
        invite: {
          ...result.invite,
          institutionName: inst?.name,
          institutionCode: inst?.code,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to create invite code.' });
    }
  });

  app.get('/api/invites/list', requireAuth('users.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || (req.query.institutionId as string);
      if (!institutionId) {
        return res.json({ success: true, invites: [] });
      }
      const invites = await dbService.listInvites(institutionId);
      const inst = await dbService.getInstitutionById(institutionId);
      const enriched = invites.map((inv) => ({
        ...inv,
        institutionName: inst?.name,
        institutionCode: inst?.code,
      }));
      res.json({ success: true, invites: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to list invites.' });
    }
  });

  // --- Health, Sync & State APIs (Tenant-Scoped) ---

  // Health check endpoint with live database ping & pool metrics
  // Health: unauthenticated callers (load balancers, monitors) only get overall
  // status; the engine, pool and tenant details need a signed-in session.
  app.get('/api/health', async (req: AuthenticatedRequest, res) => {
    const pingResult = await dbService.ping();
    const isHealthy = pingResult.healthy;
    const statusCode = isHealthy ? 200 : 503;

    if (!req.user) {
      return res.status(statusCode).json({
        status: isHealthy ? 'ok' : 'degraded',
        database: { healthy: pingResult.healthy },
        timestamp: new Date().toISOString(),
      });
    }

    const revInfo = dbService.getRevisionInfo(req.institutionId as string);
    res.status(statusCode).json({
      status: isHealthy ? 'ok' : 'degraded',
      engine: pingResult.engine,
      database: {
        healthy: pingResult.healthy,
        latencyMs: pingResult.latencyMs,
        strictPostgres: pingResult.strictPostgres,
        pool: pingResult.pool,
        error: pingResult.error,
      },
      revision: revInfo.revision,
      lastModified: revInfo.lastModified,
      connectedClients: sseClients.length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Revision check endpoint for lightweight polling
  app.get('/api/revision', requireAuth(), (req: AuthenticatedRequest, res) => {
    res.json({
      success: true,
      ...dbService.getRevisionInfo(req.institutionId as string),
    });
  });

  // Server-Sent Events (SSE) stream for instant real-time multi-user synchronization
  app.get('/api/events', requireAuth(), (req: AuthenticatedRequest, res) => {
    if (sseClients.length >= MAX_SSE_CLIENTS) {
      return res.status(503).json({ success: false, error: 'Too many active connections. Please try again shortly.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = (req.query.clientId as string) || Math.random().toString(36).substring(2, 10);
    const institutionId = req.institutionId!;
    const clientRecord: SseClient = { id: clientId, institutionId, res };
    sseClients.push(clientRecord);

    // Initial greeting handshake
    const revInfo = dbService.getRevisionInfo(institutionId);
    res.write(`data: ${JSON.stringify({ type: 'handshake', revision: revInfo.revision, clientId, institutionId })}\n\n`);

    // Keepalive ping every 25s
    const pingInterval = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(pingInterval);
      sseClients = sseClients.filter((c) => c !== clientRecord);
    });
  });

  // --- Simple-entity CRUD (classes, families, transport, fee templates, bank accounts) ---

  registerSimpleEntityCrud({
    path: '/api/classes',
    config: CLASS_ENTITY_CONFIG,
    viewPermission: 'classes.view',
    managePermission: 'classes.manage',
    deletePermission: 'classes.delete',
    orderBy: 'sort_order ASC, name ASC',
  });
  registerSimpleEntityCrud({
    path: '/api/families',
    config: FAMILY_ENTITY_CONFIG,
    viewPermission: 'families.view',
    managePermission: 'families.manage',
    deletePermission: 'families.delete',
    orderBy: 'head_name ASC',
  });
  registerSimpleEntityCrud({
    path: '/api/transport/buses',
    config: BUS_ENTITY_CONFIG,
    viewPermission: 'transport.view',
    managePermission: 'transport.manage',
    deletePermission: 'transport.delete',
    orderBy: 'sort_order ASC',
  });
  registerSimpleEntityCrud({
    path: '/api/transport/stops',
    config: STOP_ENTITY_CONFIG,
    viewPermission: 'transport.view',
    managePermission: 'transport.manage',
    deletePermission: 'transport.delete',
    orderBy: 'sort_order ASC',
  });
  registerSimpleEntityCrud({
    path: '/api/transport/assignments',
    config: TRANSPORT_ASSIGNMENT_ENTITY_CONFIG,
    viewPermission: 'transport.view',
    managePermission: 'transport.manage',
    deletePermission: 'transport.delete',
  });
  registerSimpleEntityCrud({
    path: '/api/fee-templates',
    config: FEE_TEMPLATE_ENTITY_CONFIG,
    viewPermission: 'settings.view',
    managePermission: 'settings.manage',
    orderBy: 'sort_order ASC',
  });
  registerSimpleEntityCrud({
    path: '/api/bank-accounts',
    config: BANK_ACCOUNT_ENTITY_CONFIG,
    viewPermission: 'settings.view',
    managePermission: 'settings.manage',
  });

  // --- Students: search/paginate/CRUD, replacing the old "ship the whole roster" pattern ---

  app.get('/api/students', requireAuth('students.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { q, classId, familyId, status, ids, page, pageSize } = req.query;
      const { students, total } = await dbService.searchStudents(institutionId, {
        q: typeof q === 'string' ? q : undefined,
        classId: typeof classId === 'string' ? classId : undefined,
        familyId: typeof familyId === 'string' ? familyId : undefined,
        status: typeof status === 'string' ? status : undefined,
        ids: typeof ids === 'string' ? ids.split(',').filter(Boolean) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, students, total });
    } catch (err: any) {
      console.error('[API] Failed to search students:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to search students.' });
    }
  });

  app.post('/api/students', requireAuth('students.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const body = req.body || {};
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ success: false, error: 'Student name is required.' });
      }
      if (!body.regNo || !String(body.regNo).trim()) {
        return res.status(400).json({ success: false, error: 'Student registration number (Reg #) is required.' });
      }
      const duplicate = await dbService.findDuplicateStudent(institutionId, {
        studentNationalId: body.studentNationalId,
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: `Student ID "${body.studentNationalId}" already exists in system with '${duplicate.existingStudentName}'.`,
          field: duplicate.field,
        });
      }
      const created = await dbService.createStudent(institutionId, body);
      dbService.incrementRevision(institutionId);
      res.json({ success: true, student: created });
    } catch (err: any) {
      console.error('[API] Failed to create student:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to create student.' });
    }
  });

  app.put('/api/students/:id', requireAuth('students.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const body = req.body || {};
      if (body.studentNationalId !== undefined) {
        const duplicate = await dbService.findDuplicateStudent(
          institutionId,
          { studentNationalId: body.studentNationalId },
          req.params.id
        );
        if (duplicate) {
          return res.status(409).json({
            success: false,
            error: `Student ID "${body.studentNationalId}" already exists in system with '${duplicate.existingStudentName}'.`,
            field: duplicate.field,
          });
        }
      }
      const updated = await dbService.updateStudent(institutionId, req.params.id, body);
      if (!updated) return res.status(404).json({ success: false, error: 'Student not found.' });
      dbService.incrementRevision(institutionId);
      res.json({ success: true, student: updated });
    } catch (err: any) {
      console.error('[API] Failed to update student:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to update student.' });
    }
  });

  app.delete('/api/students/:id', requireAuth('students.delete'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      // Fetched only for the audit-log description below; it plays no
      // part in the delete decision itself, which is made atomically by
      // deleteStudentIfNoVouchers (see its doc comment for why the
      // check and the delete can't safely be two separate round-trips).
      const studentToDelete = await dbService.getStudentById(institutionId, req.params.id);
      const { deleted, blockedByVouchers } = await dbService.deleteStudentIfNoVouchers(institutionId, req.params.id);
      if (!deleted) {
        if (blockedByVouchers) {
          return res.status(409).json({
            success: false,
            error: 'Cannot delete student: fee voucher record(s) exist for this student. Delete the vouchers first.',
          });
        }
        return res.status(404).json({ success: false, error: 'Student not found.' });
      }
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'student_deletion',
        actionTitle: 'Student Record Deleted',
        module: 'Students',
        description: `Deleted student record${studentToDelete ? ` for ${studentToDelete.name} (${studentToDelete.regNo})` : ` ${req.params.id}`}.`,
        targetId: studentToDelete?.regNo || req.params.id,
        targetLabel: studentToDelete?.name,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error('[API] Failed to delete student:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete student.' });
    }
  });

  // --- Vouchers / Collections / Transactions (read side — writes go through the dedicated transactional endpoints below) ---

  app.get('/api/vouchers', requireAuth('fees.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { studentId, classId, month, status, page, pageSize, window: win, monthFrom, monthBefore } = req.query;
      const { vouchers, total, windowStart } = await dbService.listVouchers(institutionId, {
        window: win === '1' || win === 'true',
        monthFrom: typeof monthFrom === 'string' ? monthFrom : undefined,
        monthBefore: typeof monthBefore === 'string' ? monthBefore : undefined,
        studentId: typeof studentId === 'string' ? studentId : undefined,
        classId: typeof classId === 'string' ? classId : undefined,
        month: typeof month === 'string' ? month : undefined,
        status: typeof status === 'string' ? status : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, vouchers, total, windowStart });
    } catch (err: any) {
      console.error('[API] Failed to list vouchers:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list vouchers.' });
    }
  });

  app.get('/api/collections', requireAuth('fees.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { dateFrom, dateTo, page, pageSize, studentId, window: win, monthFrom, monthBefore } = req.query;
      const { collections, total } = await dbService.listCollections(institutionId, {
        studentId: typeof studentId === 'string' ? studentId : undefined,
        window: win === '1' || win === 'true',
        monthFrom: typeof monthFrom === 'string' ? monthFrom : undefined,
        monthBefore: typeof monthBefore === 'string' ? monthBefore : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, collections, total });
    } catch (err: any) {
      console.error('[API] Failed to list collections:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list collections.' });
    }
  });

  app.get('/api/transactions', requireAuth('fees.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { studentId, voucherId, collectionId, dateFrom, dateTo, page, pageSize, window: win, monthFrom, monthBefore } = req.query;
      const { transactions, total } = await dbService.listTransactions(institutionId, {
        window: win === '1' || win === 'true',
        monthFrom: typeof monthFrom === 'string' ? monthFrom : undefined,
        monthBefore: typeof monthBefore === 'string' ? monthBefore : undefined,
        studentId: typeof studentId === 'string' ? studentId : undefined,
        voucherId: typeof voucherId === 'string' ? voucherId : undefined,
        collectionId: typeof collectionId === 'string' ? collectionId : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, transactions, total });
    } catch (err: any) {
      console.error('[API] Failed to list transactions:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list transactions.' });
    }
  });

  // --- Audit Logs (read-only from the client's perspective — always server-generated) ---

  const qStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const qInt = (v: unknown): number | undefined => {
    const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const isIsoDate = (v: string | undefined) => !v || !Number.isNaN(Date.parse(v));

  app.get('/api/audit-logs', requireAuth('audit.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const dateFrom = qStr(req.query.dateFrom);
      const dateTo = qStr(req.query.dateTo);
      if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) {
        return res.status(400).json({ success: false, error: 'Invalid date filter.' });
      }
      // Bulk export pulls the same data in chunks; it needs its own permission.
      if (req.query.export === '1' && !isPermissionAllowed(req.user as any, 'audit.export')) {
        return res.status(403).json({ success: false, error: 'You do not have permission to export the audit trail.' });
      }
      const actionTypeRaw = qStr(req.query.actionType);
      const { logs, total } = await dbService.listAuditLogs(institutionId, {
        module: qStr(req.query.module),
        actionType: actionTypeRaw ? actionTypeRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        operator: qStr(req.query.operator),
        month: qStr(req.query.month),
        q: qStr(req.query.q),
        sort: qStr(req.query.sort),
        dir: qStr(req.query.dir),
        dateFrom,
        dateTo,
        page: qInt(req.query.page),
        pageSize: qInt(req.query.pageSize),
      });
      // Internal record ids are for Admins only.
      const safeLogs =
        req.user?.role === 'Admin'
          ? logs
          : logs.map((l: any) => {
              if (!l?.metadata || typeof l.metadata !== 'object' || !('recordId' in l.metadata)) return l;
              const { recordId: _omit, ...rest } = l.metadata;
              return { ...l, metadata: rest };
            });
      res.json({ success: true, logs: safeLogs, total });
    } catch (err: any) {
      console.error('[API] Failed to list audit logs:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list audit logs.' });
    }
  });

  app.get('/api/audit-logs/summary', requireAuth('audit.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const dateFrom = qStr(req.query.dateFrom);
      const dateTo = qStr(req.query.dateTo);
      if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) {
        return res.status(400).json({ success: false, error: 'Invalid date filter.' });
      }
      const summary = await dbService.getAuditLogSummary(institutionId, { dateFrom, dateTo });
      res.json({ success: true, ...summary });
    } catch (err: any) {
      console.error('[API] Failed to summarise audit logs:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to summarise audit logs.' });
    }
  });

  // Manual purge of rows older than a cutoff. Security / restore / cleanup
  // entries are always kept. dryRun returns only the count.
  app.post('/api/audit-logs/purge', requireAuth('settings.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { olderThanMonths, dryRun } = req.body || {};
      const months = Number(olderThanMonths);
      if (!Number.isInteger(months) || months < 1 || months > 120) {
        return res.status(400).json({ success: false, error: 'olderThanMonths must be a whole number between 1 and 120.' });
      }
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);
      const cutoff = cutoffDate.toISOString();
      const count = await dbService.purgeAuditLogs(institutionId, cutoff, !!dryRun);
      if (!dryRun) {
        await recordAudit(req, {
          actionType: 'settings_change',
          actionTitle: 'Audit Logs Purged',
          module: 'Settings',
          description: `Manually purged ${count} audit log entr${count === 1 ? 'y' : 'ies'} older than ${months} month(s) (before ${cutoff}). Security, restore and cleanup entries were kept.`,
          metadata: { deleted: count, cutoff, olderThanMonths: months },
        });
      }
      res.json({ success: true, count, cutoff, dryRun: !!dryRun });
    } catch (err: any) {
      console.error('[API] Failed to purge audit logs:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to purge audit logs.' });
    }
  });

  // Browser-originated events that have no server-side mutation endpoint of
  // their own (e.g. undoing a carry-forward, fine adjustments at collection).
  // Operator identity comes from the session; only a fixed set of
  // type/module pairs is accepted and text fields are length-capped.
  const CLIENT_AUDIT_EVENTS: Record<string, string[]> = {
    carry_forward: ['Defaulters'],
    fine_modification: ['Collections', 'Vouchers'],
    system_cleanup: ['System'],
  };
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  app.post('/api/audit-logs/client-event', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const b = req.body || {};
      const mods = CLIENT_AUDIT_EVENTS[String(b.actionType)];
      if (!mods || !mods.includes(String(b.module))) {
        return res.status(400).json({ success: false, error: 'Unsupported audit event.' });
      }
      const meta = b.metadata && typeof b.metadata === 'object' ? b.metadata : undefined;
      await recordAudit(req, {
        actionType: b.actionType,
        actionTitle: clip(b.actionTitle, 255) || 'Event',
        module: b.module,
        description: clip(b.description, 2000),
        targetId: clip(b.targetId, 128),
        targetLabel: clip(b.targetLabel, 255),
        month: clip(b.month, 16),
        amount: typeof b.amount === 'number' && Number.isFinite(b.amount) ? b.amount : undefined,
        previousValue: clip(String(b.previousValue ?? ''), 1000) || undefined,
        newValue: clip(String(b.newValue ?? ''), 1000) || undefined,
        metadata: meta && JSON.stringify(meta).length <= 4000 ? meta : undefined,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to record event.' });
    }
  });

  // --- Student Account History (ledger adjustment notes) ---

  app.get('/api/student-account-history', requireAuth('students.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const { studentId, page, pageSize } = req.query;
      const { entries, total } = await dbService.listStudentAccountHistory(institutionId, {
        studentId: typeof studentId === 'string' ? studentId : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, entries, total });
    } catch (err: any) {
      console.error('[API] Failed to list student account history:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list history.' });
    }
  });

  // NOTE: intentionally does not also call recordAudit() — this endpoint
  // appends to the student_account_history table, which is itself an
  // append-only, per-student timeline (promotions, transport changes,
  // etc.) already carrying the operator's name/role on every entry. It
  // isn't a generic mutation in the same sense as the endpoints that
  // record to the shared operator audit_logs table, so duplicating each
  // entry there would be redundant rather than additive.
  app.post('/api/student-account-history', requireAuth('students.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const body = req.body || {};
      if (!body.studentId) {
        return res.status(400).json({ success: false, error: 'studentId is required.' });
      }
      const entry = await dbService.appendStudentAccountHistory(institutionId, {
        ...body,
        operatorName: req.user?.full_name,
        operatorRole: req.user?.role,
      });
      dbService.incrementRevision(institutionId);
      res.json({ success: true, entry });
    } catch (err: any) {
      console.error('[API] Failed to append student account history:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to add history entry.' });
    }
  });

  // --- Locked Months (month-end close) ---

  app.get('/api/locked-months', requireAuth('fees.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const details = await dbService.listLockedMonthDetails(institutionId);
      res.json({ success: true, months: details.map((d: any) => d.month), details });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to list locked months.' });
    }
  });

  app.post('/api/locked-months', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const month = String(req.body?.month || '');
      const notes = String(req.body?.notes || '').trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ success: false, error: 'month must be in YYYY-MM format.' });
      }
      const lockRes = await dbService.lockMonth(institutionId, month, {
        notes,
        lockedBy: req.user?.username,
        lockedByName: req.user?.full_name,
      });
      if (lockRes.openCount) {
        const sample = (lockRes.openSample || []).join(', ');
        return res.status(409).json({
          success: false,
          error:
            `${month} cannot be locked: ${lockRes.openCount} voucher(s) still have an unpaid balance (${sample}${lockRes.openCount > (lockRes.openSample || []).length ? ', …' : ''}). ` +
            `Collect payment or carry the balance forward first.`,
          openCount: lockRes.openCount,
          openSample: lockRes.openSample,
        });
      }
      if (!lockRes.created) return res.status(409).json({ success: false, error: `${month} is already locked.` });
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'month_closure',
        actionTitle: 'Month Locked',
        module: 'Defaulters',
        description: `Locked ${month} against further changes.${notes ? ` Comment: ${notes}` : ''}`,
        targetId: month,
        month,
        metadata: { notes },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to lock month.' });
    }
  });

  app.delete('/api/locked-months/:month', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      if (req.user?.role !== 'Admin') {
        return res.status(403).json({ success: false, error: 'Only an Admin can unlock a month.' });
      }
      const month = req.params.month;
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ success: false, error: 'A reason is required to unlock a month.' });
      const lockedList = await dbService.listLockedMonthDetails(institutionId);
      const prev = lockedList.find((d: any) => d.month === month);
      // Months are reopened newest-first so a reopened month never has a frozen
      // month after it that its changes would have to flow into.
      const laterLocked = lockedList.map((d: any) => d.month).filter((m: string) => m > month);
      if (prev && laterLocked.length > 0) {
        return res.status(409).json({
          success: false,
          error: `${month} cannot be unlocked while later months are locked (${laterLocked.join(', ')}). Unlock the newest locked month first.`,
          laterLocked,
        });
      }
      const removed = await dbService.unlockMonth(institutionId, month);
      if (!removed) return res.status(404).json({ success: false, error: `${month} is not locked.` });
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'month_closure',
        actionTitle: 'Month Reopened',
        module: 'Defaulters',
        description: `Reopened ${month}. Reason: ${reason}`,
        targetId: month,
        month,
        metadata: { reason, previousLock: prev || null },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to unlock month.' });
    }
  });

  // --- Institute profile & settings ---

  app.put('/api/institute', requireAuth('settings.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const body: Record<string, any> = { ...(req.body || {}) };
      let previousCurrency: string | undefined;
      if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
        const code = String(body.currency || '').trim().toUpperCase();
        if (!CURRENCY_OPTIONS.some((c) => c.code === code)) {
          return res.status(400).json({ success: false, error: 'Unsupported currency code.' });
        }
        body.currency = code;
        previousCurrency = ((await dbService.getInstitutionById(institutionId)) as any)?.currency;
        if (previousCurrency === code) delete body.currency;
      }
      const updated = await dbService.updateInstituteProfile(institutionId, body);
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'settings_change',
        actionTitle: 'Institute Settings Updated',
        module: 'Settings',
        description: `Updated institute profile/settings (${Object.keys(body).join(', ') || 'no fields'}).`,
        metadata: {
          changedFields: Object.keys(body),
          ...(body.currency ? { currencyFrom: previousCurrency || 'USD', currencyTo: body.currency } : {}),
        },
      });
      res.json({ success: true, institution: updated });
    } catch (err: any) {
      console.error('[API] Failed to update institute profile:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to update institute profile.' });
    }
  });

  // Permanently delete institution profile and all associated data
  // Strictly gated to an authenticated Admin for that institution. Irreversible and permanent.
  app.delete('/api/institution', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== 'Admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied: Only an Administrator for this institution can permanently delete the institution profile and data.',
        });
      }

      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string);
      if (!institutionId) {
        return res.status(400).json({ success: false, error: 'Institution ID is required.' });
      }

      const currentInst = await dbService.getInstitutionById(institutionId);
      if (!currentInst) {
        return res.status(404).json({ success: false, error: 'Institution not found.' });
      }

      const { confirmationText, confirmationName, confirmationCode } = req.body || {};
      const targetName = currentInst.name?.trim().toLowerCase();
      const targetCode = currentInst.code?.trim().toLowerCase();
      const input = (confirmationText || confirmationName || confirmationCode || '').trim().toLowerCase();

      // Require exact match with institution name, institution code, or the explicit phrase 'DELETE INSTITUTION'
      if (input !== targetName && input !== targetCode && input !== 'delete institution') {
        return res.status(400).json({
          success: false,
          error: `Confirmation mismatch: You must enter the exact institution name ("${currentInst.name}") or code ("${currentInst.code}") to confirm permanent deletion.`,
        });
      }

      console.warn(`[API] DELETING INSTITUTION ${institutionId} (${currentInst.name}) requested by Admin ${req.user.username} (${req.user.id})`);

      const result = await dbService.deleteInstitution(institutionId);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || 'Failed to delete institution data from server.' });
      }

      // Notify and disconnect all connected SSE clients for this institution
      broadcastEvent({ type: 'INSTITUTION_DELETED', institutionId }, institutionId);
      sseClients.forEach((c) => {
        if (c.institutionId === institutionId) {
          try {
            c.res.end();
          } catch {}
        }
      });
      sseClients = sseClients.filter((c) => c.institutionId !== institutionId);

      // Invalidate active session cookie
      clearSessionCookie(res);

      res.json({
        success: true,
        message: `Institution "${currentInst.name}" and all associated data have been permanently deleted.`,
      });
    } catch (err: any) {
      console.error('[API] Failed to delete institution:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete institution.' });
    }
  });

  // --- Dashboard aggregate summary (server-computed, replacing client-side full-roster counting) ---

  app.get('/api/dashboard/summary', requireAuth('dashboard.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const [studentTotal, activeStudents, classCountsByClassId] = await Promise.all([
        dbService.searchStudents(institutionId, { pageSize: 1 }),
        dbService.searchStudents(institutionId, { status: 'Active', pageSize: 1 }),
        dbService.getActiveStudentCountsByClass(institutionId),
      ]);
      const classes = await dbService.listSimpleEntities(CLASS_ENTITY_CONFIG, institutionId, 'sort_order ASC');
      const classCounts = classes.map((c: any) => ({
        classId: c.id,
        className: c.name,
        activeStudentCount: classCountsByClassId.get(c.id) || 0,
      }));
      const [issuedVouchers, paidVouchers, partialVouchers] = await Promise.all([
        dbService.listVouchers(institutionId, { status: 'Issued', pageSize: 1 }),
        dbService.listVouchers(institutionId, { status: 'Paid', pageSize: 1 }),
        dbService.listVouchers(institutionId, { status: 'Partial', pageSize: 1 }),
      ]);

      res.json({
        success: true,
        summary: {
          totalStudents: studentTotal.total,
          activeStudents: activeStudents.total,
          classCounts,
          vouchers: {
            issued: issuedVouchers.total,
            paid: paidVouchers.total,
            partial: partialVouchers.total,
          },
        },
      });
    } catch (err: any) {
      console.error('[API] Failed to compute dashboard summary:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to compute dashboard summary.' });
    }
  });

  // --- Phase 3: Granular Transactional Financial Endpoints ---

  // 2. Transactional Fee Voucher Generation
  app.post('/api/vouchers/generate', requireAuth('fees.generate'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId as string;
      const { vouchers: rawVouchers, carriedPriorVouchers = [] } = req.body;

      if (!Array.isArray(rawVouchers) || rawVouchers.length === 0) {
        return res.status(400).json({ success: false, error: 'An array of vouchers is required.' });
      }

      let createdVouchers: any[] = [];

      // Duplicate-generation prevention: same-month generations are serialized
      // with an advisory lock and the target month's existing rows are
      // row-locked, so "check for duplicates, then insert" is atomic against a
      // concurrent run. The unique (institution, student, month) index is the
      // final guard against a racing insert.
      // (Narrowed: months are the only place a duplicate can exist, and locked
      // months can never change, so only the target months' rows and the
      // folded prior vouchers are read and row-locked.)
      const genMonths = Array.from(new Set<string>(rawVouchers.map((r: any) => String(r?.month || '')).filter(Boolean)));
      const priorIds: string[] = (Array.isArray(carriedPriorVouchers) ? carriedPriorVouchers : [])
        .map((p: any) => (typeof p === 'string' ? p : p?.id))
        .filter((x: any) => typeof x === 'string' && x.length > 0);
      await dbService.runVoucherTransaction(institutionId, { months: genMonths, voucherIds: priorIds }, async (lockedVouchers, helpers) => {
        const voucherUpserts: Record<string, any> = {};
        createdVouchers = [];

        const existingKeySet = new Set(
          Array.from(lockedVouchers.values())
            .filter((v: any) => v.status !== 'Reversed')
            .map((v: any) => `${v.studentId}:${v.month}`)
        );

        // Pass 1: drop students who already have a voucher for the month
        // (also de-duplicates repeated items inside the same request).
        const pending: any[] = [];
        for (const item of rawVouchers) {
          const key = `${item.studentId}:${item.month}`;
          if (existingKeySet.has(key)) {
            continue; // Skip already generated
          }
          existingKeySet.add(key);
          pending.push(item);
        }

        // Pass 2: the server is the sole authority for voucher numbers. Any number
        // supplied by the client is ignored. One atomic block is reserved per
        // billing year inside this same locked transaction, so numbers are
        // contiguous, monotonic and can never collide.
        const itemsByYear = new Map<string, any[]>();
        for (const item of pending) {
          const yearStr = String(item.month).split('-')[0];
          if (!itemsByYear.has(yearStr)) itemsByYear.set(yearStr, []);
          itemsByYear.get(yearStr)!.push(item);
        }

        for (const [yearStr, yearItems] of itemsByYear) {
          const numbers = await helpers.mintDocumentNumberBlock('FE', yearStr, yearItems.length);
          yearItems.forEach((item, idx) => {
            const newVoucher = {
              ...item,
              id: item.id || `vch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              voucherNo: numbers[idx],
              createdDate: item.createdDate || new Date().toISOString().split('T')[0],
            };
            createdVouchers.push(newVoucher);
            voucherUpserts[newVoucher.id] = newVoucher;
          });
        }

        // Mark any folded prior unpaid vouchers as Carried
        for (const prior of carriedPriorVouchers) {
          const priorId = typeof prior === 'string' ? prior : prior.id;
          const targetMonth = typeof prior === 'object' ? prior.targetMonth : undefined;
          const v = voucherUpserts[priorId] || lockedVouchers.get(priorId);
          if (v && v.status !== 'Paid' && v.status !== 'Reversed') {
            voucherUpserts[priorId] = {
              ...v,
              status: 'Carried',
              carryForwardMonth: targetMonth || v.carryForwardMonth,
            };
          }
        }

        return { writes: { voucherUpserts }, result: null };
      });

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      if (createdVouchers.length > 0) {
        const months = [...new Set(createdVouchers.map((v) => v.month))];
        await recordAudit(req, {
          actionType: 'voucher_generation',
          actionTitle: 'Fee Vouchers Generated',
          module: 'Vouchers',
          description: `Generated ${createdVouchers.length} voucher(s) for ${months.join(', ')}.`,
          targetLabel: `${createdVouchers.length} voucher(s)`,
          month: months.length === 1 ? months[0] : undefined,
          metadata: { count: createdVouchers.length, months, carriedPriorCount: carriedPriorVouchers.length },
        });
      }

      broadcastEvent(
        {
          type: 'vouchers_generated',
          institutionId,
          count: createdVouchers.length,
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        },
        institutionId
      );

      res.json({
        success: true,
        generatedCount: createdVouchers.length,
        vouchers: createdVouchers,
        revision: revInfo.revision,
      });
    } catch (err: any) {
      console.error('[API] Error generating vouchers:', err);
      res.status(err?.httpStatus || 500).json({ success: false, error: err?.message || 'Voucher generation failed' });
    }
  });

  // 3. Granular Fee Collection Receipt (Transactional Multi-Payment or Single Payment)
  app.post('/api/collections/receive', requireAuth('fees.collect'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId as string;
      const {
        payments, // Array of { voucherId, amount, paymentMode, referenceNo, notes, date, fineAdded, updatedParticulars, id, transactionId }
        collectionNotes,
        date = new Date().toISOString().split('T')[0],
        collectionId: requestedCollectionId,
      } = req.body;

      if (!Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one payment line is required.' });
      }

      for (let i = 0; i < payments.length; i++) {
        const mode = payments[i]?.paymentMode;
        if (mode !== undefined && mode !== null && mode !== '' && !isPaymentMode(mode)) {
          return res.status(400).json({
            success: false,
            error: `Payment ${i + 1}: invalid payment mode "${String(mode)}". Allowed: ${PAYMENT_MODES.join(', ')}.`,
          });
        }
      }

      const yearStr = new Date().getFullYear().toString();
      const collectionId =
        typeof requestedCollectionId === 'string' && requestedCollectionId.trim()
          ? requestedCollectionId.trim()
          : `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const voucherIds = [...new Set(payments.map((p: any) => p.voucherId))] as string[];

      let totalCollectionAmount = 0;
      let createdTxns: any[] = [];
      let updatedVouchersList: any[] = [];
      let newCollection: any;

      // Locks exactly the voucher rows referenced by this batch of payments
      // (Postgres: SELECT ... FOR UPDATE). Concurrent payment collection on
      // *different* vouchers proceeds without contention; concurrent
      // attempts to pay the SAME voucher block until the first transaction
      // commits, then see its fresh state — closing the lost-update race
      // where two cashiers collecting payment near-simultaneously could
      // previously have one payment silently vanish via a full-collection
      // overwrite.
      try {
        await dbService.runVoucherTransaction(institutionId, { voucherIds }, async (lockedVouchers, helpers) => {
          const voucherUpserts: Record<string, any> = {};
          const newTransactions: NonNullable<import('./server/db').VoucherTxWrites['newTransactions']> = [];
          totalCollectionAmount = 0;
          createdTxns = [];
          updatedVouchersList = [];

          for (let i = 0; i < payments.length; i++) {
            const item = payments[i];
            const base = voucherUpserts[item.voucherId] || lockedVouchers.get(item.voucherId);
            if (!base) {
              throw Object.assign(new Error(`Voucher ID ${item.voucherId} not found.`), { httpStatus: 404 });
            }
            const v = { ...base };
            if (v.status === 'Reversed' || v.status === 'Carried') {
              throw Object.assign(
                new Error(`Voucher ${v.voucherNo} is in status '${v.status}' and cannot accept payments.`),
                { httpStatus: 400 }
              );
            }
            if (item.amount <= 0) {
              throw Object.assign(new Error('Payment amount must be greater than zero.'), { httpStatus: 400 });
            }

            const txnNo = await helpers.mintDocumentNumber('TXN', yearStr);

            // Update voucher line items if fine or particulars were revised at payment
            if (item.updatedParticulars && Array.isArray(item.updatedParticulars) && item.updatedParticulars.length > 0) {
              v.particulars = item.updatedParticulars;
              v.grossTotal = item.updatedParticulars
                .filter((p: any) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
                .reduce((s: number, p: any) => s + Number(p.amount), 0);
              v.discountTotal = item.updatedParticulars
                .filter((p: any) => p.kind === 'Discount')
                .reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
              v.netDue = item.updatedParticulars.reduce((s: number, p: any) => s + Number(p.amount), 0);
            } else if (item.fineAdded && Number(item.fineAdded) !== 0) {
              const fineAdd = Number(item.fineAdded);
              const cleanParts = (v.particulars || []).map((p: any) => ({ ...p }));
              const fIdx = cleanParts.findIndex((p: any) => p.kind === 'Fine');
              if (fIdx >= 0) {
                cleanParts[fIdx] = { ...cleanParts[fIdx], amount: Number(cleanParts[fIdx].amount || 0) + fineAdd };
              } else {
                cleanParts.push({ kind: 'Fine', label: 'Fine', amount: fineAdd });
              }
              v.particulars = cleanParts;
              v.grossTotal = cleanParts
                .filter((p: any) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
                .reduce((s: number, p: any) => s + Number(p.amount), 0);
              v.discountTotal = cleanParts
                .filter((p: any) => p.kind === 'Discount')
                .reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
              v.netDue = cleanParts.reduce((s: number, p: any) => s + Number(p.amount), 0);
            }

            const updatedPaid = (v.amountPaid || 0) + item.amount;
            v.amountPaid = updatedPaid;
            if (updatedPaid >= v.netDue && v.netDue > 0) {
              v.status = 'Paid';
            } else if (updatedPaid > 0) {
              v.status = 'Partial';
            } else if (v.netDue <= 0 && updatedPaid === 0) {
              v.status = 'Paid';
            } else {
              v.status = 'Issued';
            }

            const txnId =
              typeof item.id === 'string' && item.id.trim()
                ? item.id.trim()
                : typeof item.transactionId === 'string' && item.transactionId.trim()
                ? item.transactionId.trim()
                : `txn-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

            const newTxn = {
              id: txnId,
              txnNo,
              collectionId,
              voucherId: v.id,
              studentId: v.studentId,
              month: v.month,
              amount: item.amount,
              fineAdded: item.fineAdded,
              paymentMode: item.paymentMode || DEFAULT_PAYMENT_MODE,
              referenceNo: item.referenceNo,
              notes: item.notes || `Payment for ${v.voucherNo}`,
              date: item.date || date,
            };

            totalCollectionAmount += item.amount;
            createdTxns.push(newTxn);
            updatedVouchersList.push(v);
            voucherUpserts[v.id] = v;
            newTransactions.push(newTxn);
          }

          const collectionNo = await helpers.mintDocumentNumber('COL', yearStr);
          newCollection = {
            id: collectionId,
            collectionNo,
            date,
            totalAmount: totalCollectionAmount,
            transactionCount: createdTxns.length,
            notes: collectionNotes || `Payment collection receipt ${collectionNo}`,
            isBulkImport: req.body.isBulkImport || false,
          };

          return { writes: { voucherUpserts, newTransactions, newCollections: [newCollection] }, result: null };
        });
      } catch (txErr: any) {
        const status = txErr?.httpStatus || 500;
        return res.status(status).json({ success: false, error: txErr?.message || 'Collection processing failed' });
      }

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      const isBulk = !!req.body.isBulkImport;
      await recordAudit(req, {
        actionType: isBulk ? 'bulk_collection' : 'collection_payment',
        actionTitle: isBulk ? 'Bulk CSV Payment Collection' : 'Fee Payment Received',
        module: 'Collections',
        description:
          collectionNotes ||
          `Collected ${createdTxns.length} payment(s) totaling ${totalCollectionAmount} (${newCollection.collectionNo}).`,
        targetId: newCollection.collectionNo,
        targetLabel: `${createdTxns.length} payment(s)`,
        amount: totalCollectionAmount,
        metadata: { voucherIds, transactionCount: createdTxns.length },
      });

      broadcastEvent(
        {
          type: 'payment_collected',
          institutionId,
          collectionNo: newCollection.collectionNo,
          totalAmount: totalCollectionAmount,
          transactionCount: createdTxns.length,
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        },
        institutionId
      );

      res.json({
        success: true,
        collection: newCollection,
        transactions: createdTxns,
        updatedVouchers: updatedVouchersList,
        revision: revInfo.revision,
      });
    } catch (err: any) {
      console.error('[API] Payment collection failure:', err);
      res.status(500).json({ success: false, error: err?.message || 'Collection processing failed' });
    }
  });

  // 4. Bulk Carry Forward of defaulter balances (atomic).
  //
  // Everything happens inside ONE PostgreSQL transaction with every voucher of
  // the tenant locked FOR UPDATE, using the shared applyCarryForward() rules
  // (src/utils/feeMath.ts): the source voucher is marked Carried with its
  // carriedLateFine, the target month voucher's Previous Balance is replaced
  // with the outstanding amount and its Fine carries the chosen fine, the
  // student's voucher chain is recalculated, and Admission vouchers carried
  // into pre-billing months get a destination voucher whose number is minted
  // here (never by the client). Policy that only the client knows (rounding,
  // default fine, due-date setting) is supplied in `policy` and validated.
  app.post('/api/vouchers/carry-forward-batch', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId as string;
      const { voucherIds: rawVoucherIds, targetMonth, addLateFine = false, customFineAmount, perVoucherFines, policy } = req.body;

      // ---- Input validation -------------------------------------------------
      const isNonNegNumber = (n: any) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (
        !Array.isArray(rawVoucherIds) ||
        rawVoucherIds.length === 0 ||
        rawVoucherIds.length > 5000 ||
        !rawVoucherIds.every((id: any) => typeof id === 'string' && id.length > 0)
      ) {
        return res.status(400).json({ success: false, error: 'voucherIds must be a non-empty array of voucher ids.' });
      }
      if (typeof targetMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        return res.status(400).json({ success: false, error: 'targetMonth must be in YYYY-MM format.' });
      }
      if (typeof addLateFine !== 'boolean') {
        return res.status(400).json({ success: false, error: 'addLateFine must be a boolean.' });
      }
      if (customFineAmount !== undefined && customFineAmount !== null && !isNonNegNumber(customFineAmount)) {
        return res.status(400).json({ success: false, error: 'customFineAmount must be a non-negative number.' });
      }
      if (perVoucherFines !== undefined && perVoucherFines !== null) {
        if (
          typeof perVoucherFines !== 'object' ||
          Array.isArray(perVoucherFines) ||
          !Object.values(perVoucherFines).every(isNonNegNumber)
        ) {
          return res.status(400).json({ success: false, error: 'perVoucherFines must map voucher ids to non-negative numbers.' });
        }
      }
      if (
        !policy ||
        typeof policy.roundingEnabled !== 'boolean' ||
        !Number.isInteger(policy.roundingMultiple) ||
        policy.roundingMultiple < 1 ||
        policy.roundingMultiple > 100000 ||
        !isNonNegNumber(policy.defaultLateFeeRate) ||
        typeof policy.settingsDueDate !== 'string' ||
        !/^(\d{4}-\d{2}-\d{2})?$/.test(policy.settingsDueDate)
      ) {
        return res.status(400).json({ success: false, error: 'A valid policy (rounding, default late fee, due date) is required.' });
      }

      const voucherIds: string[] = Array.from(new Set<string>(rawVoucherIds));

      interface Processed {
        sourceId: string;
        outstandingBalance: number;
        fineApplied: number;
      }
      let txResult: { processed: Processed[]; errors: string[]; updated: FeeVoucher[] } | null = null;

      try {
        await dbService.runVoucherTransaction(institutionId, { voucherIds, includeStudentTail: true }, async (lockedVouchers, helpers) => {
          const originals = new Map<string, any>(lockedVouchers);
          let list: FeeVoucher[] = Array.from(lockedVouchers.values()) as unknown as FeeVoucher[];
          const processed: Processed[] = [];
          const errors: string[] = [];
          const createdIds: string[] = [];

          for (const voucherId of voucherIds) {
            const src = list.find((v) => v.id === voucherId);
            const student =
              src && src.voucherType === 'Admission' ? await dbService.getStudentById(institutionId, src.studentId) : null;

            const result = applyCarryForward(list, {
              voucherId,
              targetMonth,
              addLateFine,
              customFineAmount: perVoucherFines?.[voucherId] ?? customFineAmount ?? undefined,
              defaultLateFeeRate: policy.defaultLateFeeRate,
              policy: { roundingEnabled: policy.roundingEnabled, roundingMultiple: policy.roundingMultiple },
              student: student ? { classId: student.classId, firstBillingMonth: student.firstBillingMonth } : undefined,
              settingsDueDate: policy.settingsDueDate,
              newVoucherId: () => `vch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            });

            if (!result.ok) {
              errors.push(result.error || `Voucher ${voucherId} could not be carried forward.`);
              continue;
            }
            list = result.list;
            if (result.createdVoucherId) createdIds.push(result.createdVoucherId);
            processed.push({ sourceId: voucherId, outstandingBalance: result.outstandingBalance, fineApplied: result.fineApplied });
          }

          // Number any auto-created destination vouchers on the server (atomic block).
          if (createdIds.length > 0) {
            const year = targetMonth.split('-')[0];
            const numbers = await helpers.mintDocumentNumberBlock('FE', year, createdIds.length);
            list = list.map((v) => {
              const idx = createdIds.indexOf(v.id);
              return idx >= 0 ? { ...v, voucherNo: numbers[idx] } : v;
            });
          }

          const updated = list.filter((v) => originals.get(v.id) !== (v as any));
          const voucherUpserts: Record<string, any> = {};
          if (processed.length > 0) {
            for (const v of updated) voucherUpserts[v.id] = v;
          }

          txResult = { processed, errors, updated: processed.length > 0 ? updated : [] };
          return { writes: { voucherUpserts }, result: null };
        });
      } catch (txErr: any) {
        const status = txErr?.httpStatus || 500;
        return res.status(status).json({ success: false, error: txErr?.message || 'Bulk carry forward failed' });
      }

      const { processed, errors, updated } = txResult!;

      // Nothing could be carried: nothing was written, so no revision bump / audit.
      if (processed.length === 0) {
        return res.status(409).json({
          success: false,
          error: errors.length > 0 ? errors.slice(0, 3).join(' ') : 'No vouchers were carried forward.',
          errors,
        });
      }

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      // One summary audit entry per batch (not one per voucher). The carried
      // vouchers themselves keep their Carried status, month and fine.
      {
        const items = processed
          .map((item) => ({ item, v: updated.find((u) => u.id === item.sourceId) }))
          .filter((x): x is { item: typeof processed[number]; v: any } => !!x.v);
        const totalOutstanding = items.reduce((sum, x) => sum + x.item.outstandingBalance, 0);
        const totalFine = items.reduce((sum, x) => sum + (x.item.fineApplied || 0), 0);
        const fineCount = items.filter((x) => x.item.fineApplied > 0).length;
        const sourceMonths = [...new Set(items.map((x) => x.v.month))].sort();
        let targetLabel = `${items.length} voucher(s)`;
        if (items.length === 1) {
          try {
            const st = await dbService.getStudentById(institutionId, items[0].v.studentId);
            targetLabel = st ? `${st.name} (${st.regNo})` : items[0].v.voucherNo;
          } catch {
            targetLabel = items[0].v.voucherNo;
          }
        }
        const cur = (req.institution as any)?.currency || 'USD';
        await recordAudit(req, {
          actionType: 'carry_forward',
          actionTitle: items.length === 1 ? 'Defaulter Voucher Carried Forward' : 'Defaulter Vouchers Carried Forward',
          module: 'Defaulters',
          description:
            `Carried forward ${cur} ${totalOutstanding.toLocaleString('en-US')} of outstanding arrears on ${items.length} voucher(s) ` +
            `from ${sourceMonths.join(', ')} to ${targetMonth}` +
            (totalFine > 0 ? `, with ${cur} ${totalFine.toLocaleString('en-US')} in late fines on ${fineCount} voucher(s).` : ' (no late fine).'),
          targetId: items.length === 1 ? items[0].v.voucherNo : undefined,
          targetLabel,
          month: sourceMonths.length === 1 ? sourceMonths[0] : undefined,
          amount: totalOutstanding,
          newValue: `Carried to ${targetMonth}`,
          metadata: {
            count: items.length,
            targetMonth,
            sourceMonths,
            totalOutstanding,
            totalFine,
            fineCount,
            voucherNos: items.slice(0, 500).map((x) => x.v.voucherNo),
          },
        });
      }

      broadcastEvent(
        {
          type: 'vouchers_bulk_carried',
          institutionId,
          targetMonth,
          count: processed.length,
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        },
        institutionId
      );

      res.json({
        success: true,
        count: processed.length,
        updatedVouchers: updated,
        errors,
        revision: revInfo.revision,
      });
    } catch (err: any) {
      console.error('[API] Error in bulk carry forward:', err);
      res.status(500).json({ success: false, error: err?.message || 'Bulk carry forward failed' });
    }
  });

  /**
   * Targeted persistence endpoint for voucher/transaction/collection changes
   * where the CLIENT owns the business logic (e.g. voucher deletion cascade
   * rules, auto-heal balance recalculation, collection-reversal fine
   * undo) — logic that depends on school-specific policy settings that are
   * only ever configured client-side (see AppContext.tsx's roundingEnabled/
   * roundingMultiple/voucherDeletionResolution, which have never been
   * server-synced, even before this endpoint existed). Re-deriving that
   * financial math server-side would risk subtly diverging from the
   * already-tested client implementation; instead the client computes the
   * final result and this endpoint just persists exactly those targeted
   * changes atomically, reusing the same locked-transaction machinery as
   * every other voucher-realm write in this file.
   *
   * Used by voucher deletion (single/bulk/cascade/auto-heal) and collection
   * deletion (which reverses transactions and undoes fine additions).
   */
  // Shared by several distinct client actions (voucher deletion, particulars
  // editing, bulk CSV collection, carry-forward undo) that each compute
  // their own final result client-side and just need it persisted
  // atomically — see the doc comment above. Because callers differ, the
  // permission required depends on WHICH operations are actually present in
  // this specific request, checked below, rather than one fixed permission
  // on the route.
  app.post('/api/vouchers/batch-update', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId as string;
      const {
        voucherUpserts = [],
        deleteVoucherIds = [],
        deleteTransactionIds = [],
        newTransactions = [],
        newCollections = [],
        collectionUpdates = [],
        deleteCollectionIds = [],
      } = req.body || {};

      if (
        !Array.isArray(voucherUpserts) ||
        !Array.isArray(deleteVoucherIds) ||
        !Array.isArray(deleteTransactionIds) ||
        !Array.isArray(newTransactions) ||
        !Array.isArray(newCollections) ||
        !Array.isArray(collectionUpdates) ||
        !Array.isArray(deleteCollectionIds)
      ) {
        return res.status(400).json({ success: false, error: 'Invalid request body.' });
      }

      const userCtx = { role: req.user!.role as any, permissions: req.user!.permissions };
      const isDeletion = deleteVoucherIds.length > 0 || deleteTransactionIds.length > 0 || deleteCollectionIds.length > 0;
      const isNewPayment = newTransactions.length > 0 || newCollections.length > 0;
      const isVoucherEdit = voucherUpserts.length > 0;

      if (isDeletion && !isPermissionAllowed(userCtx, 'fees.delete')) {
        return res.status(403).json({ success: false, error: "Access denied: Insufficient privileges (requires 'fees.delete')." });
      }
      if (isNewPayment && !isPermissionAllowed(userCtx, 'fees.collect')) {
        return res.status(403).json({ success: false, error: "Access denied: Insufficient privileges (requires 'fees.collect')." });
      }
      if (
        isVoucherEdit &&
        !isDeletion &&
        !isNewPayment &&
        !isPermissionAllowed(userCtx, 'fees.edit') &&
        !isPermissionAllowed(userCtx, 'defaulters.manage')
      ) {
        return res.status(403).json({ success: false, error: "Access denied: Insufficient privileges (requires 'fees.edit')." });
      }
      if (!isDeletion && !isNewPayment && !isVoucherEdit) {
        return res.json({ success: true, revision: dbService.getRevisionInfo(institutionId).revision });
      }

      const TOLERANCE = 1; // paisa/cents-level rounding tolerance
      for (const v of voucherUpserts) {
        if (!v?.id) {
          return res.status(400).json({ success: false, error: 'Voucher upsert missing id.' });
        }
        const netDue = Number(v.netDue);
        const amountPaid = Number(v.amountPaid);
        if (!Number.isFinite(netDue) || !Number.isFinite(amountPaid)) {
          return res.status(400).json({ success: false, error: `Voucher ${v.id}: netDue/amountPaid must be finite numbers.` });
        }
        if (amountPaid < 0) {
          return res.status(400).json({ success: false, error: `Voucher ${v.id}: amountPaid cannot be negative.` });
        }
        if (!isDeletion && amountPaid > netDue + TOLERANCE) {
          return res.status(400).json({ success: false, error: `Voucher ${v.id}: amountPaid cannot exceed netDue.` });
        }
      }

      const voucherIds = [...new Set([...voucherUpserts.map((v: any) => v.id), ...deleteVoucherIds])].filter(Boolean);
      const yearStr = new Date().getFullYear().toString();
      let deletedVoucherLabels: string[] = [];
      let editedVoucherLabels: string[] = [];
      const assignedVoucherNumbers: { id: string; voucherNo: string }[] = [];

      await dbService.runVoucherTransaction(institutionId, { voucherIds }, async (_locked, helpers) => {
        // amountPaid must never increase for an existing voucher through this
        // generic upsert path — a real payment has to go through
        // /api/collections/receive, which creates the matching transaction
        // record. Without this check, anyone holding fees.edit could mark a
        // voucher "paid" with no transaction/collection ever created, and
        // (until the audit-logging gap is closed) leave no trace of it.
        for (const v of voucherUpserts) {
          const existing = _locked.get(v.id);
          if (existing && !isDeletion && Number(v.amountPaid) > Number(existing.amountPaid) + TOLERANCE) {
            throw new Error(
              `Voucher ${v.id}: amountPaid cannot be increased via this endpoint — use the collections/receive flow to record a payment.`
            );
          }
        }

        deletedVoucherLabels = deleteVoucherIds.map((id: string) => _locked.get(id)?.voucherNo || id);
        editedVoucherLabels = voucherUpserts.map((v: any) => v.voucherNo || v.id);

        // Voucher numbers are server-authoritative. A voucher that already exists
        // keeps its stored number (clients cannot renumber it); a brand-new voucher
        // always receives the next number from the database sequence, one atomic
        // block per billing year, regardless of what the client sent.
        const upserts: Record<string, any> = {};
        const newVouchersByYear = new Map<string, any[]>();
        for (const v of voucherUpserts) {
          if (!v?.id) continue;
          const existing = _locked.get(v.id);
          if (existing) {
            upserts[v.id] = { ...v, voucherNo: existing.voucherNo };
          } else {
            upserts[v.id] = { ...v };
            const monthStr = String(v.month || '');
            const vYear = /^\d{4}/.test(monthStr) ? monthStr.slice(0, 4) : yearStr;
            if (!newVouchersByYear.has(vYear)) newVouchersByYear.set(vYear, []);
            newVouchersByYear.get(vYear)!.push(upserts[v.id]);
          }
        }
        for (const [vYear, list] of newVouchersByYear) {
          const numbers = await helpers.mintDocumentNumberBlock('FE', vYear, list.length);
          list.forEach((v, i) => {
            v.voucherNo = numbers[i];
            assignedVoucherNumbers.push({ id: v.id, voucherNo: numbers[i] });
          });
        }
        const collectionUpdatesMap: Record<string, { totalAmount: number; transactionCount: number }> = {};
        for (const c of collectionUpdates) {
          if (c?.id) collectionUpdatesMap[c.id] = { totalAmount: c.totalAmount, transactionCount: c.transactionCount };
        }

        // Never trust client-supplied document numbers for anything actually
        // persisted — the client only sends pending placeholders. Mint
        // authoritative ones here, exactly like /api/collections/receive and
        // /api/vouchers/generate do.
        const remintedTransactions = [];
        for (const t of newTransactions) {
          const txnNo = await helpers.mintDocumentNumber('TXN', yearStr);
          remintedTransactions.push({ ...t, txnNo });
        }
        const remintedCollections = [];
        for (const c of newCollections) {
          const collectionNo = await helpers.mintDocumentNumber('COL', yearStr);
          remintedCollections.push({ ...c, collectionNo });
        }

        return {
          writes: {
            voucherUpserts: upserts,
            deleteVoucherIds,
            deleteTransactionIds,
            newTransactions: remintedTransactions,
            newCollections: remintedCollections,
            collectionUpdates: collectionUpdatesMap,
            deleteCollectionIds,
          },
          result: null,
        };
      });

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      if (deleteVoucherIds.length > 0) {
        await recordAudit(req, {
          actionType: 'voucher_deletion',
          actionTitle: 'Fee Voucher(s) Deleted',
          module: 'Vouchers',
          description: `Deleted ${deleteVoucherIds.length} voucher(s): ${deletedVoucherLabels.join(', ')}.`,
          targetLabel: `${deleteVoucherIds.length} voucher(s)`,
          metadata: { voucherIds: deleteVoucherIds },
        });
      }
      if (deleteCollectionIds.length > 0) {
        await recordAudit(req, {
          actionType: 'collection_reversal',
          actionTitle: 'Fee Collection Reversed',
          module: 'Collections',
          description: `Reversed ${deleteCollectionIds.length} collection(s), affecting ${deleteTransactionIds.length} transaction(s) and ${voucherUpserts.length} voucher(s).`,
          targetLabel: `${deleteCollectionIds.length} collection(s)`,
          metadata: { collectionIds: deleteCollectionIds, transactionIds: deleteTransactionIds },
        });
      } else if (isVoucherEdit && !isNewPayment) {
        await recordAudit(req, {
          actionType: 'voucher_edit',
          actionTitle: 'Fee Voucher(s) Edited',
          module: 'Vouchers',
          description: `Edited ${voucherUpserts.length} voucher(s): ${editedVoucherLabels.join(', ')}.`,
          targetLabel: `${voucherUpserts.length} voucher(s)`,
          metadata: { voucherIds: voucherUpserts.map((v: any) => v.id) },
        });
      }

      broadcastEvent(
        {
          type: 'db_mutation',
          institutionId,
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        },
        institutionId
      );

      res.json({ success: true, revision: revInfo.revision, vouchers: assignedVoucherNumbers });
    } catch (err: any) {
      console.error('[API] Failed to apply voucher batch update:', err);
      res.status(err?.httpStatus || 500).json({ success: false, error: err?.message || 'Batch update failed' });
    }
  });

  // Export database backup for tenant
  app.get('/api/backup/export', requireAuth('system.backup'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const backup = await dbService.exportInstitutionBackup(institutionId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="school_backup_${institutionId}_${new Date().toISOString().split('T')[0]}.json"`
      );
      res.json(backup);
    } catch (err: any) {
      console.error('[API] Failed to export backup:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backup export failure' });
    }
  });

  // Restore database backup for tenant
  app.post('/api/backup/restore', requireAuth('system.backup'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId as string;
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid backup format' });
      }
      const result = await dbService.restoreInstitutionBackup(institutionId, backupData);
      if (result.success) {
        // This wipes and replaces every table for the tenant, so it must
        // leave its own audit trail entry — separate from, and always
        // after, any historical log entries the backup file itself
        // contains (restoreInstitutionBackup replays those first), so
        // this shows up as the newest, unambiguous record of the restore
        // itself rather than being buried under replayed history.
        await recordAudit(req, {
          actionType: 'system_restore',
          actionTitle: 'Full Database Restored From Backup',
          module: 'Security',
          description: 'Institution data was fully wiped and restored from an uploaded backup file.',
          metadata: {
            backupCollections: Object.keys(backupData).filter((k) => Array.isArray((backupData as any)[k])),
          },
        });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API] Failed to restore backup:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backup restore failure' });
    }
  });

  // --- Vite / Frontend Serving Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Audit-log retention: apply each institution's setting at startup, then daily.
  const runRetention = async () => {
    try {
      const results = await dbService.runAuditRetention();
      for (const r of results) {
        console.log(`[Audit] Retention purged ${r.deleted} entries for ${r.institutionId} (older than ${r.months} months).`);
        await dbService.appendAuditLog(r.institutionId, {
          operatorId: 'usr-system',
          operatorUsername: 'system',
          operatorName: 'System',
          operatorRole: 'Admin',
          actionType: 'settings_change',
          actionTitle: 'Audit Logs Purged (Retention)',
          module: 'Settings',
          description: `Automatic retention removed ${r.deleted} audit log entr${r.deleted === 1 ? 'y' : 'ies'} older than ${r.months} month(s). Security, restore and cleanup entries were kept.`,
          metadata: { deleted: r.deleted, cutoff: r.cutoff, months: r.months, automatic: true },
        });
      }
    } catch (err) {
      console.error('[Audit] Retention run failed:', err);
    }
  };
  setTimeout(runRetention, 30_000).unref();
  setInterval(runRetention, 24 * 60 * 60 * 1000).unref();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Multi-Tenant School Management Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Server] Database Engine: ${dbService.getEngine().toUpperCase()}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
  process.exit(1);
});
