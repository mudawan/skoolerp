import { Institution, OperatorInvite, ServerInvite, User } from '../types';

export interface ApiHealthResponse {
  status: string;
  database?: { healthy: boolean };
  revision?: number;
  lastModified?: string;
  timestamp: string;
}

export interface ApiStateResponse {
  success: boolean;
  engine: 'postgres';
  revision?: number;
  institutionId?: string;
  data: any;
  error?: string;
}

export interface DbStatus {
  activeInstitutionId?: string | null;
  isConnected: boolean;
  engine: string;
  latencyMs?: number;
  pool?: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  revision: number;
  activePeers: number;
}

// Generate unique client ID for this browser tab to prevent echo updates
export const CLIENT_ID =
  'cli_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);

let activeInstitutionId: string | null = null;
let currentEngine: 'postgres' = 'postgres';
let isConnected = false;
let currentRevision = 1;
let activePeers = 1;
let dbLatencyMs: number | undefined = undefined;
let dbPoolStats: any = undefined;

let statusListeners: ((status: DbStatus) => void)[] = [];
let remoteUpdateListeners: ((data: any) => void)[] = [];
let eventSource: EventSource | null = null;

let actionLockDepth = 0;

export function setActionLockActive(active: boolean) {
  if (active) {
    actionLockDepth++;
  } else {
    actionLockDepth = Math.max(0, actionLockDepth - 1);
  }
}

export function isActionLockActive(): boolean {
  return actionLockDepth > 0;
}

// Purge any lingering read-replica cache keys from client localStorage
try {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('skooler_read_replica_')) {
      localStorage.removeItem(k);
    }
  });
} catch {}

/**
 * Returns whether the PostgreSQL backend is currently connected and healthy.
 */
export function isBackendConnected(): boolean {
  return isConnected;
}

/**
 * Validates that mutating operations (financial or structural) are allowed.
 * Fails fast if the database is offline, preventing data overwrites or inconsistent states.
 */
export function checkMutationAllowed(): { allowed: boolean; error?: string } {
  if (!isConnected) {
    return {
      allowed: false,
      error:
        'PostgreSQL database is currently offline. All financial operations and data updates are blocked until connection is restored to prevent multi-operator conflicts.',
    };
  }
  return { allowed: true };
}

function notifyStatus() {
  const s: DbStatus = {
    isConnected,
    engine: currentEngine,
    latencyMs: dbLatencyMs,
    pool: dbPoolStats,
    revision: currentRevision,
    activePeers,
    activeInstitutionId,
  };
  statusListeners.forEach((l) => l(s));
}

export function setActiveInstitutionId(id: string | null) {
  if (activeInstitutionId !== id) {
    activeInstitutionId = id;
    notifyStatus();
  }
}

export function getActiveInstitutionId(): string | null {
  return activeInstitutionId;
}

export function subscribeDbStatus(callback: (status: DbStatus) => void): () => void {
  statusListeners.push(callback);
  callback({
    isConnected,
    engine: currentEngine,
    latencyMs: dbLatencyMs,
    pool: dbPoolStats,
    revision: currentRevision,
    activePeers,
    activeInstitutionId,
  });
  return () => {
    statusListeners = statusListeners.filter((l) => l !== callback);
  };
}

export function subscribeRemoteChanges(callback: (data: any) => void): () => void {
  remoteUpdateListeners.push(callback);
  return () => {
    remoteUpdateListeners = remoteUpdateListeners.filter((l) => l !== callback);
  };
}

/**
 * Checks backend health and database engine
 */
