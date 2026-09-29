import { apiNextDocumentNumber } from '../services/apiSync';

// Monotonic, per `prefix:year` document counters (vouchers, collections, transactions).
//
// Sequence counters maintain a persistent high-water mark per tenant, prefix, and year.
// Allocation is strictly O(1): target = ++hwm.
// Historical vouchers are never scanned on allocation, ensuring constant-time performance
// across thousands of vouchers and multi-year operations.
//
// In accordance with accounting audit rules:
// Once a number is issued, deleting that voucher permanently retires that number.
// The sequence counter never rolls backwards or reuses deleted voucher numbers.

export interface ParsedDocumentNumber {
  prefix: string;
  year: string;
  number: number;
}

export interface SequenceStore {
  read(): Record<string, number>;
  write(map: Record<string, number>): void;
}

const STORAGE_PREFIX = 'skooler_app_sequence_hwm_v2';

function getStorageKey(tenantId: string, prefix: string, year: string): string {
  const cleanTenant = (tenantId || 'default').trim().toLowerCase();
  const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
  const cleanYear = (year || new Date().getFullYear().toString()).trim();
  return `${STORAGE_PREFIX}_${cleanTenant}_${cleanPrefix}_${cleanYear}`;
}

// In-memory cache for fast O(1) synchronous lookups
const memoryHwm: Record<string, number> = {};

function hwmKey(prefix: string, year: string, tenantId = 'default'): string {
  return `${(tenantId || 'default').trim().toLowerCase()}:${(prefix || 'FE').trim().toUpperCase()}:${(year || '').trim()}`;
}

export function getCurrentHighWaterMark(prefix: string, year: string, tenantId = 'default'): number {
  const k = hwmKey(prefix, year, tenantId);
  if (typeof memoryHwm[k] === 'number') {
    return memoryHwm[k];
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(getStorageKey(tenantId, prefix, year));
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 0) {
          memoryHwm[k] = val;
          return val;
        }
      }
    } catch {}
  }

  memoryHwm[k] = 0;
  return 0;
}

export function setHighWaterMark(prefix: string, year: string, value: number, tenantId = 'default'): void {
  if (value <= 0) return;
  const k = hwmKey(prefix, year, tenantId);
  const current = getCurrentHighWaterMark(prefix, year, tenantId);
  if (value > current) {
    memoryHwm[k] = value;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(getStorageKey(tenantId, prefix, year), String(value));
      } catch {}
    }
  }
}

/**
 * Parses any document number with strict regex:
 * e.g. "FE2026-000042" -> { prefix: 'FE', year: '2026', number: 42 }
 */
export function parseDocumentNumber(docNo?: string | null): ParsedDocumentNumber | null {
  if (!docNo || typeof docNo !== 'string') return null;
  const trimmed = docNo.trim();
  const match = trimmed.match(/^([A-Za-z]+)(\d{4})-(\d+)$/);
  if (!match) return null;
  const num = parseInt(match[3], 10);
  if (isNaN(num) || num <= 0) return null;
  return {
    prefix: match[1].toUpperCase(),
    year: match[2],
    number: num,
  };
}

/**
 * Strictly O(1) monotonic block allocation.
 * Reserves `count` numbers sequentially, advancing the persistent high-water mark.
 */
