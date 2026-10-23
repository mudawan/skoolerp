// Platform (app-owner) API. Everything here lives under /api/platform and is guarded by
// requirePlatform(). It shares nothing with the school session: its own table, its own
// cookie (scoped to /api/platform so the browser never sends it to a school route), no
// Bearer tokens, and the x-institution-id header is never read.
import crypto from 'crypto';
import express from 'express';
import { dbService, DbPlatformAdmin } from './db';
import { hashPassword, verifyPassword } from '../src/utils/passwords';
import {
  ALL_PLATFORM_PERMISSION_CODES,
  PLATFORM_ROLE_PERMISSIONS,
  isPlatformRole,
  platformCan,
  type PlatformPermission,
} from '../src/utils/platformPermissions';

export const PLATFORM_COOKIE_NAME = 'platform_session_token';
const PLATFORM_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
export const MIN_PLATFORM_PASSWORD = 12;
const MAX_PLATFORM_PASSWORD = 128;

export interface PlatformRequest extends express.Request {
  platformAdmin?: DbPlatformAdmin;
  platformToken?: string;
}

const publicAdmin = (a: DbPlatformAdmin) => ({
  id: a.id,
  username: a.username,
  name: a.full_name,
  role: a.role,
  status: a.status,
  lastLogin: a.last_login_at,
  createdAt: a.created_at,
  permissions: isPlatformRole(a.role) ? PLATFORM_ROLE_PERMISSIONS[a.role] : [],
});

// A real hash to compare against when the username does not exist, so a wrong username and a
// wrong password take about the same time and give the same answer.
let dummyHash: Promise<string> | null = null;