export async function checkBackendHealth(): Promise<ApiHealthResponse | null> {
  try {
    const url = activeInstitutionId
      ? `/api/health?institutionId=${encodeURIComponent(activeInstitutionId)}`
      : '/api/health';
    const res = await fetch(url, {
      headers: activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ApiHealthResponse = await res.json();
    isConnected = data.database?.healthy ?? true;
    if (data.revision) currentRevision = data.revision;
    notifyStatus();
    return data;
  } catch (err) {
    isConnected = false;
    notifyStatus();
    return null;
  }
}

/**
 * Fetches authoritative database state from the server for the active
 * institution. Internally calls the per-entity REST endpoints in parallel
 * and assembles them into the same flat shape AppContext's
 * applyServerState() already expects — this means the three call sites
 * (initial load, post-register, post-login) and the SSE/poll-triggered
 * refresh mechanism all keep working unmodified.
 */
export async function fetchServerState(instId?: string): Promise<ApiStateResponse | null> {
  const targetId = instId || activeInstitutionId;
  if (!targetId) return null;

  const headers = { 'x-institution-id': targetId };
  // A request that fails for a technical reason (5xx, network, timeout) must NOT
  // turn into an empty list: the app would show "no vouchers" / "no locked
  // months" and carry on as if that were true. Such failures are collected and
  // the whole load is reported as failed. A 401/403 only means this user may
  // not see that data (e.g. no transport.view), so it keeps the empty fallback.
  const failedParts: string[] = [];
  const safeJson = async (p: Promise<Response>, fallback: any, label?: string) => {
    try {
      const res = await p;
      if (res.status === 401 || res.status === 403) return fallback;
      if (!res.ok) {
        if (label) failedParts.push(label);
        return fallback;
      }
      return await res.json();
    } catch {
      if (label) failedParts.push(label);
      return fallback;
    }
  };

  try {
    const [
      classesRes,
      familiesRes,
      studentsRes,
      busesRes,
      stopsRes,
      assignmentsRes,
      templatesRes,
      vouchersRes,
      collectionsRes,
      transactionsRes,
      bankAccountsRes,
      historyRes,
      lockedMonthsRes,
      meRes,
      usersRes,
    ] = await Promise.all([
      safeJson(fetch('/api/classes', { headers }), { items: [] }, 'classes'),
      safeJson(fetch('/api/families', { headers }), { items: [] }, 'families'),
      // Students: unpaged dynamic fetch so components receive the complete roster
      safeJson(fetch('/api/students', { headers }), { students: [] }, 'students'),
      safeJson(fetch('/api/transport/buses', { headers }), { items: [] }, 'buses'),
      safeJson(fetch('/api/transport/stops', { headers }), { items: [] }, 'stops'),
      safeJson(fetch('/api/transport/assignments', { headers }), { items: [] }, 'transport assignments'),
      safeJson(fetch('/api/fee-templates', { headers }), { items: [] }, 'fee templates'),
      // Working set only: everything from the oldest unlocked month on, each
      // student's latest voucher and every open voucher. Closed (locked)
      // history is fetched on demand — see apiFetchHistory.
      safeJson(fetch('/api/vouchers?window=1', { headers }), { vouchers: [] }, 'vouchers'),
      safeJson(fetch('/api/collections?window=1', { headers }), { collections: [] }, 'collections'),
      safeJson(fetch('/api/transactions?window=1', { headers }), { transactions: [] }, 'transactions'),
      safeJson(fetch('/api/bank-accounts', { headers }), { items: [] }, 'bank accounts'),
      safeJson(fetch('/api/student-account-history', { headers }), { entries: [] }, 'account history'),
      safeJson(fetch('/api/locked-months', { headers }), { months: [] }, 'closed months'),
      safeJson(fetch('/api/auth/me', { headers }), {}, 'institute details'),
      // Users list requires users.manage; a caller without it gets a 403,
      // which safeJson turns into {} — applyServerState only overwrites
      // `users` when the array is non-empty, so this degrades gracefully.
      safeJson(fetch('/api/users', { headers }), {}),
    ]);

    if (failedParts.length > 0) {
      console.warn('[Sync] State load incomplete:', failedParts);
      return {
        success: false,
        engine: 'postgres',
        data: null,
        error: `Could not load ${failedParts.join(', ')}. Nothing was changed on screen; please retry.`,
      };
    }

    const institution = meRes?.institution;
    const studentList = studentsRes.students || [];

    const data: any = {
      users: usersRes.users || [],
      classes: classesRes.items || [],
      students: studentList,
      // memberStudentIds is derived server-side from students.familyId — the
      // relational schema doesn't store it redundantly on the family row.
      families: (familiesRes.items || []).map((f: any) => ({
        ...f,
        memberStudentIds: studentList.filter((s: any) => s.familyId === f.id).map((s: any) => s.id),
      })),
      buses: busesRes.items || [],
      stops: stopsRes.items || [],
      transportAssignments: assignmentsRes.items || [],
      templates: templatesRes.items || [],
      institutionId: targetId,
      windowStart: typeof vouchersRes.windowStart === 'string' ? vouchersRes.windowStart : undefined,
      vouchers: vouchersRes.vouchers || [],
      collections: collectionsRes.collections || [],
      transactions: transactionsRes.transactions || [],
      bankAccounts: bankAccountsRes.items || [],
      studentAccountHistory: historyRes.entries || [],
      lockedMonths: lockedMonthsRes.months || [],
      lockedMonthDetails: lockedMonthsRes.details || [],
    };

    if (institution) {
      let instSettings: any = {};
      try {
        if (institution.settings) {
          instSettings = typeof institution.settings === 'string'
            ? JSON.parse(institution.settings)
            : institution.settings;
        }
      } catch {}

      data.institute = {
        name: institution.name || '',
        logoUrl: institution.logo_url || institution.logoUrl || '',
        address: institution.address || '',
        phone: institution.phone || '',
        email: institution.email || '',
        website: institution.website || '',
        regNo: institution.registration_no || institution.regNo || '',
        currency: institution.currency || 'USD',
        sessionTimeoutMinutes: Number(instSettings?.sessionTimeoutMinutes) || 10,
        settings: instSettings,
      };
    }
    isConnected = true;
    currentEngine = currentEngine || 'postgres';
    notifyStatus();
    return { success: true, engine: currentEngine, revision: currentRevision, institutionId: targetId, data };
  } catch (err) {
    console.warn('[Sync] Could not reach backend API state:', err);
    isConnected = false;
    notifyStatus();
    return null;
  }
}

// --- Confirmed batch endpoints ---
// Every entity collection is written through apiCommitBatch (below): one all-or-nothing call
// per change, and the screen follows only after the server confirms. There is no background
// diff-and-sync any more. Vouchers, collections and transactions use their own transactional
// endpoints (apiGenerateVouchers / apiReceiveCollection / apiCarryForwardBatch).
const SIMPLE_ENTITY_ENDPOINTS: Record<string, string> = {
  classes: '/api/classes',
  families: '/api/families',
  buses: '/api/transport/buses',
  stops: '/api/transport/stops',
  transportAssignments: '/api/transport/assignments',
  templates: '/api/fee-templates',
  bankAccounts: '/api/bank-accounts',
  students: '/api/students',
};

// Family numbers are issued by the server. When a newly created family comes back with a
// different number than the client's provisional one, this handler lets the app adopt it.
// Permanently-failed ids (e.g. a 409 duplicate) are parked here so we don't
// retry something that will never succeed by retrying identically forever.
// Cleared automatically once the item is edited (its serialized form
// changes) or removed from the collection.

export async function apiLockMonth(month: string, notes: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/locked-months', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...instHeaders() },
      body: JSON.stringify({ month, notes }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) return { success: false, error: body?.error || `Lock failed (HTTP ${res.status}).` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error while locking month.' };
  }
}

export async function apiUnlockMonth(month: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/locked-months/${encodeURIComponent(month)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...instHeaders() },
      body: JSON.stringify({ reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) return { success: false, error: body?.error || `Unlock failed (HTTP ${res.status}).` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error while unlocking month.' };
  }
}

/**
 * Directly updates institution settings in PostgreSQL without disk caching.
 */
export async function apiUpdateInstituteSettings(settings: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  if (!activeInstitutionId) return { success: false, error: 'No institution is selected.' };
  try {
    const res = await fetch('/api/institute', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': activeInstitutionId,
      },
      body: JSON.stringify({
        settings,
      }),
    });
    if (res.ok) return { success: true };
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body?.error || 'The server did not accept the settings change.' };
  } catch {
    return { success: false, error: 'Could not reach the server. Nothing was changed.' };
  }
}

