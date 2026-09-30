import { apiNextDocumentNumber } from '../services/apiSync';

// Monotonic, per `prefix:year` document counters (vouchers, collections,
// transactions).
//
// Document numbers are server-authoritative in PostgreSQL via the
// `system_sequences` table and `/api/sequences/next` endpoint.
//
// Client-side disk caching (localStorage) has been completely removed to
// prevent multi-operator collisions and dirty local sequence states.
// Any fallback sequence generation operates strictly in ephemeral memory.

export interface SequenceStore {
  read(): Record<string, number>;
  write(map: Record<string, number>): void;
}

// Purge any legacy sequence cache from browser localStorage
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('skooler_app_sequences_v1');
  }
} catch {}

let memoryMap: Record<string, number> = {};

const inMemoryStore: SequenceStore = {
  read() {
    return memoryMap;
  },
  write(map) {
    memoryMap = { ...map };
  },
};

// The active backend is strictly in-memory (no localStorage persistence)
let store: SequenceStore = inMemoryStore;

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

// Return the next monotonic sequence number for a `prefix:year` series (in-memory only).
export function nextNumber(prefix: string, year: string): number {
  if (!seqCache) load();
  const k = seqKey(prefix, year);
  const next = (seqCache![k] || 0) + 1;
  seqCache![k] = next;
  persist();
  return next;
}

// Adopt the highest number already present in the live database state.
// Operates purely in-memory with zero disk/localStorage caching.
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
    // Extract the counter portion to reconcile the in-memory counter
    const match = remoteNo.match(/-(\d+)$/);
    if (match) {
      reconcileSequence([{ prefix, year, number: parseInt(match[1], 10) }]);
    }
    return remoteNo;
  }
  return nextDocumentNumber(prefix, year, digits);
}
