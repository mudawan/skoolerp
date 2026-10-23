import crypto from 'crypto';
import type { ParsedTransaction } from './types';
import { toMinor } from './parse-utils';

/**
 * Description text reduced to uppercase letters and digits only. Dropping spaces and punctuation
 * makes the fingerprint survive a bank re-wrapping a long narration onto a different number of lines.
 */
export function fingerprintText(s: string | undefined | null): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface FingerprintedTransaction extends ParsedTransaction {
  fingerprint: string;
}

/**
 * Gives every transaction a stable fingerprint: a SHA-256 over the account, date, amount, narration,
 * reference and running balance. Two genuinely separate but otherwise identical credits on the same day
 * (same amount, same narration, no balance column) get an occurrence number so they stay distinct, and
 * the same two rows get the same numbers again when an overlapping statement is uploaded later.
 */
export function fingerprintAll(accountNumber: string | undefined, txns: ParsedTransaction[]): FingerprintedTransaction[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const base = [
      fingerprintText(accountNumber),
      t.date,
      String(toMinor(t.amount)),
      fingerprintText(t.description),
      fingerprintText(t.reference),
      t.balance === undefined ? '' : String(toMinor(t.balance)),
    ].join('|');
    const occurrence = (seen.get(base) || 0) + 1;
    seen.set(base, occurrence);
    const fingerprint = crypto.createHash('sha256').update(`${base}|${occurrence}`).digest('hex');
    return { ...t, fingerprint };
  });
}

export const hashBuffer = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');