/**
 * Connects to live SSE stream for instant multi-user synchronization
 */
export function initLiveRealtimeSync(instId?: string): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const targetId = instId || activeInstitutionId;
  if (!targetId) {
    return () => {};
  }
  let reconnectTimer: any = null;

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    const url = `/api/events?clientId=${encodeURIComponent(CLIENT_ID)}&institutionId=${encodeURIComponent(targetId)}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      isConnected = true;
      notifyStatus();
    };

    eventSource.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'handshake') {
          if (msg.revision) currentRevision = msg.revision;
        } else if (msg.type === 'INSTITUTION_DELETED') {
          setActiveInstitutionId(null);
          try {
            sessionStorage.setItem('school_deleted_notice', 'This institution and all its data have been permanently deleted by an administrator.');
          } catch {}
          window.location.reload();
        } else if (
          msg.type === 'db_mutation' ||
          msg.type === 'vouchers_generated' ||
          msg.type === 'payment_collected' ||
          msg.type === 'voucher_carried' ||
          msg.type === 'vouchers_bulk_carried'
        ) {
          if (msg.originClientId !== CLIENT_ID && (!msg.institutionId || msg.institutionId === targetId)) {
            if (isActionLockActive()) {
              // Defer applying remote state while local transactional action lock is in progress
              return;
            }
            if (msg.revision) currentRevision = msg.revision;
            let freshState = await fetchServerState(targetId);
            if (!freshState?.success) {
              // A failed partial load must never be applied; retry once shortly after.
              await new Promise((r) => setTimeout(r, 3000));
              freshState = await fetchServerState(targetId);
            }
            if (freshState?.success && freshState.data) {
              remoteUpdateListeners.forEach((fn) => fn(freshState.data));
            } else {
              console.warn('[Sync] Live refresh skipped: could not load latest data.');
            }
          }
        }
      } catch (err) {
        console.debug('[Sync] SSE payload parse error:', err);
      }
    };

    eventSource.onerror = () => {
      isConnected = false;
      notifyStatus();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 5000);
      }
    };
  }

  connect();

  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/revision?institutionId=${encodeURIComponent(targetId)}`, {
        headers: { 'x-institution-id': targetId },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.revision && data.revision > currentRevision) {
          if (isActionLockActive()) {
            return;
          }
          currentRevision = data.revision;
          const fresh = await fetchServerState(targetId);
          if (fresh?.success && fresh.data) {
            remoteUpdateListeners.forEach((fn) => fn(fresh.data));
          }
        }
      }
    } catch {
      // Offline
    }
  }, 20000);

  return () => {
    clearInterval(pollInterval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

// --- Multi-Tenant API Methods ---

export async function apiRegisterInstitution(params: {
  schoolName: string;
  schoolCode?: string;
  currency?: string;
  address?: string;
  phone?: string;
  email?: string;
  regNo?: string;
  adminName: string;
  adminUsername: string;
  adminEmail?: string;
  adminPassword: string;
}): Promise<{ success: boolean; institution?: Institution; user?: User; error?: string }> {
  try {
    const res = await fetch('/api/auth/register-institution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network connection failed' };
  }
}

export async function apiValidateCode(
  code: string
): Promise<{
  success: boolean;
  type?: 'institution' | 'invite';
  institution?: Partial<Institution> | null;
  invite?: Partial<OperatorInvite>;
  error?: string;
}> {
  try {
    const res = await fetch('/api/auth/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network connection failed' };
  }
}

export async function apiRegisterUser(params: {
  code: string;
  fullName: string;
  username: string;
  password: string;
  email?: string;
}): Promise<{ success: boolean; user?: User; institution?: Institution; error?: string }> {
  try {
    const res = await fetch('/api/auth/register-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network connection failed' };
  }
}

export async function apiLogin(
  username: string,
  password: string,
  institutionCode?: string
): Promise<{ success: boolean; user?: User; institution?: Institution; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, institutionCode }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network connection failed' };
  }
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network connection failed' };
  }
}

