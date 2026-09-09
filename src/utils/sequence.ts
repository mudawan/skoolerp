import { apiNextDocumentNumber } from '../services/apiSync';

// Monotonic, per `prefix:year` document counters (vouchers, collections,
// transactions). Counters are NEVER decreased: deleting a voucher/collection/
// transaction does not reopen its number for reuse, producing stable
// checkbook-style gaps that auditors can reconcile against. Each counter is
// persisted independently of the data arrays, so it survives deletions and
// reloads.
//
// In Phase 3, this is backed by PostgreSQL server sequences via /api/sequences/next
// for high-concurrency multi-tenant safety, with local synchronous sequence store
// acting as instant zero-latency fallback and offline cache.
//
// Design note (server migration): the sequence logic is kept behind the
// `SequenceStore` interface below, so the storage backend is a single,
// swappable adapter. During development the app uses localStorage (no server);
// when it moves to a server-side database, only the default adapter needs to
// change (e.g. to a `fetch` to a DB sequence endpoint that atomically
// increments per prefix:year). The public API used by AppContext is unchanged,
// so no call sites are touched on that migration.
//
// Synchronous guard: numbers are minted by mutating a module-level map and
// writing straight back through the store, entirely outside React's batched
// async state updates. This guarantees uniqueness even when several documents
// are created inside one synchronous loop (e.g. a bulk carry-forward or CSV
// import calling generate/collect repeatedly). For a true multi-device,
// concurrent guarantee once a backend exists, the store's `next` should
// perform an atomic increment on the server (e.g. a SQL `UPDATE ... RETURNING`
// or a Redis INCR), which removes any read-modify-write race.

export interface SequenceStore {
  read(): Record<string, number>;
  write(map: Record<string, number>): void;
}

const SEQ_STORAGE_KEY = 'skooler_app_sequences_v1';

const localStorageStore: SequenceStore = {
  read() {
    try {
      const raw = localStorage.getItem(SEQ_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },
  write(map) {
    try {
      localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore storage failures (private mode / quota). The in-memory counter
      // still guarantees uniqueness for this session.
    }
  },
};

// The active backend. Swap this (plus `next`/`reconcile` below if the server
// needs atomic increments) when moving to a server-side database.
let store: SequenceStore = localStorageStore;

let seqCache: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (seqCache) return seqCache;
  seqCache = store.read();
  return seqCache;
}

function persist() {
  store.write(seqCache || {});
}

function seqKey(prefix: string, year: string): string {
  return `${prefix}:${year}`;
}

// Re-read the store and adopt any higher value committed by another
// session since our last read, keeping this counter monotonic.
function mergeFor(prefix: string, year: string) {
  const k = seqKey(prefix, year);
  try {
    const disk = store.read();
    const diskVal = disk[k] || 0;
    const cur = seqCache && seqCache[k] ? seqCache[k] : 0;
    if (diskVal > cur) {
      if (!seqCache) seqCache = {};
      seqCache[k] = diskVal;
    }
  } catch {
    // ignore
  }
}

// Return the next monotonic sequence number for a `prefix:year` series.
export function nextNumber(prefix: string, year: string): number {
  if (!seqCache) load();
  mergeFor(prefix, year);
  const k = seqKey(prefix, year);
  const next = (seqCache![k] || 0) + 1;
  seqCache![k] = next;
  persist();
  return next;
}

// Adopt the highest number already present in the live data, so restored
// backups / imported records with higher numbers are never re-issued.
export function reconcileSequence(entries: { prefix: string; year: string; number: number }[]): void {
  if (!seqCache) load();
  let changed = false;
  entries.forEach(({ prefix, year, number }) => {
    if (number <= 0) return;
    const k = seqKey(prefix, year);
    if (number > (seqCache![k] || 0)) {
      seqCache![k] = number;
      changed = true;
    }
  });
  if (changed) persist();
}

// Mint a fully formatted document number, e.g. `FE2026-000042`.
export function nextDocumentNumber(prefix: string, year: string, digits = 6): string {
  return `${prefix}${year}-${String(nextNumber(prefix, year)).padStart(digits, '0')}`;
}

/**
 * Mint a guaranteed server-side atomic document number directly from PostgreSQL sequences
 */
export async function fetchAtomicServerDocumentNumber(
  prefix: string,
  year: string,
  digits = 6
): Promise<string> {
  const remoteNo = await apiNextDocumentNumber(prefix, year, digits);
  if (remoteNo) {
    // Extract the counter portion to reconcile the local fallback cache
    const match = remoteNo.match(/-(\d+)$/);
    if (match) {
      reconcileSequence([{ prefix, year, number: parseInt(match[1], 10) }]);
    }
    return remoteNo;
  }
  return nextDocumentNumber(prefix, year, digits);
}
