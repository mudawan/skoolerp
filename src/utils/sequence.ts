export interface ParsedDocNumber {
  prefix: string;
  year: string;
  number: number;
}

/**
 * Accurately parses a document number like 'FE2026-000042', 'COL2026-000001', or 'TXN2026-000005'.
 * Strictly regex-tested to avoid off-by-one substring slicing bugs.
 */
export function parseDocumentNumber(docNo: string): ParsedDocNumber | null {
  if (!docNo || typeof docNo !== 'string') return null;
  const match = docNo.trim().match(/^([A-Za-z]+)(\d{4})-(\d+)$/);
  if (!match) return null;
  const num = parseInt(match[3], 10);
  if (isNaN(num)) return null;
  return {
    prefix: match[1].toUpperCase(),
    year: match[2],
    number: num,
  };
}

let sequenceMap: Record<string, number> = {};

function getSeqKey(institutionId: string, prefix: string, year: string): string {
  return `${institutionId || 'default'}:${prefix.toUpperCase()}:${year}`;
}

export function nextNumber(prefix: string, year: string, institutionId = 'default'): number {
  const k = getSeqKey(institutionId, prefix, year);
  const next = (sequenceMap[k] || 0) + 1;
  sequenceMap[k] = next;
  return next;
}

export function nextDocumentNumber(
  prefix: string,
  year: string,
  digits: number = 6,
  institutionId: string = 'default'
): string {
  const num = nextNumber(prefix, year, institutionId);
  return `${prefix.toUpperCase()}${year}-${String(num).padStart(digits, '0')}`;
}

export function allocateDocumentNumbers(
  prefix: string,
  year: string,
  count: number,
  digits: number = 6,
  institutionId: string = 'default'
): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(nextDocumentNumber(prefix, year, digits, institutionId));
  }
  return result;
}

export function reconcileSequence(
  entries: { prefix: string; year: string; number: number }[],
  institutionId: string = 'default'
): void {
  entries.forEach(({ prefix, year, number }) => {
    if (!prefix || !year || number <= 0) return;
    const k = getSeqKey(institutionId, prefix, year);
    if (number > (sequenceMap[k] || 0)) {
      sequenceMap[k] = number;
    }
  });
}

export function reconcileSequenceFromVouchers(vouchers: any[], institutionId = 'default'): void {
  if (!Array.isArray(vouchers)) return;
  const entries: { prefix: string; year: string; number: number }[] = [];
  vouchers.forEach((v) => {
    const parsed = parseDocumentNumber(v?.voucherNo);
    if (parsed) entries.push(parsed);
  });
  reconcileSequence(entries, institutionId);
}

export function reconcileSequenceFromCollections(collections: any[], institutionId = 'default'): void {
  if (!Array.isArray(collections)) return;
  const entries: { prefix: string; year: string; number: number }[] = [];
  collections.forEach((c) => {
    const parsed = parseDocumentNumber(c?.collectionNo);
    if (parsed) entries.push(parsed);
  });
  reconcileSequence(entries, institutionId);
}

export function reconcileSequenceFromTransactions(transactions: any[], institutionId = 'default'): void {
  if (!Array.isArray(transactions)) return;
  const entries: { prefix: string; year: string; number: number }[] = [];
  transactions.forEach((t) => {
    const parsed = parseDocumentNumber(t?.txnNo);
    if (parsed) entries.push(parsed);
  });
  reconcileSequence(entries, institutionId);
}