export async function apiGetMe(): Promise<{
  success: boolean;
  user?: User;
  institution?: Institution;
  error?: string;
}> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {},
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to verify session' };
  }
}

export interface UserPreferences {
  themeConfig?: { color?: string; sidebarTheme?: string };
  sidebarCollapsed?: boolean;
}

export async function apiGetPreferences(): Promise<{ success: boolean; preferences?: UserPreferences; error?: string }> {
  try {
    const res = await fetch('/api/auth/preferences');
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load preferences' };
  }
}

export async function apiSavePreferences(
  patch: UserPreferences
): Promise<{ success: boolean; preferences?: UserPreferences; error?: string }> {
  try {
    const res = await fetch('/api/auth/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save preferences' };
  }
}

export async function apiLogout(): Promise<{ success: boolean }> {
  setActiveInstitutionId(null);
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data;
  } catch {
    return { success: true };
  }
}

export async function apiDeleteInstitution(
  institutionId: string,
  confirmationText: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/institution', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': institutionId,
      },
      body: JSON.stringify({ confirmationText }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to connect to server.' };
  }
}

export async function apiCreateInvite(
  institutionId: string,
  params: {
    fullName: string;
    assignedRole: string;
    permissions: string[];
    createdBy?: string;
    inviteCode?: string;
  }
): Promise<{ success: boolean; invite?: ServerInvite; error?: string }> {
  try {
    const res = await fetch('/api/invites/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': institutionId,
      },
      body: JSON.stringify({ ...params, institutionId }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to generate invite code' };
  }
}

export async function apiCreateUser(
  params: { username: string; name: string; email?: string; password: string; role: string; permissions: string[] }
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...instHeaders() },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to create user' };
  }
}

