import express from 'express';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { dbService, DbUser, DbInstitution } from './server/db';
import { hashPassword, verifyPassword } from './src/utils/passwords';
import { isPermissionAllowed } from './src/utils/permissions';

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
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
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

  // Parse cookies first for session tokens
  app.use(cookieParser());

  // Parse JSON payloads up to 50MB (to support bulk uploads, CSV imports, and document attachments)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Database Schema (no demo seeding - clean state for institutions)
  await dbService.init();

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
  function requireAuth(requiredPermission?: string) {
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
      const requestedTenant =
        (req.headers['x-institution-id'] as string) ||
        (req.body?.institutionId as string) ||
        (req.query?.institutionId as string);

      if (
        requestedTenant &&
        requestedTenant !== 'default' &&
        req.user.role !== 'Admin' &&
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

  // Apply authentication resolution globally
  app.use(resolveAuthSession);

  // Live SSE clients list partitioned by institution
  interface SseClient {
    id: string;
    institutionId: string;
    res: express.Response;
  }
  let sseClients: SseClient[] = [];

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
  app.post('/api/auth/register-institution', async (req, res) => {
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

      // Generate or clean school code
      let cleanCode = (schoolCode || '').trim().toUpperCase();
      if (!cleanCode) {
        const words = schoolName.trim().split(/\s+/);
        const prefix = words.length >= 2 ? (words[0][0] + words[1][0] + (words[2]?.[0] || 'S')).toUpperCase() : schoolName.substring(0, 3).toUpperCase();
        cleanCode = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
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
  app.post('/api/auth/validate-code', async (req, res) => {
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
  app.post('/api/auth/register-user', async (req, res) => {
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
        // Check institution code
        const institution = await dbService.getInstitutionByCode(cleanCode);
        if (!institution) {
          return res.status(404).json({ success: false, error: 'Invalid institution code or invite code.' });
        }
        targetInstitutionId = institution.id;
        assignedRole = 'Accountant'; // Default joining staff role
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
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password, institutionCode } = req.body;
      const cleanUsername = (username || '').trim().toLowerCase();

      if (!cleanUsername || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
      }

      let institutionId: string | undefined = undefined;
      if (institutionCode && institutionCode.trim()) {
        const inst = await dbService.getInstitutionByCode(institutionCode.trim());
        if (inst) institutionId = inst.id;
      }

      const dbUser = await dbService.getUserByUsername(cleanUsername, institutionId);
      if (!dbUser) {
        return res.status(401).json({
          success: false,
          error: 'User not found. Please verify your username and institution.',
        });
      }

      const valid = await verifyPassword(password, dbUser.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid password. Please try again.' });
      }

      // Update last login
      const now = new Date().toISOString();
      await dbService.updateUser(dbUser.id, { last_login_at: now });

      const institution = await dbService.getInstitutionById(dbUser.institution_id);

      // Mint session token and set HTTP-only cookie
      const sessionToken = mintSecureToken();
      await dbService.createSession(sessionToken, dbUser.id, dbUser.institution_id, SESSION_COOKIE_MAX_AGE);
      setSessionCookie(res, sessionToken);

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
  app.get('/api/institutions', async (req, res) => {
    try {
      const list = await dbService.listInstitutions();
      const sanitized = list.map((inst) => ({
        id: inst.id,
        name: inst.name,
        code: inst.code,
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
  app.post('/api/invites/create', requireAuth('admin:manage_users'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId;
      const { fullName, assignedRole, permissions, createdBy } = req.body;

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
        createdBy: createdBy || req.user?.full_name || 'Admin',
      });

      if (!result.success || !result.invite) {
        return res.status(400).json({ success: false, error: result.error || 'Failed to create invite.' });
      }

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

  app.get('/api/invites/list', requireAuth('admin:manage_users'), async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = (req.query.clientId as string) || Math.random().toString(36).substring(2, 10);
    const institutionId = (req.query.institutionId as string) || 'default';
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

  // Full state hydration for clients (Tenant-Scoped)
  app.get('/api/state', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || (req.query.institutionId as string) || 'default';
      const state = await dbService.getFullState(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);
      res.json({
        success: true,
        engine: dbService.getEngine(),
        revision: revInfo.revision,
        institutionId,
        data: state,
      });
    } catch (err: any) {
      console.error('[API] Failed to get state:', err);
      res.status(500).json({ success: false, error: err?.message || 'Database read failure' });
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
  app.post('/api/vouchers/generate', requireAuth('fees:generate_vouchers'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const { vouchers: rawVouchers, carriedPriorVouchers = [] } = req.body;

      if (!Array.isArray(rawVouchers) || rawVouchers.length === 0) {
        return res.status(400).json({ success: false, error: 'An array of vouchers is required.' });
      }

      // 1. Fetch current live vouchers to guard against duplicate generation
      const existingVouchers = await dbService.getCollection<any>(institutionId, 'vouchers');
      const existingKeySet = new Set(
        existingVouchers
          .filter((v: any) => v.status !== 'Reversed')
          .map((v: any) => `${v.studentId}:${v.month}`)
      );

      const createdVouchers: any[] = [];
      const updatedVouchersMap = new Map<string, any>();
      existingVouchers.forEach((v) => updatedVouchersMap.set(v.id, v));

      // 2. Mint atomic sequential document numbers for each voucher if needed
      for (const item of rawVouchers) {
        const key = `${item.studentId}:${item.month}`;
        if (existingKeySet.has(key)) {
          continue; // Skip already generated
        }

        const yearStr = item.month.split('-')[0];
        const voucherNo =
          item.voucherNo && !item.voucherNo.startsWith('TEMP_')
            ? item.voucherNo
            : await dbService.nextDocumentNumber(institutionId, 'FE', yearStr);

        const newVoucher = {
          ...item,
          id: item.id || `vch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          voucherNo,
          createdDate: item.createdDate || new Date().toISOString().split('T')[0],
        };

        createdVouchers.push(newVoucher);
        updatedVouchersMap.set(newVoucher.id, newVoucher);
        existingKeySet.add(key);
      }

      // 3. Mark any folded prior unpaid vouchers as Carried
      for (const prior of carriedPriorVouchers) {
        const priorId = typeof prior === 'string' ? prior : prior.id;
        const targetMonth = typeof prior === 'object' ? prior.targetMonth : undefined;
        if (updatedVouchersMap.has(priorId)) {
          const v = updatedVouchersMap.get(priorId);
          if (v.status !== 'Paid' && v.status !== 'Reversed') {
            updatedVouchersMap.set(priorId, {
              ...v,
              status: 'Carried',
              carryForwardMonth: targetMonth || v.carryForwardMonth,
            });
          }
        }
      }

      // 4. Atomically persist full vouchers collection
      const fullVoucherList = Array.from(updatedVouchersMap.values());
      const saved = await dbService.saveCollection(institutionId, 'vouchers', fullVoucherList);
      if (!saved) {
        return res.status(500).json({ success: false, error: 'Failed to commit generated vouchers.' });
      }

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

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
  app.post('/api/collections/receive', requireAuth('fees:collect_payment'), async (req: AuthenticatedRequest, res) => {
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

      // 1. Fetch live collections, transactions, and vouchers
      const [vouchers, collections, transactions] = await Promise.all([
        dbService.getCollection<any>(institutionId, 'vouchers'),
        dbService.getCollection<any>(institutionId, 'collections'),
        dbService.getCollection<any>(institutionId, 'transactions'),
      ]);

      const vouchersMap = new Map<string, any>(vouchers.map((v) => [v.id, { ...v }]));
      const yearStr = new Date().getFullYear().toString();
      const collectionNo = await dbService.nextDocumentNumber(institutionId, 'COL', yearStr);
      const collectionId = `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      let totalCollectionAmount = 0;
      const createdTxns: any[] = [];
      const updatedVouchersList: any[] = [];

      for (let i = 0; i < payments.length; i++) {
        const item = payments[i];
        const v = vouchersMap.get(item.voucherId);
        if (!v) {
          return res.status(404).json({ success: false, error: `Voucher ID ${item.voucherId} not found.` });
        }
        if (v.status === 'Reversed' || v.status === 'Carried') {
          return res.status(400).json({
            success: false,
            error: `Voucher ${v.voucherNo} is in status '${v.status}' and cannot accept payments.`,
          });
        }
        if (item.amount <= 0) {
          return res.status(400).json({ success: false, error: 'Payment amount must be greater than zero.' });
        }

        const txnNo = await dbService.nextDocumentNumber(institutionId, 'TXN', yearStr);

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
          id: `txn-${Date.now()}-${i}`,
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
        vouchersMap.set(v.id, v);
      }

      const newCollection = {
        id: collectionId,
        collectionNo,
        date,
        totalAmount: totalCollectionAmount,
        transactionCount: createdTxns.length,
        notes: collectionNotes || `Payment collection receipt ${collectionNo}`,
        isBulkImport: req.body.isBulkImport || false,
      };

      // 2. Commit all 3 collections atomically
      const [saveCol, saveTxn, saveVch] = await Promise.all([
        dbService.saveCollection(institutionId, 'collections', [newCollection, ...collections]),
        dbService.saveCollection(institutionId, 'transactions', [...createdTxns, ...transactions]),
        dbService.saveCollection(institutionId, 'vouchers', Array.from(vouchersMap.values())),
      ]);

      if (!saveCol || !saveTxn || !saveVch) {
        return res.status(500).json({ success: false, error: 'Failed to commit collection transaction.' });
      }

      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

      broadcastEvent(
        {
          type: 'payment_collected',
          institutionId,
          collectionNo,
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
  app.post('/api/vouchers/carry-forward', requireAuth('fees:generate_vouchers'), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const { voucherId, targetMonth, addLateFine = false, customFineAmount } = req.body;

      if (!voucherId || !targetMonth) {
        return res.status(400).json({ success: false, error: 'voucherId and targetMonth are required.' });
      }

      const vouchers = await dbService.getCollection<any>(institutionId, 'vouchers');
      const vouchersMap = new Map<string, any>(vouchers.map((v) => [v.id, { ...v }]));
      const voucher = vouchersMap.get(voucherId);

      if (!voucher) {
        return res.status(404).json({ success: false, error: 'Voucher not found.' });
      }
      if (voucher.status === 'Reversed') {
        return res.status(400).json({ success: false, error: 'Voucher is reversed and cannot be carried forward.' });
      }
      if (voucher.status === 'Paid' || voucher.status === 'Carried') {
        return res.status(400).json({ success: false, error: `Voucher is already in '${voucher.status}' status.` });
      }

      const outstandingBalance = voucher.netDue - voucher.amountPaid;
      if (outstandingBalance <= 0) {
        return res.status(400).json({ success: false, error: 'Voucher has no outstanding balance to carry forward.' });
      }

      // Mark source voucher as carried
      voucher.status = 'Carried';
      voucher.carryForwardMonth = targetMonth;
      vouchersMap.set(voucherId, voucher);

      // Check if target voucher exists
      const targetVoucher = Array.from(vouchersMap.values()).find(
        (v: any) => v.studentId === voucher.studentId && v.month === targetMonth && v.status !== 'Reversed'
      );

      const fineToApply = addLateFine
        ? customFineAmount !== undefined
          ? customFineAmount
          : voucher.lateFeeRate || 0
        : 0;

      if (targetVoucher) {
        // Fold outstanding balance into target voucher's particulars
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

        vouchersMap.set(targetVoucher.id, targetVoucher);
      }

      await dbService.saveCollection(institutionId, 'vouchers', Array.from(vouchersMap.values()));
      dbService.incrementRevision(institutionId);
      const revInfo = dbService.getRevisionInfo(institutionId);

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
        sourceVoucher: voucher,
        targetVoucher: targetVoucher || null,
        revision: revInfo.revision,
      });
    } catch (err: any) {
      console.error('[API] Error carrying forward voucher:', err);
      res.status(500).json({ success: false, error: err?.message || 'Carry forward failed' });
    }
  });

  // Atomic state synchronization (Tenant-Scoped)
  app.post('/api/sync', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || req.body._clientId || '';
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const payload = { ...req.body };
      delete payload._clientId;
      delete payload.institutionId;

      const result = await dbService.syncState(institutionId, payload);
      if (result.success) {
        const revInfo = dbService.getRevisionInfo(institutionId);
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
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API] Failed to sync state:', err);
      res.status(500).json({ success: false, error: err?.message || 'Database write failure' });
    }
  });

  // Export database backup for tenant
  app.get('/api/backup/export', requireAuth('admin:backup_data'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || (req.query.institutionId as string) || 'default';
      const state = await dbService.getFullState(institutionId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="school_backup_${institutionId}_${new Date().toISOString().split('T')[0]}.json"`
      );
      res.json(state);
    } catch (err: any) {
      console.error('[API] Failed to export backup:', err);
      res.status(500).json({ success: false, error: err?.message || 'Backup export failure' });
    }
  });

  // Restore database backup for tenant
  app.post('/api/backup/restore', requireAuth('admin:backup_data'), async (req: AuthenticatedRequest, res) => {
    try {
      const institutionId = req.institutionId || (req.headers['x-institution-id'] as string) || req.body.institutionId || 'default';
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid backup format' });
      }
      const result = await dbService.syncState(institutionId, backupData);
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
