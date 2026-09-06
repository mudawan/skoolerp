export interface ApiHealthResponse {
  status: string;
  engine: 'postgres' | 'sqlite';
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
  data: any;
  error?: string;
}

export interface DbStatus {
  isConnected: boolean;
  isSyncing: boolean;
  engine: string;
  revision: number;
  activePeers: number;
}

// Generate unique client ID for this browser tab to prevent echo updates
export const CLIENT_ID =
  'cli_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);

let syncTimeout: any = null;
let pendingState: any = {};
let isSyncing = false;
let currentEngine: 'postgres' | 'sqlite' = 'sqlite';
let isConnected = false;
let currentRevision = 1;
let activePeers = 1;

let statusListeners: ((status: DbStatus) => void)[] = [];
let remoteUpdateListeners: ((data: any) => void)[] = [];
let eventSource: EventSource | null = null;

function notifyStatus() {
  const s: DbStatus = {
    isConnected,
    isSyncing,
    engine: currentEngine,
    revision: currentRevision,
    activePeers,
  };
  statusListeners.forEach((l) => l(s));
}

export function subscribeDbStatus(callback: (status: DbStatus) => void): () => void {
  statusListeners.push(callback);
  callback({
    isConnected,
    isSyncing,
    engine: currentEngine,
    revision: currentRevision,
    activePeers,
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
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ApiHealthResponse = await res.json();
    isConnected = true;
    currentEngine = data.engine;
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
 * Fetches authoritative database state from the server
 */
export async function fetchServerState(): Promise<ApiStateResponse | null> {
  try {
    const res = await fetch('/api/state');
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
    console.warn('[Sync] Could not reach backend API state, using local fallback:', err);
    isConnected = false;
    notifyStatus();
    return null;
  }
}

/**
 * Queues state to be synced with the backend database
 */
export function queueDatabaseSync(payload: any, delayMs = 250): void {
  pendingState = { ...pendingState, ...payload };

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    if (Object.keys(pendingState).length === 0) return;

    const toSend = { ...pendingState, _clientId: CLIENT_ID };
    pendingState = {};
    isSyncing = true;
    notifyStatus();

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': CLIENT_ID,
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
export function initLiveRealtimeSync(): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let reconnectTimer: any = null;

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`/api/events?clientId=${encodeURIComponent(CLIENT_ID)}`);

    eventSource.onopen = () => {
      isConnected = true;
      notifyStatus();
    };

    eventSource.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'handshake') {
          if (msg.revision) currentRevision = msg.revision;
        } else if (msg.type === 'db_mutation') {
          // If update came from a different client, reload remote state
          if (msg.originClientId !== CLIENT_ID) {
            if (msg.revision) currentRevision = msg.revision;
            const freshState = await fetchServerState();
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

  // Periodic lightweight revision check (every 20s as safeguard)
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/revision');
      if (res.ok) {
        const data = await res.json();
        if (data.revision && data.revision > currentRevision) {
          currentRevision = data.revision;
          const fresh = await fetchServerState();
          if (fresh?.success && fresh.data) {
            remoteUpdateListeners.forEach((fn) => fn(fresh.data));
          }
        }
      }
    } catch {
      // Offline fallback
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