export async function apiUpdateUser(
  id: string,
  updates: Partial<{ username: string; name: string; email: string; role: string; permissions: string[]; status: string; password: string }>
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...instHeaders() },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to update user' };
  }
}

export async function apiDeleteUser(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...instHeaders() },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to delete user' };
  }
}

export async function apiListInvites(
  institutionId: string
): Promise<{ success: boolean; invites?: ServerInvite[]; error?: string }> {
  try {
    const res = await fetch(`/api/invites/list?institutionId=${encodeURIComponent(institutionId)}`, {
      headers: { 'x-institution-id': institutionId },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to retrieve invites' };
  }
}

// --- Granular Transactional Financial API Helpers (Phase 3) ---


export async function apiGenerateVouchers(
  vouchers: any[],
  carriedPriorVouchers: any[] = []
): Promise<{ success: boolean; generatedCount?: number; vouchers?: any[]; error?: string }> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Voucher generation is blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const res = await fetch('/api/vouchers/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        ...instHeaders(),
      },
      body: JSON.stringify({ vouchers, carriedPriorVouchers }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}

export async function apiReceiveCollection(params: {
  collectionId?: string;
  payments: {
    id?: string;
    transactionId?: string;
    voucherId: string;
    amount: number;
    paymentMode: string;
    referenceNo?: string;
    notes?: string;
    date?: string;
    fineAdded?: number;
    updatedParticulars?: any[];
  }[];
  collectionNotes?: string;
  date?: string;
  isBulkImport?: boolean;
}): Promise<{
  success: boolean;
  collection?: any;
  transactions?: any[];
  updatedVouchers?: any[];
  error?: string;
}> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Payment collection is blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const res = await fetch('/api/collections/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        ...instHeaders(),
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}

export async function apiCarryForwardBatch(params: {
  voucherIds: string[];
  targetMonth: string;
  addLateFine?: boolean;
  customFineAmount?: number;
  perVoucherFines?: Record<string, number>;
  /** School policy the server needs for rounding, default fine and due date. */
  policy: {
    roundingEnabled: boolean;
    roundingMultiple: number;
    defaultLateFeeRate: number;
    settingsDueDate: string;
  };
}): Promise<{
  success: boolean;
  count?: number;
  updatedVouchers?: any[];
  errors?: string[];
  error?: string;
}> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Balance carry-forward is blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const res = await fetch('/api/vouchers/carry-forward-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        ...instHeaders(),
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}

/**
 * Persists a targeted set of voucher/transaction/collection changes the
 * client has already computed (voucher deletion with cascade/auto-heal,
 * collection-reversal fine undo, etc.) — see the server-side handler's
 * comment for why the client owns this business logic rather than the
 * server re-deriving it.
 */
export async function apiVoucherBatchUpdate(params: {
  voucherUpserts?: any[];
  deleteVoucherIds?: string[];
  deleteTransactionIds?: string[];
  newTransactions?: any[];
  newCollections?: any[];
  collectionUpdates?: { id: string; totalAmount: number; transactionCount: number }[];
  deleteCollectionIds?: string[];
}): Promise<{ success: boolean; revision?: number; vouchers?: { id: string; voucherNo: string }[]; error?: string }> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Batch ledger updates are blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const res = await fetch('/api/vouchers/batch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        ...instHeaders(),
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}


// ---------------------------------------------------------------------------
// Audit trail: fetched on demand (paged / filtered on the server), never part
// of the startup state.
// ---------------------------------------------------------------------------

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  actionType?: string[];
  operator?: string;
  module?: string;
  month?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  export?: boolean;
}

const auditQueryString = (query: AuditLogQuery): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (k === 'export') {
      sp.set('export', '1');
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length > 0) sp.set(k, v.join(','));
    } else {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
};

