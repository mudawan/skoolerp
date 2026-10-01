import { Institution, OperatorInvite, User } from '../types';

export interface ApiHealthResponse {
  status: string;
  engine: 'postgres';
  database?: {
    healthy: boolean;
    latencyMs?: number;
    strictPostgres: boolean;
    pool?: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    error?: string;
  };
  revision?: number;
  lastModified?: string;
  connectedClients?: number;
  uptime: number;
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
  isConnected: boolean;
  isSyncing: boolean;
  engine: string;
  latencyMs?: number;
  pool?: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  revision: number;
  activePeers: number;
  activeInstitutionId: string | null;
}

// Generate unique client ID for this browser tab to prevent echo updates
export const CLIENT_ID =
  'cli_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);

let activeInstitutionId: string | null = null;
let syncTimeout: any = null;
let pendingState: any = {};
let isSyncing = false;
let currentEngine: 'postgres' = 'postgres';
let isConnected = false;
let currentRevision = 1;
let activePeers = 1;
let dbLatencyMs: number | undefined = undefined;
let dbPoolStats: any = undefined;

let statusListeners: ((status: DbStatus) => void)[] = [];
let remoteUpdateListeners: ((data: any) => void)[] = [];
let syncFailureListeners: ((info: SyncFailureInfo) => void)[] = [];
let eventSource: EventSource | null = null;

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

export interface SyncFailureInfo {
  collection: string;
  failedIds: string[];
}

/**
 * Subscribe to background persistence failures from the debounced
 * simple-entity sync (queueDatabaseSync). Unlike the explicit, awaited
 * financial mutation paths (see reportFinancialSyncFailure in
 * AppContext.tsx), routine edits to students/classes/families/etc. are
 * queued and synced in the background with no caller left waiting for the
 * result — so without this, a rejected create/update/delete here was only
 * ever visible in the browser console. Returns an unsubscribe function.
 */
export function subscribeSyncFailures(callback: (info: SyncFailureInfo) => void): () => void {
  syncFailureListeners.push(callback);
  return () => {
    syncFailureListeners = syncFailureListeners.filter((l) => l !== callback);
  };
}

function notifySyncFailure(collection: string, failedIds: string[]) {
  if (failedIds.length === 0) return;
  syncFailureListeners.forEach((l) => l({ collection, failedIds }));
}

function notifyStatus() {
  const s: DbStatus = {
    isConnected,
    isSyncing,
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
    resetSyncSnapshots();
    notifyStatus();
  }
}

export function getActiveInstitutionId(): string | null {
  return activeInstitutionId;
}

export function resetSyncSnapshots(): void {
  lastSyncedSnapshots = {};
  permanentlyFailedIds = {};
  pendingState = {};
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  isSyncing = false;
}

export function initializeSyncSnapshots(data: any): void {
  if (!data) return;
  const populate = (collectionName: string, items: any[]) => {
    if (!Array.isArray(items)) return;
    const map = new Map<string, string>();
    for (const rawItem of items) {
      if (!rawItem?.id) continue;
      const item = stripFields(collectionName, rawItem);
      map.set(item.id, JSON.stringify(item));
    }
    lastSyncedSnapshots[collectionName] = map;
  };

  populate('classes', data.classes);
  populate('families', data.families);
  populate('students', data.students);
  populate('buses', data.buses);
  populate('stops', data.stops);
  populate('transportAssignments', data.transportAssignments);
  populate('templates', data.templates);
  populate('bankAccounts', data.bankAccounts);

  if (Array.isArray(data.studentAccountHistory)) {
    const histMap = new Map<string, string>();
    for (const h of data.studentAccountHistory) {
      if (h?.id) histMap.set(h.id, '1');
    }
    lastSyncedSnapshots['studentAccountHistory'] = histMap;
  }

  if (Array.isArray(data.lockedMonths)) {
    const lockMap = new Map<string, string>();
    for (const m of data.lockedMonths) {
      if (typeof m === 'string') lockMap.set(m, '1');
    }
    lastSyncedSnapshots['lockedMonths'] = lockMap;
  }

  if (data.institute && data.institute.name) {
    lastSyncedSnapshots['institute'] = new Map([['_', JSON.stringify(data.institute)]]);
  }
}

