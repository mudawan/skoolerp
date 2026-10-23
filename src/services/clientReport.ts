// Reports failures only the browser can see to the server's monitoring (POST /api/client-errors):
//  - client_network: a request that changes data (POST/PUT/PATCH/DELETE) never got an answer
//    (network down, server unreachable, connection cut). The server cannot log these itself, and
//    each one is an operator action that did not go through.
//  - client_error: a JavaScript error or an unhandled promise rejection.
//
// What is sent: the kind, the URL path (no query string), the method, and a short message. Never
// a request body or anything the operator typed. Reports are queued while the network is down
// and sent when it is back, de-duplicated and rate-limited so a broken page cannot flood the log.
// This is a best-effort side channel: it never throws and never blocks the app.

type Kind = 'client_network' | 'client_error';
interface Report { kind: Kind; path?: string; method?: string; context?: string; message?: string; at: string }

const ENDPOINT = '/api/client-errors';
const MAX_QUEUE = 20;
const MAX_PER_MINUTE = 10;
const DEDUPE_MS = 60_000;

let queue: Report[] = [];
let sending = false;
let installed = false;
const recent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);

export function reportClientFailure(r: Omit<Report, 'at'>): void {
  try {
    const now = Date.now();
    if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
    if (windowCount >= MAX_PER_MINUTE) return;
    const key = `${r.kind}|${r.method || ''}|${r.path || ''}|${r.message || ''}`;
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    windowCount++;
    queue.push({ ...r, path: clip(r.path, 200), message: clip(r.message, 300), context: clip(r.context, 64), at: new Date(now).toISOString() });
    if (queue.length > MAX_QUEUE) queue.shift();
    void flush();
  } catch {
    /* reporting must never throw */
  }
}

async function flush(realFetch: typeof fetch = nativeFetch): Promise<void> {
  if (sending || queue.length === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  sending = true;
  try {
    while (queue.length > 0) {
      const next = queue[0];
      const res = await realFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
        keepalive: true,
      });
      // Signed out (401), or rate limited (429): drop it rather than retrying forever.
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 429 || res.status === 400) queue.shift();
      else break;
    }
  } catch {
    /* still offline: keep the queue; flushed again on 'online' or the next report */
  } finally {
    sending = false;
  }
}

const nativeFetch: typeof fetch = (...a) => (globalThis as any).__nativeFetch(...a);

/** Installs the global hooks once. Call before the app renders. */
export function installClientFailureReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  (globalThis as any).__nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await (globalThis as any).__nativeFetch(input, init);
    } catch (err) {
      try {
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        const url = new URL(raw, window.location.href);
        const writes = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
        const leaving = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const aborted = (err as any)?.name === 'AbortError';
        if (writes && !aborted && !leaving && url.origin === window.location.origin && url.pathname.startsWith('/api/') && url.pathname !== ENDPOINT) {
          reportClientFailure({ kind: 'client_network', path: url.pathname, method, message: clip((err as any)?.message, 120) || 'Network request failed' });
        }
      } catch {
        /* ignore */
      }
      throw err;
    }
  };

  window.addEventListener('online', () => void flush());
  window.addEventListener('error', (e) => {
    // Resource load errors (images, scripts) arrive here as Events without a message.
    if (!e.message) return;
    reportClientFailure({ kind: 'client_error', context: 'window.onerror', message: e.message });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    reportClientFailure({ kind: 'client_error', context: 'unhandledrejection', message: String(reason?.message || reason || 'Unhandled rejection') });
  });
}