const instHeaders = (): Record<string, string> =>
  activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {};

/** Headers every school-scoped request needs (used by add-on modules that make their own requests). */
export const getApiHeaders = (): Record<string, string> => ({ 'x-client-id': CLIENT_ID, ...instHeaders() });

/** Late fine charged since each student's last payment, keyed by student id (server-derived). */
export async function apiFetchFineSincePayment(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch('/api/reports/fine-since-payment', { headers: instHeaders() });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body && body.success && body.fines ? (body.fines as Record<string, number>) : null;
  } catch {
    return null;
  }
}

export async function apiFetchAuditLogs(
  query: AuditLogQuery,
  signal?: AbortSignal
): Promise<{ logs: any[]; total: number } | null> {
  try {
    const res = await fetch(`/api/audit-logs?${auditQueryString(query)}`, { headers: instHeaders(), signal });
    if (!res.ok) return null;
    const data = await res.json();
    return { logs: data.logs || [], total: Number(data.total) || 0 };
  } catch {
    return null;
  }
}

export interface AuditSummary {
  total: number;
  byType: Record<string, { count: number; amount: number }>;
  operators: { id: string; username: string; name: string }[];
  months: string[];
  modules: string[];
}

export async function apiFetchAuditSummary(
  query: Pick<AuditLogQuery, 'dateFrom' | 'dateTo'>,
  signal?: AbortSignal
): Promise<AuditSummary | null> {
  try {
    const res = await fetch(`/api/audit-logs/summary?${auditQueryString(query)}`, { headers: instHeaders(), signal });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      total: Number(data.total) || 0,
      byType: data.byType || {},
      operators: data.operators || [],
      months: data.months || [],
      modules: data.modules || [],
    };
  } catch {
    return null;
  }
}

