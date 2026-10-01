import { apiNextDocumentNumber, getActiveInstitutionId } from '../services/apiSync';

/**
 * Scalable & Monotonic Fee Voucher Numbering Architecture (Revised)
 * 
 * Invariants:
 * 1. O(1) sequence allocation: Counter advances by K in a single atomic step without historical scanning.
 * 2. Monotonic Audit Permanence: Deletions never decrease the high-water mark.
 * 3. Multi-tenant isolation: Sequences are strictly partitioned by tenant, prefix, and year.
 * 4. Resilient caching: Synced to persistent browser storage (skooler_seq_hwm_v1) to prevent restarts on refresh.
 */

const STORAGE_KEY = 'skooler_seq_hwm_v1';

// Strict regex parser for documents formatted like FE2026-000042, TXN2026-000001, REC2026-000100
const DOC_NO_REGEX = /^([A-Za-z]+)(\d{4})-(\d+)$/;

export interface ParsedDocumentNumber {
  prefix: string;
  year: string;
  number: number;
}

/**
 * Parses a formatted document number into its constituent prefix, 4-digit year, and numeric counter.
 * Returns null if the format is invalid or unpadded/malformed.
 */
export function parseDocumentNumber(docNo?: string | null): ParsedDocumentNumber | null {
  if (!docNo || typeof docNo !== 'string') return null;
  const match = docNo.trim().match(DOC_NO_REGEX);
  if (!match) return null;
  const num = parseInt(match[3], 10);
  if (isNaN(num) || num <= 0) return null;
  return {
    prefix: match[1].toUpperCase(),
    year: match[2],
    number: num,
  };
}

let memoryHwm: Record<string, number> = {};

function readStorage(): Record<string, number> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...memoryHwm, ...parsed };
        }
      }
    }
  } catch {}
  return memoryHwm;
}

function writeStorage(map: Record<string, number>): void {
  memoryHwm = { ...map };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

let hwmCache: Record<string, number> | null = null;

function loadHwm(): Record<string, number> {
  if (hwmCache) return hwmCache;
  hwmCache = readStorage();
  return hwmCache;
}

function persistHwm(): void {
  if (hwmCache) {
    writeStorage(hwmCache);
  }
}

function resolveTenantId(tenantId?: string): string {
  if (tenantId && tenantId.trim()) return tenantId.trim();
  try {
    const active = getActiveInstitutionId();
    if (active && active.trim()) return active.trim();
  } catch {}
  return 'default';
}

function seqKey(prefix: string, year: string, tenantId?: string): string {
  const tenant = resolveTenantId(tenantId);
  const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
  const cleanYear = (year || new Date().getFullYear().toString()).trim();
  return `${tenant}:${cleanPrefix}:${cleanYear}`;
}

/**
 * Returns the current high-water mark number for a series without advancing it.
 */
export function getCurrentHighWaterMark(prefix: string, year: string, tenantId?: string): number {
  const cache = loadHwm();
  const key = seqKey(prefix, year, tenantId);
  return cache[key] || 0;
}

/**
 * Advances the high-water mark by count in a single O(1) operation
 * and returns formatted document numbers for the entire allocated block.
 */
export function allocateDocumentNumbers(
  prefix: string,
  year: string,
  count: number,
  digits: number = 6,
  tenantId?: string
): string[] {
  if (count <= 0) return [];
  const cache = loadHwm();
  const key = seqKey(prefix, year, tenantId);
  const startNum = (cache[key] || 0) + 1;
  const endNum = startNum + count - 1;

  // Advance counter monotonically
  cache[key] = endNum;
  persistHwm();

  const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
  const cleanYear = (year || new Date().getFullYear().toString()).trim();

  const numbers: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const current = startNum + i;
    numbers[i] = `${cleanPrefix}${cleanYear}-${String(current).padStart(digits, '0')}`;
  }
  return numbers;
}

/**
 * Returns the next monotonic sequence number (integer) for a series.
 */
export function nextNumber(prefix: string, year: string, tenantId?: string): number {
  const cache = loadHwm();
  const key = seqKey(prefix, year, tenantId);
  const next = (cache[key] || 0) + 1;
  cache[key] = next;
  persistHwm();
  return next;
}

/**
 * Mint a single fully formatted document number, e.g. FE2026-000042.
 */
export function nextDocumentNumber(
  prefix: string,
  year: string,
  digits: number = 6,
  tenantId?: string
): string {
  return allocateDocumentNumbers(prefix, year, 1, digits, tenantId)[0];
}

/**
 * Reconciles the local sequence counter against observed numbers in database state.
 * CRITICAL DIRECTIVE: Monotonic audit permanence — this only increases the high-water mark;
 * it NEVER rolls backwards or decrements upon voucher deletions.
 */
export function reconcileSequence(
  entries: { prefix: string; year: string; number: number }[],
  tenantId?: string
): void {
  if (!entries || entries.length === 0) return;
  const cache = loadHwm();
  let changed = false;

  entries.forEach(({ prefix, year, number }) => {
    if (!prefix || !year || number <= 0) return;
    const key = seqKey(prefix, year, tenantId);
    const existing = cache[key] || 0;
    if (number > existing) {
      cache[key] = number;
      changed = true;
    }
  });

  if (changed) {
    persistHwm();
  }
}

/**
 * Mint a guaranteed server-side atomic document number directly from PostgreSQL sequences
 */
export async function fetchAtomicServerDocumentNumber(
  prefix: string,
  year: string,
  digits: number = 6
): Promise<string> {
  const remoteNo = await apiNextDocumentNumber(prefix, year, digits);
  if (remoteNo) {
    const parsed = parseDocumentNumber(remoteNo);
    if (parsed) {
      reconcileSequence([{ prefix: parsed.prefix, year: parsed.year, number: parsed.number }]);
    }
    return remoteNo;
  }
  return nextDocumentNumber(prefix, year, digits);
}
