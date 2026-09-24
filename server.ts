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
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

      // Fallback institutionId from headers or query if not authenticated
      if (!req.institutionId) {
        req.institutionId =
          (req.headers['x-institution-id'] as string) ||
          (req.query.institutionId as string) ||
          'default';
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

      if (
        requestedTenant &&
        requestedTenant !== 'default' &&
        requestedTenant !== req.user.institution_id
      ) {
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
        const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
        const items = await dbService.listSimpleEntities(config, institutionId, opts.orderBy);
        res.json({ success: true, items });
      } catch (err: any) {
        console.error(`[API] Failed to list ${path}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to list.' });
      }
    });

    app.post(path, requireAuth(managePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
        const created = await dbService.createSimpleEntity(config, institutionId, req.body || {});
        dbService.incrementRevision(institutionId);
        await recordAudit(req, {
          actionType: 'settings_change',
          actionTitle: `${config.table} record created`,
          module: 'Settings',
          description: `Created a ${config.table} record${created?.name ? ` ('${created.name}')` : ''}.`,
          targetId: created?.id,
          targetLabel: created?.name || created?.label,
        });
        res.json({ success: true, item: created });
      } catch (err: any) {
        console.error(`[API] Failed to create ${path}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to create.' });
      }
    });

    app.put(`${path}/:id`, requireAuth(managePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
        const updated = await dbService.updateSimpleEntity(config, institutionId, req.params.id, req.body || {});
        if (!updated) return res.status(404).json({ success: false, error: 'Not found.' });
        dbService.incrementRevision(institutionId);
        await recordAudit(req, {
          actionType: 'settings_change',
          actionTitle: `${config.table} record updated`,
          module: 'Settings',
          description: `Updated a ${config.table} record${updated?.name ? ` ('${updated.name}')` : ''}.`,
          targetId: updated?.id,
          targetLabel: updated?.name || updated?.label,
          metadata: { changedFields: Object.keys(req.body || {}) },
        });
        res.json({ success: true, item: updated });
      } catch (err: any) {
        console.error(`[API] Failed to update ${path}/${req.params.id}:`, err);
        res.status(500).json({ success: false, error: err?.message || 'Failed to update.' });
      }
    });

    app.delete(`${path}/:id`, requireAuth(deletePermission), async (req: AuthenticatedRequest, res) => {
      try {
        const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
        const deleted = await dbService.deleteSimpleEntity(config, institutionId, req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Not found.' });
        dbService.incrementRevision(institutionId);
        await recordAudit(req, {
          actionType: 'settings_change',
          actionTitle: `${config.table} record deleted`,
          module: 'Settings',
          description: `Deleted a ${config.table} record (id: ${req.params.id}).`,
          targetId: req.params.id,
        });
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

      if (!adminPassword || adminPassword.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'Admin password must be at least 6 characters.' });
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
          currency: currency?.trim() || 'PKR',
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
      if (!password || password.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
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
  app.get('/api/institutions', async (req, res) => {
    try {
      const list = await dbService.listInstitutions();
      const sanitized = list.map((inst) => ({
        id: inst.id,
        name: inst.name,
        currency: inst.currency,
        address: inst.address,
        logoUrl: inst.logo_url,
      }));
      res.json({ success: true, institutions: sanitized });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to list institutions.' });
    }
  });

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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { username, name, email, password, role, permissions } = req.body || {};
      if (!username || !username.trim()) {
        return res.status(400).json({ success: false, error: 'Username is required.' });
      }
      if (!password || password.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
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
        targetId: result.user.id,
        targetLabel: result.user.full_name,
        metadata: { role: result.user.role, permissions: result.user.permissions },
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
        if (String(req.body.password).trim().length < 6) {
          return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
        }
        updates.password_hash = await hashPassword(String(req.body.password).trim());
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
        targetId: target.id,
        targetLabel: target.full_name,
        metadata: { changedFields: Object.keys(updates) },
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
        targetId: target.id,
        targetLabel: target.full_name,
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
  app.get('/api/health', async (req, res) => {
    const institutionId = (req.headers['x-institution-id'] as string) || (req.query.institutionId as string) || 'default';
    const pingResult = await dbService.ping();
    const revInfo = dbService.getRevisionInfo(institutionId);

    const isHealthy = pingResult.healthy;
    const statusCode = isHealthy ? 200 : 503;

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
  app.get('/api/revision', (req, res) => {
    const institutionId = (req.headers['x-institution-id'] as string) || (req.query.institutionId as string) || 'default';
    res.json({
      success: true,
      ...dbService.getRevisionInfo(institutionId),
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const body = req.body || {};
      if (!body.name || !String(body.name).trim()) {
        return res.status(400).json({ success: false, error: 'Student name is required.' });
      }
      const duplicate = await dbService.findDuplicateStudent(institutionId, {
        bFormNo: body.bFormNo,
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: `B-Form Number is already used by student '${duplicate.existingStudentName}'.`,
          field: duplicate.field,
        });
      }
      const created = await dbService.createStudent(institutionId, body);
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'student_created',
        actionTitle: 'Student Record Created',
        module: 'Students',
        description: `Enrolled student '${created.name}' (${created.regNo}).`,
        targetId: created.regNo,
        targetLabel: created.name,
      });
      res.json({ success: true, student: created });
    } catch (err: any) {
      console.error('[API] Failed to create student:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to create student.' });
    }
  });

  app.put('/api/students/:id', requireAuth('students.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const body = req.body || {};
      if (body.bFormNo !== undefined) {
        const duplicate = await dbService.findDuplicateStudent(
          institutionId,
          { bFormNo: body.bFormNo },
          req.params.id
        );
        if (duplicate) {
          return res.status(409).json({
            success: false,
            error: `B-Form Number is already used by student '${duplicate.existingStudentName}'.`,
            field: duplicate.field,
          });
        }
      }
      const updated = await dbService.updateStudent(institutionId, req.params.id, body);
      if (!updated) return res.status(404).json({ success: false, error: 'Student not found.' });
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'student_updated',
        actionTitle: 'Student Record Updated',
        module: 'Students',
        description: `Updated student record for '${updated.name}' (${updated.regNo}).`,
        targetId: updated.regNo,
        targetLabel: updated.name,
        metadata: { changedFields: Object.keys(body) },
      });
      res.json({ success: true, student: updated });
    } catch (err: any) {
      console.error('[API] Failed to update student:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to update student.' });
    }
  });

  app.delete('/api/students/:id', requireAuth('students.delete'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { studentId, classId, month, status, page, pageSize } = req.query;
      const { vouchers, total } = await dbService.listVouchers(institutionId, {
        studentId: typeof studentId === 'string' ? studentId : undefined,
        classId: typeof classId === 'string' ? classId : undefined,
        month: typeof month === 'string' ? month : undefined,
        status: typeof status === 'string' ? status : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, vouchers, total });
    } catch (err: any) {
      console.error('[API] Failed to list vouchers:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list vouchers.' });
    }
  });

  app.get('/api/collections', requireAuth('fees.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { dateFrom, dateTo, page, pageSize } = req.query;
      const { collections, total } = await dbService.listCollections(institutionId, {
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { studentId, voucherId, collectionId, dateFrom, dateTo, page, pageSize } = req.query;
      const { transactions, total } = await dbService.listTransactions(institutionId, {
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

  app.get('/api/audit-logs', requireAuth('audit.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { module, actionType, dateFrom, dateTo, page, pageSize } = req.query;
      const { logs, total } = await dbService.listAuditLogs(institutionId, {
        module: typeof module === 'string' ? module : undefined,
        actionType: typeof actionType === 'string' ? actionType : undefined,
        dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
        dateTo: typeof dateTo === 'string' ? dateTo : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      });
      res.json({ success: true, logs, total });
    } catch (err: any) {
      console.error('[API] Failed to list audit logs:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to list audit logs.' });
    }
  });

  // --- Student Account History (ledger adjustment notes) ---

  app.get('/api/student-account-history', requireAuth('students.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const months = await dbService.listLockedMonths(institutionId);
      res.json({ success: true, months });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to list locked months.' });
    }
  });

  app.post('/api/locked-months', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const { month } = req.body || {};
      if (!month) return res.status(400).json({ success: false, error: 'month is required.' });
      await dbService.lockMonth(institutionId, month);
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'month_closure',
        actionTitle: 'Month Locked',
        module: 'Defaulters',
        description: `Locked ${month} against further fee edits/generation.`,
        targetId: month,
        month,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to lock month.' });
    }
  });

  app.delete('/api/locked-months/:month', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      await dbService.unlockMonth(institutionId, req.params.month);
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'month_closure',
        actionTitle: 'Month Reopened',
        module: 'Defaulters',
        description: `Reopened ${req.params.month} for fee edits/generation.`,
        targetId: req.params.month,
        month: req.params.month,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to unlock month.' });
    }
  });

  // --- Institute profile & settings ---

  app.put('/api/institute', requireAuth('settings.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
      const updated = await dbService.updateInstituteProfile(institutionId, req.body || {});
      dbService.incrementRevision(institutionId);
      await recordAudit(req, {
        actionType: 'settings_change',
        actionTitle: 'Institute Settings Updated',
        module: 'Settings',
        description: `Updated institute profile/settings (${Object.keys(req.body || {}).join(', ') || 'no fields'}).`,
        metadata: { changedFields: Object.keys(req.body || {}) },
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || 'default';
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

  // 1. Next Atomic Sequence / Document Number
  app.post('/api/sequences/next', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const { prefix, year, digits = 6 } = req.body;
      if (!prefix || !year) {
        return res.status(400).json({ success: false, error: 'Both prefix and year are required.' });
      }
      const documentNumber = await dbService.nextDocumentNumber(institutionId, prefix, year, digits);
      res.json({ success: true, documentNumber, prefix, year });
    } catch (err: any) {
      console.error('[API] Sequence generation failed:', err);
      res.status(500).json({ success: false, error: err?.message || 'Sequence generation failure' });
    }
  });

  // 2. Transactional Fee Voucher Generation
  app.post('/api/vouchers/generate', requireAuth('fees.generate'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const { vouchers: rawVouchers, carriedPriorVouchers = [] } = req.body;

      if (!Array.isArray(rawVouchers) || rawVouchers.length === 0) {
        return res.status(400).json({ success: false, error: 'An array of vouchers is required.' });
      }

      let createdVouchers: any[] = [];

      // Locks the ENTIRE vouchers collection for this tenant for the
      // duration of this transaction. This is necessary (not just
      // convenient): duplicate-generation prevention requires scanning every
      // existing voucher for a matching studentId+month key, and a specific
      // set of row IDs isn't known upfront the way it is for payment
      // collection. Locking the whole collection makes "check for
      // duplicates, then insert" atomic against a concurrent generation run
      // — without it, two admins generating vouchers for different classes
      // at the same moment could each silently erase the other's batch via
      // the old full-collection-replace pattern.
      await dbService.runVoucherTransaction(institutionId, { allVouchers: true }, async (lockedVouchers, helpers) => {
        const voucherUpserts: Record<string, any> = {};
        createdVouchers = [];

        const existingKeySet = new Set(
          Array.from(lockedVouchers.values())
            .filter((v: any) => v.status !== 'Reversed')
            .map((v: any) => `${v.studentId}:${v.month}`)
        );

        for (const item of rawVouchers) {
          const key = `${item.studentId}:${item.month}`;
          if (existingKeySet.has(key)) {
            continue; // Skip already generated
          }

          const yearStr = item.month.split('-')[0];
          const voucherNo =
            item.voucherNo && !item.voucherNo.startsWith('TEMP_')
              ? item.voucherNo
              : await helpers.mintDocumentNumber('FE', yearStr);

          const newVoucher = {
            ...item,
            id: item.id || `vch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            voucherNo,
            createdDate: item.createdDate || new Date().toISOString().split('T')[0],
          };

          createdVouchers.push(newVoucher);
          voucherUpserts[newVoucher.id] = newVoucher;
          existingKeySet.add(key);
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
      res.status(500).json({ success: false, error: err?.message || 'Voucher generation failed' });
    }
  });

  // 3. Granular Fee Collection Receipt (Transactional Multi-Payment or Single Payment)
  app.post('/api/collections/receive', requireAuth('fees.collect'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const {
        payments, // Array of { voucherId, amount, paymentMode, referenceNo, notes, date, fineAdded, updatedParticulars }
        collectionNotes,
        date = new Date().toISOString().split('T')[0],
      } = req.body;

      if (!Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one payment line is required.' });
      }

      const yearStr = new Date().getFullYear().toString();
      const collectionId = `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
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
            if (item.updatedParticulars && Array.isArray(item.updatedParticulars)) {
              v.particulars = item.updatedParticulars;
              v.grossTotal = item.updatedParticulars
                .filter((p: any) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
                .reduce((s: number, p: any) => s + Number(p.amount), 0);
              v.discountTotal = item.updatedParticulars
                .filter((p: any) => p.kind === 'Discount')
                .reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
              v.netDue = item.updatedParticulars.reduce((s: number, p: any) => s + Number(p.amount), 0);
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

            const newTxn = {
              id: `txn-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
              txnNo,
              collectionId,
              voucherId: v.id,
              studentId: v.studentId,
              month: v.month,
              amount: item.amount,
              fineAdded: item.fineAdded,
              paymentMode: item.paymentMode || 'Cash',
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

  // 4. Carry Forward Unpaid Balance Transaction
  app.post('/api/vouchers/carry-forward', requireAuth('defaulters.manage'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const { voucherId, targetMonth, addLateFine = false, customFineAmount } = req.body;

      if (!voucherId || !targetMonth) {
        return res.status(400).json({ success: false, error: 'voucherId and targetMonth are required.' });
      }

      let sourceVoucherResult: any = null;
      let targetVoucherResult: any = null;

      // Locks the whole vouchers collection for this tenant: the matching
      // target voucher (same student, target month) isn't known by ID
      // upfront and must be found by scanning, so — same reasoning as
      // voucher generation — the whole collection needs to be locked to
      // make "find target, then fold balance into it" atomic against a
      // concurrent carry-forward or generation run. Carry-forward is a
      // low-frequency, typically month-end/admin-driven operation, so this
      // trade-off (favoring correctness over fine-grained concurrency) is
      // appropriate here.
      try {
        await dbService.runVoucherTransaction(institutionId, { allVouchers: true }, async (lockedVouchers) => {
          const voucherUpserts: Record<string, any> = {};
          const source = lockedVouchers.get(voucherId);
          if (!source) {
            throw Object.assign(new Error('Voucher not found.'), { httpStatus: 404 });
          }
          const voucher = { ...source };

          if (voucher.status === 'Reversed') {
            throw Object.assign(new Error('Voucher is reversed and cannot be carried forward.'), { httpStatus: 400 });
          }
          if (voucher.status === 'Paid' || voucher.status === 'Carried') {
            throw Object.assign(new Error(`Voucher is already in '${voucher.status}' status.`), { httpStatus: 400 });
          }

          const outstandingBalance = voucher.netDue - voucher.amountPaid;
          if (outstandingBalance <= 0) {
            throw Object.assign(new Error('Voucher has no outstanding balance to carry forward.'), { httpStatus: 400 });
          }

          // Mark source voucher as carried
          voucher.status = 'Carried';
          voucher.carryForwardMonth = targetMonth;
          voucherUpserts[voucherId] = voucher;

          // Check if target voucher exists
          const targetSource = Array.from(lockedVouchers.values()).find(
            (v: any) => v.id !== voucherId && v.studentId === voucher.studentId && v.month === targetMonth && v.status !== 'Reversed'
          );

          const fineToApply = addLateFine
            ? customFineAmount !== undefined
              ? customFineAmount
              : voucher.lateFeeRate || 0
            : 0;

          let targetVoucher: any = null;
          if (targetSource) {
            targetVoucher = { ...targetSource };
            const prevBalIndex = targetVoucher.particulars.findIndex((p: any) => p.kind === 'PreviousBalance');
            if (prevBalIndex >= 0) {
              targetVoucher.particulars[prevBalIndex].amount += outstandingBalance;
            } else {
              targetVoucher.particulars.push({
                kind: 'PreviousBalance',
                label: `Arrears (${voucher.month})`,
                amount: outstandingBalance,
              });
            }

            if (fineToApply > 0) {
              const fineIndex = targetVoucher.particulars.findIndex((p: any) => p.kind === 'Fine');
              if (fineIndex >= 0) {
                targetVoucher.particulars[fineIndex].amount += fineToApply;
              } else {
                targetVoucher.particulars.push({
                  kind: 'Fine',
                  label: 'Late Fee',
                  amount: fineToApply,
                });
              }
            }

            targetVoucher.prevBalance = (targetVoucher.prevBalance || 0) + outstandingBalance;
            targetVoucher.netDue = targetVoucher.particulars.reduce((s: number, p: any) => s + Number(p.amount), 0);
            if (targetVoucher.amountPaid >= targetVoucher.netDue && targetVoucher.netDue > 0) {
              targetVoucher.status = 'Paid';
            } else if (targetVoucher.amountPaid > 0) {
              targetVoucher.status = 'Partial';
            } else {
              targetVoucher.status = 'Issued';
            }

            voucherUpserts[targetVoucher.id] = targetVoucher;
          }

          sourceVoucherResult = voucher;
          targetVoucherResult = targetVoucher;

          return { writes: { voucherUpserts }, result: null };
        });
      } catch (txErr: any) {
        const status = txErr?.httpStatus || 500;
        return res.status(status).json({ success: false, error: txErr?.message || 'Carry forward failed' });
      }

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      await recordAudit(req, {
        actionType: 'carry_forward',
        actionTitle: 'Balance Carried Forward',
        module: 'Defaulters',
        description: `Carried outstanding balance from voucher ${sourceVoucherResult.voucherNo} (${sourceVoucherResult.month}) to ${targetMonth}${addLateFine ? ' with a late fine' : ''}.`,
        targetId: sourceVoucherResult.voucherNo,
        targetLabel: `${sourceVoucherResult.voucherNo} → ${targetMonth}`,
        month: targetMonth,
        amount: sourceVoucherResult.netDue - sourceVoucherResult.amountPaid,
        metadata: { voucherId, targetVoucherId: targetVoucherResult?.id, addLateFine, customFineAmount },
      });

      broadcastEvent(
        {
          type: 'voucher_carried',
          institutionId,
          voucherId,
          targetMonth,
          revision: revInfo.revision,
          originClientId: clientId,
          lastModified: revInfo.lastModified,
        },
        institutionId
      );

      res.json({
        success: true,
        sourceVoucher: sourceVoucherResult,
        targetVoucher: targetVoucherResult || null,
        revision: revInfo.revision,
      });
    } catch (err: any) {
      console.error('[API] Error carrying forward voucher:', err);
      res.status(500).json({ success: false, error: err?.message || 'Carry forward failed' });
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
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
        if (amountPaid > netDue + TOLERANCE) {
          return res.status(400).json({ success: false, error: `Voucher ${v.id}: amountPaid cannot exceed netDue.` });
        }
      }

      const voucherIds = [...new Set([...voucherUpserts.map((v: any) => v.id), ...deleteVoucherIds])].filter(Boolean);
      const yearStr = new Date().getFullYear().toString();
      let deletedVoucherLabels: string[] = [];
      let editedVoucherLabels: string[] = [];

      await dbService.runVoucherTransaction(institutionId, { voucherIds }, async (_locked, helpers) => {
        // amountPaid must never increase for an existing voucher through this
        // generic upsert path — a real payment has to go through
        // /api/collections/receive, which creates the matching transaction
        // record. Without this check, anyone holding fees.edit could mark a
        // voucher "paid" with no transaction/collection ever created, and
        // (until the audit-logging gap is closed) leave no trace of it.
        for (const v of voucherUpserts) {
          const existing = _locked.get(v.id);
          if (existing && Number(v.amountPaid) > Number(existing.amountPaid) + TOLERANCE) {
            throw new Error(
              `Voucher ${v.id}: amountPaid cannot be increased via this endpoint — use the collections/receive flow to record a payment.`
            );
          }
        }

        deletedVoucherLabels = deleteVoucherIds.map((id: string) => _locked.get(id)?.voucherNo || id);
        editedVoucherLabels = voucherUpserts.map((v: any) => v.voucherNo || v.id);

        const upserts: Record<string, any> = {};
        for (const v of voucherUpserts) {
          if (v?.id) upserts[v.id] = v;
        }
        const collectionUpdatesMap: Record<string, { totalAmount: number; transactionCount: number }> = {};
        for (const c of collectionUpdates) {
          if (c?.id) collectionUpdatesMap[c.id] = { totalAmount: c.totalAmount, transactionCount: c.transactionCount };
        }

        // Never trust client-computed document numbers for anything actually
        // persisted — they're optimistic local placeholders (see
        // src/utils/sequence.ts). Re-mint authoritative ones here, exactly
        // like /api/collections/receive and /api/vouchers/generate do,
        // so a client's local counter drifting out of sync with the real
        // server sequence can never produce colliding document numbers.
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

      res.json({ success: true, revision: revInfo.revision });
    } catch (err: any) {
      console.error('[API] Failed to apply voucher batch update:', err);
      res.status(500).json({ success: false, error: err?.message || 'Batch update failed' });
    }
  });

  // Export database backup for tenant
  app.get('/api/backup/export', requireAuth('system.backup'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || (req.query.institutionId as string) || 'default';
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
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Multi-Tenant School Management Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Server] Database Engine: ${dbService.getEngine().toUpperCase()}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
  process.exit(1);
});