export async function apiPurgeAuditLogs(
  olderThanMonths: number,
  dryRun: boolean
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const res = await fetch('/api/audit-logs/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...instHeaders() },
      body: JSON.stringify({ olderThanMonths, dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, count: 0, error: data.error || 'Purge failed.' };
    return { success: true, count: Number(data.count) || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Purge failed.' };
  }
}

/** Fire-and-forget: records a browser-originated event on the server (operator comes from the session). */
export function apiPostAuditEvent(entry: Record<string, any>): void {
  fetch('/api/audit-logs/client-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...instHeaders() },
    body: JSON.stringify(entry),
  }).catch(() => {});
}


/**
 * Closed-history fetch (vouchers + their collections and transactions).
 * Either a month range (monthFrom <= month < monthBefore) or one student's
 * history before `monthBefore`.
 */
export async function apiFetchHistory(params: {
  monthFrom?: string;
  monthBefore?: string;
  studentId?: string;
}): Promise<{ success: boolean; vouchers: any[]; collections: any[]; transactions: any[]; error?: string }> {
  const q = new URLSearchParams();
  if (params.monthFrom) q.set('monthFrom', params.monthFrom);
  if (params.monthBefore) q.set('monthBefore', params.monthBefore);
  if (params.studentId) q.set('studentId', params.studentId);
  const qs = q.toString();
  try {
    const get = async (path: string) => {
      const res = await fetch(`${path}?${qs}`, { headers: instHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const [v, c, t] = await Promise.all([get('/api/vouchers'), get('/api/collections'), get('/api/transactions')]);
    return {
      success: true,
      vouchers: v.vouchers || [],
      collections: c.collections || [],
      transactions: t.transactions || [],
    };
  } catch (err: any) {
    return { success: false, vouchers: [], collections: [], transactions: [], error: err?.message || 'Failed to load history.' };
  }
}

/** Ids of EVERY voucher, collection and transaction (not just the working set) — used by destructive purges. */
export async function apiFetchAllFinancialIds(): Promise<{
  success: boolean;
  voucherIds: string[];
  collectionIds: string[];
  transactionIds: string[];
  error?: string;
}> {
  try {
    const get = async (path: string) => {
      const res = await fetch(path, { headers: instHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const [v, c, t] = await Promise.all([get('/api/vouchers'), get('/api/collections'), get('/api/transactions')]);
    return {
      success: true,
      voucherIds: (v.vouchers || []).map((x: any) => x.id),
      collectionIds: (c.collections || []).map((x: any) => x.id),
      transactionIds: (t.transactions || []).map((x: any) => x.id),
    };
  } catch (err: any) {
    return { success: false, voucherIds: [], collectionIds: [], transactionIds: [], error: err?.message || 'Failed to list records.' };
  }
}


// ---- Audit-gap notice -------------------------------------------------------
// The server sets X-Audit-Warning when an action succeeded but its audit log
// entry could not be written. Surface that instead of leaving it console-only.
type AuditWarningListener = () => void;
const auditWarningListeners = new Set<AuditWarningListener>();
export function subscribeAuditWarnings(fn: AuditWarningListener): () => void {
  auditWarningListeners.add(fn);
  return () => { auditWarningListeners.delete(fn); };
}
if (typeof window !== 'undefined' && !(window as any).__auditFetchWrapped) {
  (window as any).__auditFetchWrapped = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await nativeFetch(...args);
    try {
      if (res.headers.get('X-Audit-Warning')) auditWarningListeners.forEach((fn) => fn());
    } catch {}
    return res;
  };
}


// ---- Confirmed writes (the server decides; the screen follows) -----------------
// A change to an entity collection is sent as one all-or-nothing batch and the
// caller shows it only after the server has confirmed it.

export type CommitEntity =
  | 'classes' | 'families' | 'students' | 'buses' | 'stops'
  | 'transportAssignments' | 'templates' | 'bankAccounts';

export interface CommitResult {
  success: boolean;
  /** Rows as saved by the server (students come back under `items` too). */
  items?: any[];
  /** Families created/updated as part of a student batch. */
  families?: any[];
  deletedIds?: string[];
  error?: string;
  /** STALE_VERSION and IN_USE mean local data is out of date or conflicts. */
  code?: string;
}

export async function apiCommitBatch(
  entity: CommitEntity,
  body: { upserts?: any[]; deleteIds?: string[]; history?: any[]; familyUpserts?: any[] }
): Promise<CommitResult> {
  if (!activeInstitutionId) return { success: false, error: 'You are not signed in to an institution.' };
  const endpoint = entity === 'students' ? '/api/students/batch' : `${SIMPLE_ENTITY_ENDPOINTS[entity]}/batch`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-institution-id': activeInstitutionId },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return {
        success: false,
        code: json.code,
        error: json.error || `The server rejected the change (HTTP ${res.status}). Nothing was saved.`,
      };
    }
    return {
      success: true,
      items: entity === 'students' ? json.students : json.items,
      families: json.families,
      deletedIds: json.deletedIds,
    };
  } catch {
    return { success: false, error: 'Could not reach the server. Nothing was saved.' };
  }
}