export function registerPlatformRoutes(
  app: express.Express,
  opts: { loginLimiter: express.RequestHandler; cookieSecure: boolean; getSseCount: () => number }
) {
  const cookieOpts = { httpOnly: true, secure: opts.cookieSecure, sameSite: 'strict' as const, path: '/api/platform' };

  /** Guard for every platform route. Validates the permission code at registration (startup). */
  function requirePlatform(permission?: PlatformPermission) {
    if (permission && !ALL_PLATFORM_PERMISSION_CODES.includes(permission)) {
      throw new Error(`[PLATFORM RBAC CONFIG ERROR] unknown platform permission '${permission}'.`);
    }
    return async (req: PlatformRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const token = req.cookies?.[PLATFORM_COOKIE_NAME];
        const admin = typeof token === 'string' && token ? await dbService.getPlatformSession(token) : null;
        if (!admin) return res.status(401).json({ success: false, error: 'Platform sign-in required.' });
        if (admin.status !== 'active') return res.status(403).json({ success: false, error: 'This platform account is deactivated.' });
        if (permission && !platformCan(admin.role, permission)) {
          return res.status(403).json({ success: false, error: `Access denied: requires '${permission}'.` });
        }
        req.platformAdmin = admin;
        req.platformToken = token;
        next();
      } catch (err) {
        console.error('[Platform] session check failed:', err);
        res.status(500).json({ success: false, error: 'Platform authentication error.' });
      }
    };
  }

  const audit = (req: PlatformRequest, e: { actionType: string; actionTitle: string; description?: string; targetUserId?: string; metadata?: Record<string, any> }) =>
    dbService.appendPlatformAudit({
      adminId: req.platformAdmin?.id,
      adminUsername: req.platformAdmin?.username,
      adminRole: req.platformAdmin?.role,
      ...e,
    });

  // ---- Session ----
  app.post('/api/platform/login', opts.loginLimiter, async (req, res) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!username || !password || username.length > 128 || password.length > 256) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
      }
      const admin = await dbService.getPlatformAdminByUsername(username);
      if (!dummyHash) dummyHash = hashPassword('not-a-real-password-' + crypto.randomBytes(8).toString('hex'));
      const ok = await verifyPassword(password, admin ? admin.password_hash : await dummyHash);
      if (!admin || !ok || admin.status !== 'active') {
        await dbService.appendPlatformAudit({
          adminId: admin?.id, adminUsername: username, actionType: 'login_failed', actionTitle: 'Platform login failed',
          description: admin && ok ? 'Account is deactivated.' : 'Wrong username or password.',
        });
        return res.status(401).json({ success: false, error: 'Invalid username or password.' });
      }
      const token = 'ptk_' + crypto.randomBytes(32).toString('hex');
      await dbService.createPlatformSession(token, admin.id, PLATFORM_SESSION_MS);
      await dbService.updatePlatformAdmin(admin.id, { lastLoginAt: new Date().toISOString() });
      res.cookie(PLATFORM_COOKIE_NAME, token, cookieOpts); // ephemeral: gone when the browser closes
      await dbService.appendPlatformAudit({
        adminId: admin.id, adminUsername: admin.username, adminRole: admin.role, actionType: 'login', actionTitle: 'Platform login',
      });
      res.json({ success: true, admin: publicAdmin(admin) });
    } catch (err) {
      console.error('[Platform] login error:', err);
      res.status(500).json({ success: false, error: 'Authentication service error.' });
    }
  });

  app.post('/api/platform/logout', requirePlatform(), async (req: PlatformRequest, res) => {
    await dbService.deletePlatformSession(req.platformToken as string);
    res.clearCookie(PLATFORM_COOKIE_NAME, cookieOpts);
    await audit(req, { actionType: 'logout', actionTitle: 'Platform logout' });
    res.json({ success: true });
  });

  app.get('/api/platform/me', requirePlatform(), (req: PlatformRequest, res) => {
    res.json({ success: true, admin: publicAdmin(req.platformAdmin as DbPlatformAdmin) });
  });

  // ---- Platform admins (Owner only) ----
  app.get('/api/platform/admins', requirePlatform('platform.admins.manage'), async (_req, res) => {
    res.json({ success: true, admins: (await dbService.listPlatformAdmins()).map(publicAdmin) });
  });

  const validPassword = (p: unknown): string | null => {
    if (typeof p !== 'string' || p.length < MIN_PLATFORM_PASSWORD || p.length > MAX_PLATFORM_PASSWORD) {
      return `Password must be ${MIN_PLATFORM_PASSWORD}–${MAX_PLATFORM_PASSWORD} characters.`;
    }
    return null;
  };

  app.post('/api/platform/admins', requirePlatform('platform.admins.manage'), async (req: PlatformRequest, res) => {
    try {
      const b = req.body || {};
      const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
      const fullName = typeof b.name === 'string' ? b.name.trim() : '';
      if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
        return res.status(400).json({ success: false, error: 'Username must be 3–64 characters: letters, digits, dot, dash, underscore.' });
      }
      if (!fullName || fullName.length > 128) return res.status(400).json({ success: false, error: 'Name is required.' });
      if (!isPlatformRole(b.role)) return res.status(400).json({ success: false, error: 'Role must be owner, support or observer.' });
      const pwErr = validPassword(b.password);
      if (pwErr) return res.status(400).json({ success: false, error: pwErr });
      if (await dbService.getPlatformAdminByUsername(username)) {
        return res.status(409).json({ success: false, error: `Username '${username}' is already taken.` });
      }
      const created = await dbService.createPlatformAdmin({
        username, fullName, role: b.role, passwordHash: await hashPassword(b.password), createdBy: req.platformAdmin!.id,
      });
      await audit(req, {
        actionType: 'admin_created', actionTitle: 'Platform admin created',
        description: `Created platform admin '${username}' with role ${b.role}.`, metadata: { targetAdminId: created.id },
      });
      res.json({ success: true, admin: publicAdmin(created) });
    } catch (err: any) {
      console.error('[Platform] create admin failed:', err);
      res.status(500).json({ success: false, error: 'Failed to create platform admin.' });
    }
  });

  app.put('/api/platform/admins/:id', requirePlatform('platform.admins.manage'), async (req: PlatformRequest, res) => {
    try {
      const target = await dbService.getPlatformAdminById(req.params.id);
      if (!target) return res.status(404).json({ success: false, error: 'Platform admin not found.' });
      const b = req.body || {};
      const self = target.id === req.platformAdmin!.id;
      const updates: { fullName?: string; role?: string; status?: string; passwordHash?: string } = {};
      const changed: string[] = [];
      if (b.name !== undefined) {
        if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 128) return res.status(400).json({ success: false, error: 'Name is invalid.' });
        updates.fullName = b.name.trim();
        changed.push('name');
      }
      if (b.role !== undefined && b.role !== target.role) {
        if (!isPlatformRole(b.role)) return res.status(400).json({ success: false, error: 'Role must be owner, support or observer.' });
        if (self) return res.status(400).json({ success: false, error: 'You cannot change your own role.' });
        updates.role = b.role;
        changed.push('role');
      }
      if (b.status !== undefined && b.status !== target.status) {
        if (b.status !== 'active' && b.status !== 'deactivated') return res.status(400).json({ success: false, error: 'Status must be active or deactivated.' });
        if (self) return res.status(400).json({ success: false, error: 'You cannot change your own status.' });
        updates.status = b.status;
        changed.push('status');
      }
      // The last active owner can neither be demoted nor deactivated: someone must always be able to manage admins.
      const losesOwner = target.role === 'owner' && target.status === 'active' &&
        ((updates.role && updates.role !== 'owner') || updates.status === 'deactivated');
      if (losesOwner && (await dbService.countActivePlatformOwners()) <= 1) {
        return res.status(400).json({ success: false, error: 'This is the last active owner and cannot be demoted or deactivated.' });
      }
      if (b.password !== undefined) {
        const pwErr = validPassword(b.password);
        if (pwErr) return res.status(400).json({ success: false, error: pwErr });
        updates.passwordHash = await hashPassword(b.password);
        changed.push('password');
      }
      if (changed.length === 0) return res.json({ success: true, admin: publicAdmin(target) });
      await dbService.updatePlatformAdmin(target.id, updates);
      // A new password, a new role or deactivation ends that admin's existing sessions.
      if (updates.passwordHash || updates.role || updates.status === 'deactivated') await dbService.deletePlatformAdminSessions(target.id);
      await audit(req, {
        actionType: 'admin_updated', actionTitle: 'Platform admin updated',
        description: `Updated platform admin '${target.username}' (${changed.join(', ')}).`,
        metadata: { targetAdminId: target.id, changedFields: changed },
      });
      res.json({ success: true, admin: publicAdmin((await dbService.getPlatformAdminById(target.id)) as DbPlatformAdmin) });
    } catch (err) {
      console.error('[Platform] update admin failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update platform admin.' });
    }
  });

  // ---- Monitoring dashboards (read-only) ----
  const RANGES: Record<string, { minutes: number; step: number }> = {
    '1h': { minutes: 60, step: 1 },
    '6h': { minutes: 360, step: 5 },
    '24h': { minutes: 1440, step: 15 },
    '7d': { minutes: 10080, step: 60 },
    '14d': { minutes: 20160, step: 180 },
  };
  const rangeOf = (q: any) => RANGES[typeof q === 'string' ? q : ''] || RANGES['1h'];
  const str = (v: any, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);

  app.get('/api/platform/monitor/api', requirePlatform('platform.monitor.view'), async (req, res) => {
    try {
      const r = rangeOf(req.query.range);
      res.json({ success: true, ...(await dbService.getApiHealth(r.minutes, r.step)) });
    } catch (err) {
      console.error('[Platform] api health failed:', err);
      res.status(500).json({ success: false, error: 'Could not read API health.' });
    }
  });

  app.get('/api/platform/monitor/database', requirePlatform('platform.monitor.view'), async (req, res) => {
    try {
      const r = rangeOf(req.query.range);
      const mem = process.memoryUsage();
      res.json({
        success: true,
        ...(await dbService.getDatabaseHealth(r.minutes, r.step)),
        server: {
          uptimeSeconds: Math.round(process.uptime()), node: process.version, rssBytes: mem.rss, heapUsedBytes: mem.heapUsed,
          connectedClients: opts.getSseCount(), now: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[Platform] database health failed:', err);
      res.status(500).json({ success: false, error: 'Could not read database health.' });
    }
  });

  app.get('/api/platform/monitor/errors', requirePlatform('platform.monitor.view'), async (req, res) => {
    try {
      const r = rangeOf(req.query.range);
      const limit = Number(req.query.limit);
      res.json({
        success: true,
        ...(await dbService.getErrorOverview(r.minutes, r.step, {
          kind: str(req.query.kind, 32), institutionId: str(req.query.school, 64), route: str(req.query.route, 200),
          requestId: str(req.query.requestId, 32), limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
        })),
      });
    } catch (err) {
      console.error('[Platform] errors overview failed:', err);
      res.status(500).json({ success: false, error: 'Could not read the error log.' });
    }
  });

  // ---- Schools and support actions ----
  // The school is named by the URL (an explicit target chosen by the admin), never inferred from a session.
  const RESET_PER_HOUR = 10;
  const TEMP_PASSWORD_HOURS = 72;
  const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no 0/O, 1/l/I
  const tempPassword = () => Array.from({ length: 16 }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join('');
  const who = (req: PlatformRequest) => ({ id: req.platformAdmin!.id, username: req.platformAdmin!.username, role: req.platformAdmin!.role });
  const idParam = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
  const fail = (res: express.Response, err: any, what: string) => {
    if (err?.code === 'LAST_ADMIN') return res.status(409).json({ success: false, code: 'LAST_ADMIN', error: 'This is the last active administrator of the school. Reset their password instead, or make another administrator first.' });
    console.error(`[Platform] ${what} failed:`, err);
    return res.status(500).json({ success: false, error: `Could not ${what}.` });
  };

  app.get('/api/platform/schools', requirePlatform('platform.schools.view'), async (_req, res) => {
    try { res.json({ success: true, schools: await dbService.listSchoolsForPlatform() }); } catch (err) { fail(res, err, 'list schools'); }
  });

  app.get('/api/platform/schools/:id/users', requirePlatform('platform.schools.view'), async (req, res) => {
    try {
      const id = idParam(req.params.id);
      const users = id ? await dbService.listSchoolUsersForPlatform(id) : null;
      if (!users) return res.status(404).json({ success: false, error: 'School not found.' });
      res.json({ success: true, users });
    } catch (err) { fail(res, err, 'list users'); }
  });

  app.post('/api/platform/schools/:id/suspend', requirePlatform('platform.schools.suspend'), async (req: PlatformRequest, res) => {
    try {
      const id = idParam(req.params.id);
      const school = id ? await dbService.getInstitutionById(id) : null;
      if (!school) return res.status(404).json({ success: false, error: 'School not found.' });
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 5 || reason.length > 500) return res.status(400).json({ success: false, error: 'Give a reason of 5–500 characters.' });
      if (String(req.body?.confirmCode || '').trim().toLowerCase() !== school.code.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Type the school code exactly to confirm.' });
      }
      const out = await dbService.platformSetSchoolSuspended(who(req), school.id, true, reason);
      res.json({ success: true, ...out });
    } catch (err) { fail(res, err, 'suspend the school'); }
  });

  app.post('/api/platform/schools/:id/reactivate', requirePlatform('platform.schools.suspend'), async (req: PlatformRequest, res) => {
    try {
      const id = idParam(req.params.id);
      const out = id ? await dbService.platformSetSchoolSuspended(who(req), id, false, '') : null;
      if (!out) return res.status(404).json({ success: false, error: 'School not found.' });
      res.json({ success: true, ...out });
    } catch (err) { fail(res, err, 'reactivate the school'); }
  });

  app.post('/api/platform/schools/:id/revoke-sessions', requirePlatform('platform.users.manage'), async (req: PlatformRequest, res) => {
    try {
      const id = idParam(req.params.id);
      const out = id ? await dbService.platformRevokeSchoolSessions(who(req), id) : null;
      if (!out) return res.status(404).json({ success: false, error: 'School not found.' });
      res.json({ success: true, ...out });
    } catch (err) { fail(res, err, 'sign everyone out'); }
  });

  app.post('/api/platform/schools/:id/users/:userId/reset-password', requirePlatform('platform.users.manage'), async (req: PlatformRequest, res) => {
    try {
      const id = idParam(req.params.id), userId = idParam(req.params.userId);
      if (!id || !userId) return res.status(404).json({ success: false, error: 'User not found.' });
      if ((await dbService.countRecentPlatformActions(req.platformAdmin!.id, 'user_password_reset', 60)) >= RESET_PER_HOUR) {
        return res.status(429).json({ success: false, error: `Limit reached: at most ${RESET_PER_HOUR} password resets per hour per admin.` });
      }
      const password = tempPassword();
      const expiresAt = new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000);
      const out = await dbService.platformResetUserPassword(who(req), id, userId, await hashPassword(password), expiresAt);
      if (!out) return res.status(404).json({ success: false, error: 'User not found in that school.' });
      // Shown once to the admin; only its hash is stored and it is never logged.
      res.json({ success: true, username: out.username, temporaryPassword: password, expiresAt: expiresAt.toISOString(), sessionsEnded: out.sessionsEnded });
    } catch (err) { fail(res, err, 'reset the password'); }
  });

  app.post('/api/platform/schools/:id/users/:userId/revoke-sessions', requirePlatform('platform.users.manage'), async (req: PlatformRequest, res) => {
    try {
      const id = idParam(req.params.id), userId = idParam(req.params.userId);
      const out = id && userId ? await dbService.platformRevokeUserSessions(who(req), id, userId) : null;
      if (!out) return res.status(404).json({ success: false, error: 'User not found in that school.' });
      res.json({ success: true, ...out });
    } catch (err) { fail(res, err, 'sign the user out'); }
  });

  for (const [action, active] of [['deactivate', false], ['reactivate', true]] as const) {
    app.post(`/api/platform/schools/:id/users/:userId/${action}`, requirePlatform('platform.users.manage'), async (req: PlatformRequest, res) => {
      try {
        const id = idParam(req.params.id), userId = idParam(req.params.userId);
        const out = id && userId ? await dbService.platformSetUserActive(who(req), id, userId, active) : null;
        if (!out) return res.status(404).json({ success: false, error: 'User not found in that school.' });
        res.json({ success: true, ...out });
      } catch (err) { fail(res, err, `${action} the user`); }
    });
  }

  // ---- Platform audit log ----
  app.get('/api/platform/audit-logs', requirePlatform('platform.audit.view'), async (req, res) => {
    const limit = Number(req.query.limit);
    res.json({ success: true, logs: await dbService.listPlatformAudit(Number.isFinite(limit) && limit > 0 ? limit : 200) });
  });
}