export function subscribeDbStatus(callback: (status: DbStatus) => void): () => void {
  statusListeners.push(callback);
  callback({
    isConnected,
    isSyncing,
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
    currentEngine = data.engine;
    dbLatencyMs = data.database?.latencyMs;
    dbPoolStats = data.database?.pool;
    if (data.revision) currentRevision = data.revision;
    if (typeof data.connectedClients === 'number') activePeers = data.connectedClients;
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
  const safeJson = async (p: Promise<Response>, fallback: any) => {
    try {
      const res = await p;
      if (!res.ok) return fallback;
      return await res.json();
    } catch {
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
      auditLogsRes,
      historyRes,
      lockedMonthsRes,
      meRes,
      usersRes,
    ] = await Promise.all([
      safeJson(fetch('/api/classes', { headers }), { items: [] }),
      safeJson(fetch('/api/families', { headers }), { items: [] }),
      // Students: unpaged dynamic fetch so components receive the complete roster
      safeJson(fetch('/api/students', { headers }), { students: [] }),
      safeJson(fetch('/api/transport/buses', { headers }), { items: [] }),
      safeJson(fetch('/api/transport/stops', { headers }), { items: [] }),
      safeJson(fetch('/api/transport/assignments', { headers }), { items: [] }),
      safeJson(fetch('/api/fee-templates', { headers }), { items: [] }),
      safeJson(fetch('/api/vouchers', { headers }), { vouchers: [] }),
      safeJson(fetch('/api/collections', { headers }), { collections: [] }),
      safeJson(fetch('/api/transactions', { headers }), { transactions: [] }),
      safeJson(fetch('/api/bank-accounts', { headers }), { items: [] }),
      safeJson(fetch('/api/audit-logs', { headers }), { logs: [] }),
      safeJson(fetch('/api/student-account-history', { headers }), { entries: [] }),
      safeJson(fetch('/api/locked-months', { headers }), { months: [] }),
      safeJson(fetch('/api/auth/me', { headers }), {}),
      // Users list requires users.manage; a caller without it gets a 403,
      // which safeJson turns into {} — applyServerState only overwrites
      // `users` when the array is non-empty, so this degrades gracefully.
      safeJson(fetch('/api/users', { headers }), {}),
    ]);

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
      vouchers: vouchersRes.vouchers || [],
      collections: collectionsRes.collections || [],
      transactions: transactionsRes.transactions || [],
      bankAccounts: bankAccountsRes.items || [],
      auditLogs: auditLogsRes.logs || [],
      studentAccountHistory: historyRes.entries || [],
      lockedMonths: lockedMonthsRes.months || [],
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
        sessionTimeoutMinutes: Number(instSettings?.sessionTimeoutMinutes) || 10,
        settings: instSettings,
      };
    }

    initializeSyncSnapshots(data);
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

// --- Per-collection diff-and-sync (replaces the old generic /api/sync) ---
//
// AppContext's persistence effect still computes and passes the FULL current
// value of every collection on every change (unchanged from before — see
// the useEffect that calls queueDatabaseSync near the top of AppContext.tsx).
// Rather than requiring changes to that effect or to the ~60 mutator
// functions that feed it, queueDatabaseSync() below diffs each collection
// against the last-synced snapshot and fires targeted REST calls only for
// what actually changed (create/update/delete), against the real per-entity
// endpoints — never a bulk "replace everything" call.
//
// Vouchers, collections, and transactions are deliberately NOT synced here:
// they go through the dedicated transactional endpoints
// (apiGenerateVouchers / apiReceiveCollection / apiCarryForwardVoucher),
// which is what actually keeps runVoucherTransaction's concurrency
// guarantees intact. `users` and `auditLogs` are also excluded — user
// management has its own endpoints, and audit logs are server-generated
// only.
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

// Fields to strip before diffing/sending `families` and `students`, since
// they're server-derived/not real columns and would otherwise cause every
// item to look "changed" every cycle (families.memberStudentIds is derived
// from students.familyId; students carries denormalized display-only
// fields on some responses).
const STRIP_BEFORE_SYNC: Record<string, string[]> = {
  families: ['memberStudentIds'],
};

let lastSyncedSnapshots: Record<string, Map<string, string>> = {};
// Permanently-failed ids (e.g. a 409 duplicate) are parked here so we don't
// retry something that will never succeed by retrying identically forever.
// Cleared automatically once the item is edited (its serialized form
// changes) or removed from the collection.
let permanentlyFailedIds: Record<string, Map<string, string>> = {};

function stripFields(collectionName: string, item: any): any {
  const strip = STRIP_BEFORE_SYNC[collectionName];
  if (!strip) return item;
  const copy = { ...item };
  for (const f of strip) delete copy[f];
  return copy;
}

async function diffAndSyncSimpleCollection(
  collectionName: string,
  endpoint: string,
  items: any[]
): Promise<{ failedIds: string[] }> {
  if (!activeInstitutionId) {
    return { failedIds: [] };
  }
  const prevMap = lastSyncedSnapshots[collectionName] || new Map<string, string>();
  const nextMap = new Map<string, string>();
  const failedMap = permanentlyFailedIds[collectionName] || new Map<string, string>();
  const currentIds = new Set<string>();
  const failedIds: string[] = [];

  for (const rawItem of items) {
    if (!rawItem?.id) continue;
    const item = stripFields(collectionName, rawItem);
    currentIds.add(item.id);
    const serialized = JSON.stringify(item);

    if (failedMap.get(item.id) === serialized) {
      // Unchanged since it last permanently failed (e.g. still the same
      // duplicate B-Form No.) — don't retry an operation that will fail
      // identically forever.
      nextMap.set(item.id, serialized);
      continue;
    }

    if (prevMap.get(item.id) === serialized) {
      nextMap.set(item.id, serialized);
      continue;
    }

    const isNew = !prevMap.has(item.id);
    try {
      const res = await fetch(isNew ? endpoint : `${endpoint}/${item.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {}),
        },
        body: JSON.stringify(item),
      });
      if (res.status >= 400 && res.status < 500) {
        // Permanent failure (validation error, duplicate, not found, etc.)
        // — record it and stop retrying until the item itself changes.
        const body = await res.json().catch(() => ({}));
        console.warn(`[Sync] ${collectionName}/${item.id} rejected (${res.status}):`, body?.error || res.statusText);
        failedMap.set(item.id, serialized);
        nextMap.set(item.id, serialized);
        failedIds.push(item.id);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      failedMap.delete(item.id);
      nextMap.set(item.id, serialized);
    } catch (err) {
      console.warn(`[Sync] Failed to persist ${collectionName}/${item.id}, will retry:`, err);
      // Leave it out of nextMap so it's retried on the next sync cycle.
      failedIds.push(item.id);
    }
  }

  for (const [id, serialized] of prevMap.entries()) {
    if (!currentIds.has(id)) {
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: 'DELETE',
          headers: activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {},
        });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
        failedMap.delete(id);
      } catch (err) {
        console.warn(`[Sync] Failed to delete ${collectionName}/${id}, will retry:`, err);
        nextMap.set(id, serialized); // keep tracking so we retry the delete next cycle
        failedIds.push(id);
      }
    }
  }

  lastSyncedSnapshots[collectionName] = nextMap;
  permanentlyFailedIds[collectionName] = failedMap;
  return { failedIds };
}

/**
 * Immediately (not debounced) diffs-and-syncs a single simple-entity
 * collection against the server and reports which ids, if any, failed to
 * persist (create/update rejected, or delete failed/was forbidden).
 *
 * Used by flows — like the Data Cleanup tool — that must know whether a
 * mutation actually reached the database before telling the user it
 * succeeded, rather than relying on the debounced background sync in
 * queueDatabaseSync(), which never reports failures back to its caller.
 */
export async function syncSimpleEntityCollectionNow(
  collectionName: keyof typeof SIMPLE_ENTITY_ENDPOINTS,
  items: any[]
): Promise<{ failedIds: string[] }> {
  const endpoint = SIMPLE_ENTITY_ENDPOINTS[collectionName];
  if (!endpoint) return { failedIds: [] };
  return diffAndSyncSimpleCollection(collectionName, endpoint, items);
}

async function diffAppendOnlyCollection(collectionName: string, endpoint: string, items: any[]) {
  if (!activeInstitutionId) return;
  const prevMap = lastSyncedSnapshots[collectionName] || new Map<string, string>();
  const nextMap = new Map<string, string>(prevMap);

  for (const item of items) {
    if (!item?.id || prevMap.has(item.id)) continue;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {}),
        },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        nextMap.set(item.id, '1');
      } else {
        console.warn(`[Sync] Failed to append ${collectionName}/${item.id}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[Sync] Failed to append ${collectionName}/${item.id}:`, err);
    }
  }

  lastSyncedSnapshots[collectionName] = nextMap;
}

/**
 * Syncs month-lock/unlock state against the server, reporting which
 * months failed to persist instead of silently marking them as synced.
 *
 * Previously this marked every month in `nextMap` unconditionally before
 * even attempting the request, and never checked `res.ok` — so a locked
 * month that was rejected server-side (permission edge case, transient
 * error) was recorded locally as "locked" forever, with no retry and no
 * indication to the user that the server never actually enforced the
 * lock. Month locks exist specifically to prevent further edits to a
 * closed accounting period, so a lock that silently didn't take is a
 * real integrity gap, not just a cosmetic one — this now only carries a
 * month forward as synced once the server has actually confirmed it.
 */
async function diffLockedMonths(months: string[]): Promise<{ failedIds: string[] }> {
  if (!activeInstitutionId) return { failedIds: [] };
  const prevSet = lastSyncedSnapshots['lockedMonths'] || new Map<string, string>();
  const nextMap = new Map<string, string>();
  const currentSet = new Set(months);
  const failedIds: string[] = [];

  for (const month of months) {
    if (prevSet.has(month)) {
      // Already confirmed locked as of the last successful sync.
      nextMap.set(month, '1');
      continue;
    }
    try {
      const res = await fetch('/api/locked-months', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {}),
        },
        body: JSON.stringify({ month }),
      });
      if (res.ok) {
        nextMap.set(month, '1');
      } else {
        console.warn(`[Sync] Failed to lock month ${month}: HTTP ${res.status}`);
        failedIds.push(`lock:${month}`);
        // Deliberately not added to nextMap, so this is retried on the
        // next sync cycle instead of being treated as locked.
      }
    } catch (err) {
      console.warn(`[Sync] Failed to lock month ${month}:`, err);
      failedIds.push(`lock:${month}`);
    }
  }

  for (const month of prevSet.keys()) {
    if (!currentSet.has(month)) {
      try {
        const res = await fetch(`/api/locked-months/${encodeURIComponent(month)}`, {
          method: 'DELETE',
          headers: activeInstitutionId ? { 'x-institution-id': activeInstitutionId } : {},
        });
        if (!res.ok && res.status !== 404) {
          console.warn(`[Sync] Failed to unlock month ${month}: HTTP ${res.status}`);
          failedIds.push(`unlock:${month}`);
          // Keep tracking it as locked so the unlock is retried next
          // cycle, and so the local UI doesn't show it as unlocked while
          // the server still has it locked.
          nextMap.set(month, '1');
        }
      } catch (err) {
        console.warn(`[Sync] Failed to unlock month ${month}:`, err);
        failedIds.push(`unlock:${month}`);
        nextMap.set(month, '1');
      }
    }
  }

  lastSyncedSnapshots['lockedMonths'] = nextMap;
  return { failedIds };
}

async function syncInstituteProfile(institute: any) {
  if (!activeInstitutionId || !institute || !institute.name) return;
  const serialized = JSON.stringify(institute);
  const prevMap = lastSyncedSnapshots['institute'] || new Map<string, string>();
  if (prevMap.get('_') === serialized) return;

  try {
    const res = await fetch('/api/institute', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': activeInstitutionId,
      },
      body: JSON.stringify({
        name: institute.name,
        logoUrl: institute.logoUrl,
        address: institute.address,
        phone: institute.phone,
        email: institute.email,
        website: institute.website,
        registrationNo: institute.regNo,
        settings: {
          sessionTimeoutMinutes: Number(institute.sessionTimeoutMinutes) || 10,
          ...(institute.settings || {}),
        },
      }),
    });
    if (res.ok) {
      lastSyncedSnapshots['institute'] = new Map([['_', serialized]]);
    } else {
      console.warn(`[Sync] Failed to update institute profile: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[Sync] Failed to update institute profile:', err);
  }
}

/**
 * Directly updates institution settings in PostgreSQL without disk caching.
 */
export async function apiUpdateInstituteSettings(settings: Record<string, any>): Promise<boolean> {
  if (!activeInstitutionId) return false;
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
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Directly synchronizes state with the PostgreSQL database for the active
 * institution without debounce delay. See the diff-and-sync functions above for how this maps
 * onto the real per-entity REST endpoints.
 */
export function queueDatabaseSync(payload: any, instId?: string, delayMs = 0): void {
  const targetId = instId || activeInstitutionId;
  if (!targetId) return;

  pendingState = { ...pendingState, ...payload };

  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  const flushSync = async () => {
    if (Object.keys(pendingState).length === 0) return;

    // Do not attempt to diff or emit offline failures if snapshots haven't been loaded yet for this institution
    if (!activeInstitutionId || Object.keys(lastSyncedSnapshots).length === 0) {
      return;
    }

    if (!isConnected) {
      pendingState = {};
      isSyncing = false;
      notifyStatus();
      notifySyncFailure('database', ['offline_blocked']);
      return;
    }

    const toSend = pendingState;
    pendingState = {};
    isSyncing = true;
    notifyStatus();

    try {
      const jobs: Promise<unknown>[] = [];

      for (const [collectionName, endpoint] of Object.entries(SIMPLE_ENTITY_ENDPOINTS)) {
        if (Array.isArray(toSend[collectionName])) {
          jobs.push(
            diffAndSyncSimpleCollection(collectionName, endpoint, toSend[collectionName]).then(
              ({ failedIds }) => notifySyncFailure(collectionName, failedIds)
            )
          );
        }
      }
      if (Array.isArray(toSend.studentAccountHistory)) {
        jobs.push(diffAppendOnlyCollection('studentAccountHistory', '/api/student-account-history', toSend.studentAccountHistory));
      }
      if (Array.isArray(toSend.lockedMonths)) {
        jobs.push(
          diffLockedMonths(toSend.lockedMonths).then(({ failedIds }) => notifySyncFailure('lockedMonths', failedIds))
        );
      }
      if (toSend.institute) {
        jobs.push(syncInstituteProfile(toSend.institute));
      }

      await Promise.all(jobs);
      isConnected = true;
    } catch (err) {
      console.warn('[Sync] Direct write to database encountered error:', err);
      isConnected = false;
    } finally {
      isSyncing = false;
      notifyStatus();
    }
  };

  if (delayMs <= 0) {
    // Direct immediate write to PostgreSQL
    flushSync();
  } else {
    syncTimeout = setTimeout(flushSync, delayMs);
  }
}

/**
 * Connects to live SSE stream for instant multi-user synchronization
 */
export function initLiveRealtimeSync(instId?: string): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const targetId = instId || activeInstitutionId || 'default';
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
          resetSyncSnapshots();
          try {
            sessionStorage.setItem('school_deleted_notice', 'This institution and all its data have been permanently deleted by an administrator.');
          } catch {}
          window.location.reload();
        } else if (
          msg.type === 'db_mutation' ||
          msg.type === 'vouchers_generated' ||
          msg.type === 'payment_collected' ||
          msg.type === 'voucher_carried'
        ) {
          if (msg.originClientId !== CLIENT_ID && (!msg.institutionId || msg.institutionId === targetId)) {
            if (msg.revision) currentRevision = msg.revision;
            const freshState = await fetchServerState(targetId);
            if (freshState?.success && freshState.data) {
              remoteUpdateListeners.forEach((fn) => fn(freshState.data));
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

export async function apiLogout(): Promise<{ success: boolean }> {
  setActiveInstitutionId(null);
  resetSyncSnapshots();
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

export async function apiListInstitutions(): Promise<{
  success: boolean;
  institutions?: Partial<Institution>[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/institutions');
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to retrieve institutions' };
  }
}

export async function apiCreateInvite(
  institutionId: string,
  params: {
    fullName: string;
    assignedRole: string;
    permissions: string[];
    createdBy?: string;
  }
): Promise<{ success: boolean; invite?: OperatorInvite; error?: string }> {
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
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-institution-id': instId },
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
    const instId = activeInstitutionId || 'default';
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-institution-id': instId },
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
    const instId = activeInstitutionId || 'default';
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-institution-id': instId },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: 'Failed to delete user' };
  }
}

export async function apiListInvites(
  institutionId: string
): Promise<{ success: boolean; invites?: OperatorInvite[]; error?: string }> {
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

export async function apiNextDocumentNumber(
  prefix: string,
  year: string,
  digits: number = 6
): Promise<string | null> {
  try {
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/sequences/next', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': instId,
      },
      body: JSON.stringify({ prefix, year, digits }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.documentNumber : null;
  } catch {
    return null;
  }
}

export async function apiNextDocumentBlock(
  prefix: string,
  year: string,
  count: number = 1,
  digits: number = 6
): Promise<string[] | null> {
  if (count <= 0) return [];
  try {
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/sequences/next', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-institution-id': instId,
      },
      body: JSON.stringify({ prefix, year, count, digits }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && Array.isArray(data.documentNumbers)) {
      return data.documentNumbers;
    }
    if (data.success && data.documentNumber) {
      return [data.documentNumber];
    }
    return null;
  } catch {
    return null;
  }
}


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
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/vouchers/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-institution-id': instId,
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
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/collections/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-institution-id': instId,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}

export async function apiCarryForwardVoucher(params: {
  voucherId: string;
  targetMonth: string;
  addLateFine?: boolean;
  customFineAmount?: number;
}): Promise<{
  success: boolean;
  sourceVoucher?: any;
  targetVoucher?: any;
  error?: string;
}> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Balance carry-forward is blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/vouchers/carry-forward', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-institution-id': instId,
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
}): Promise<{ success: boolean; revision?: number; error?: string }> {
  if (!isConnected) {
    return {
      success: false,
      error: 'Database is currently offline. Batch ledger updates are blocked until connection to PostgreSQL is restored.',
    };
  }
  try {
    const instId = activeInstitutionId || 'default';
    const res = await fetch('/api/vouchers/batch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CLIENT_ID,
        'x-institution-id': instId,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed' };
  }
}