export function allocateNumberBlock(
  prefix: string,
  year: string,
  count: number,
  tenantId = 'default'
): number[] {
  if (count <= 0) return [];
  const cleanPrefix = prefix.trim().toUpperCase();
  const cleanYear = year.trim();
  const currentHwm = getCurrentHighWaterMark(cleanPrefix, cleanYear, tenantId);
  const start = currentHwm + 1;
  const end = currentHwm + count;
  setHighWaterMark(cleanPrefix, cleanYear, end, tenantId);

  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Strictly O(1) formatted document number block allocation.
 * e.g. allocateDocumentNumbers('FE', '2026', 3) -> ['FE2026-000001', 'FE2026-000002', 'FE2026-000003']
 */
export function allocateDocumentNumbers(
  prefix: string,
  year: string,
  count: number,
  digits = 6,
  tenantId = 'default'
): string[] {
  const numbers = allocateNumberBlock(prefix, year, count, tenantId);
  const cleanPrefix = prefix.trim().toUpperCase();
  const cleanYear = year.trim();
  return numbers.map((n) => `${cleanPrefix}${cleanYear}-${String(n).padStart(digits, '0')}`);
}

/**
 * Return the next monotonic sequence number for a `prefix:year` series (O(1)).
 */
export function nextNumber(prefix: string, year: string, tenantId = 'default'): number {
  return allocateNumberBlock(prefix, year, 1, tenantId)[0];
}

/**
 * Mint a fully formatted document number, e.g. `FE2026-000042` (O(1)).
 */
export function nextDocumentNumber(
  prefix: string,
  year: string,
  digits = 6,
  tenantId = 'default'
): string {
  return allocateDocumentNumbers(prefix, year, 1, digits, tenantId)[0];
}

/**
 * Reconcile sequence counters by adopting the highest observed numbers.
 * The high-water mark ONLY increases; it never rolls backwards upon deletions.
 */
export function reconcileSequence(
  entries: Array<{ prefix: string; year: string; number: number; tenantId?: string }>
): void {
  entries.forEach(({ prefix, year, number, tenantId }) => {
    if (number > 0) {
      setHighWaterMark(prefix, year, number, tenantId || 'default');
    }
  });
}

/**
 * Scans an array of vouchers once (e.g. upon server state hydration) and reconciles
 * the high-water marks for each prefix+year found.
 */
export function reconcileSequenceFromVouchers(
  vouchers: Array<{ voucherNo?: string }>,
  tenantId = 'default'
): void {
  if (!Array.isArray(vouchers) || vouchers.length === 0) return;
  const maxByPrefixYear: Record<string, { prefix: string; year: string; number: number }> = {};
  for (let i = 0; i < vouchers.length; i++) {
    const p = parseDocumentNumber(vouchers[i]?.voucherNo);
    if (p) {
      const k = `${p.prefix}:${p.year}`;
      if (!maxByPrefixYear[k] || p.number > maxByPrefixYear[k].number) {
        maxByPrefixYear[k] = p;
      }
    }
  }
  reconcileSequence(Object.values(maxByPrefixYear).map((e) => ({ ...e, tenantId })));
}

/**
 * Scans collections and transactions for sequence reconciliation.
 */
export function reconcileSequenceFromCollections(
  collections: Array<{ collectionNo?: string }>,
  tenantId = 'default'
): void {
  if (!Array.isArray(collections) || collections.length === 0) return;
  const maxByPrefixYear: Record<string, { prefix: string; year: string; number: number }> = {};
  for (let i = 0; i < collections.length; i++) {
    const p = parseDocumentNumber(collections[i]?.collectionNo);
    if (p) {
      const k = `${p.prefix}:${p.year}`;
      if (!maxByPrefixYear[k] || p.number > maxByPrefixYear[k].number) {
        maxByPrefixYear[k] = p;
      }
    }
  }
  reconcileSequence(Object.values(maxByPrefixYear).map((e) => ({ ...e, tenantId })));
}

export function reconcileSequenceFromTransactions(
  transactions: Array<{ txnNo?: string }>,
  tenantId = 'default'
): void {
  if (!Array.isArray(transactions) || transactions.length === 0) return;
  const maxByPrefixYear: Record<string, { prefix: string; year: string; number: number }> = {};
  for (let i = 0; i < transactions.length; i++) {
    const p = parseDocumentNumber(transactions[i]?.txnNo);
    if (p) {
      const k = `${p.prefix}:${p.year}`;
      if (!maxByPrefixYear[k] || p.number > maxByPrefixYear[k].number) {
        maxByPrefixYear[k] = p;
      }
    }
  }
  reconcileSequence(Object.values(maxByPrefixYear).map((e) => ({ ...e, tenantId })));
}

/**
 * Mint a guaranteed server-side atomic document number directly from PostgreSQL sequences
 */
export async function fetchAtomicServerDocumentNumber(
  prefix: string,
  year: string,
  digits = 6,
  tenantId = 'default'
): Promise<string> {
  const remoteNo = await apiNextDocumentNumber(prefix, year, digits);
  if (remoteNo) {
    const parsed = parseDocumentNumber(remoteNo);
    if (parsed) {
      setHighWaterMark(parsed.prefix, parsed.year, parsed.number, tenantId);
    }
    return remoteNo;
  }
  return nextDocumentNumber(prefix, year, digits, tenantId);
}
