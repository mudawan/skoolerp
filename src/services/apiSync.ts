import { Institution, OperatorInvite, User } from '../types';

export interface ApiHealthResponse {
  status: string;
  engine: 'postgres' | 'sqlite';
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
  engine: 'postgres' | 'sqlite';
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
let currentEngine: 'postgres' | 'sqlite' = 'sqlite';
let isConnected = false;
let currentRevision = 1;
let activePeers = 1;
let dbLatencyMs: number | undefined = undefined;
let dbPoolStats: any = undefined;

let statusListeners: ((status: DbStatus) => void)[] = [];
let remoteUpdateListeners: ((data: any) => void)[] = [];
let eventSource: EventSource | null = null;

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
 * Fetches authoritative database state from the server for the active institution
 */
export async function fetchServerState(instId?: string): Promise<ApiStateResponse | null> {
  const targetId = instId || activeInstitutionId;
  if (!targetId) return null;

  try {
    const res = await fetch(`/api/state?institutionId=${encodeURIComponent(targetId)}`, {
      headers: {
        'x-institution-id': targetId,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ApiStateResponse = await res.json();
    if (data.success && data.data) {
      isConnected = true;
      currentEngine = data.engine;
      if (data.revision) currentRevision = data.revision;
      notifyStatus();
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[Sync] Could not reach backend API state:', err);
    isConnected = false;
    notifyStatus();
    return null;
  }
}

/**
 * Queues state to be synced with the backend database for the active institution
 */
export function queueDatabaseSync(payload: any, instId?: string, delayMs = 250): void {
  const targetId = instId || activeInstitutionId;
  if (!targetId) return;

  pendingState = { ...pendingState, ...payload };

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    if (Object.keys(pendingState).length === 0) return;

    const toSend = { ...pendingState, _clientId: CLIENT_ID, institutionId: targetId };
    pendingState = {};
    isSyncing = true;
    notifyStatus();

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': CLIENT_ID,
          'x-institution-id': targetId,
        },
        body: JSON.stringify(toSend),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) {
        isConnected = true;
      }
    } catch (err) {
      console.warn('[Sync] Background sync to database encountered error:', err);
      // Re-queue failed items if not superseded
      pendingState = { ...toSend, ...pendingState };
      delete pendingState._clientId;
      delete pendingState.institutionId;
      isConnected = false;
    } finally {
      isSyncing = false;
      notifyStatus();
    }
  }, delayMs);
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

export async function apiGenerateVouchers(
  vouchers: any[],
  carriedPriorVouchers: any[] = []
): Promise<{ success: boolean; generatedCount?: number; vouchers?: any[]; error?: string }> {
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
  payments: {
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
