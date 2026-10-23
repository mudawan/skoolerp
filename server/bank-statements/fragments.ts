// Historical description fragments: the reusable, identifying parts of a verified bank narration
// (sender name parts, account/phone number pieces). They are only ever a suggestion aid.
// Replaceable on its own: nothing outside this file and suggest.ts knows how a fragment is built or matched.

import { normalizeText } from './parse-utils';

export type FragmentKind = 'word' | 'phrase' | 'number' | 'masked';

export interface Fragment {
  text: string;
  kind: FragmentKind;
}

// Words that appear on almost every bank narration and say nothing about who paid.
const STOP_WORDS = new Set(
  (
    'IBFT RAAST TRANSFER TRF TRANSFERRED FUND FUNDS FROM TO BY THE AND FOR FEE FEES SCHOOL PAYMENT PAID PAY DEPOSIT DEPOSITED ' +
    'CASH CHEQUE CHQ CHEQ ONLINE MOBILE BANKING APP BRANCH CREDIT DEBIT ACCOUNT ACCT ACC NO NUMBER REF REFERENCE TXN ' +
    'TRANSACTION INWARD OUTWARD CLEARING CLG LOCAL INTERNET ADV ADVICE INSTANT MBL IB ATM POS BILL CHARGES CHARGE ' +
    'MONTH MONTHLY TUITION STUDENT CHILD ADMISSION VOUCHER CHALLAN INTO WITH VIA THRU THROUGH OF IN ON AT MR MRS MS ' +
    'JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC JANUARY FEBRUARY MARCH APRIL JUNE JULY AUGUST SEPTEMBER ' +
    'OCTOBER NOVEMBER DECEMBER MON TUE WED THU FRI SAT SUN PKR RS RUPEES USD TIME DATE ID TID STAN RRN UTR 1LINK ' +
    'COLLECTION COLLECTIONS RECEIVED RECEIPT SENDER BENEFICIARY BENE ORIGINATOR REMITTER REMITTANCE'
  ).split(/\s+/)
);

const MAX_FRAGMENT_LEN = 60;
const MAX_PHRASES = 6;
const MAX_WORDS = 24;
const MAX_NUMBERS = 8;

const isDateLikeNumber = (d: string): boolean =>
  /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{0,6})$/.test(d) || /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(d);

/**
 * Pulls the identifying pieces out of one narration. `reference` (the bank's own transaction id) is excluded:
 * it is unique to a single transaction and could never match again.
 */
export function extractFragments(description: string, reference?: string): Fragment[] {
  const out: Fragment[] = [];
  const seen = new Set<string>();
  const add = (text: string, kind: FragmentKind) => {
    const t = text.trim().slice(0, MAX_FRAGMENT_LEN);
    if (!t || seen.has(`${kind}:${t}`)) return;
    seen.add(`${kind}:${t}`);
    out.push({ text: t, kind });
  };

  const refTokens = new Set(normalizeText(reference || '').split(' ').filter(Boolean));
  const raw = (description || '').toUpperCase();

  // Masked account / phone numbers: "0300XXXX4567", "****4567", "03XX XXX 4567".
  // Tail digits after the mask are the most telling; digits before the mask (a phone prefix) are weaker but kept.
  for (const re of [/[X*]{2,}[\s-]?(\d{3,6})\b/g, /\b(\d{3,6})[\s-]?[X*]{2,}/g]) {
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(raw))) add(mm[1], 'masked');
  }

  const tokens = normalizeText(raw).split(' ').filter(Boolean);
  const alphaRuns: string[][] = [[]];
  let words = 0;
  let numbers = 0;

  for (const tok of tokens) {
    if (refTokens.has(tok)) {
      alphaRuns.push([]);
      continue;
    }
    if (/^\d+$/.test(tok)) {
      alphaRuns.push([]);
      if (tok.length >= 6 && tok.length <= 24 && !isDateLikeNumber(tok) && numbers < MAX_NUMBERS) {
        add(tok, 'number');
        numbers++;
      }
      continue;
    }
    if (/\d/.test(tok)) {
      // Mixed letters+digits: keep only IBAN-like ids; drop bank txn codes (FT26244X).
      alphaRuns.push([]);
      if (/^[A-Z]{2}\d{2}[A-Z0-9]{8,}$/.test(tok) && numbers < MAX_NUMBERS) {
        add(tok, 'number');
        numbers++;
      }
      continue;
    }
    if (tok.length < 3 || STOP_WORDS.has(tok)) {
      alphaRuns.push([]);
      continue;
    }
    alphaRuns[alphaRuns.length - 1].push(tok);
    if (words < MAX_WORDS) {
      add(tok, 'word');
      words++;
    }
  }

  let phrases = 0;
  for (const run of alphaRuns) {
    for (let i = 0; i + 1 < run.length && phrases < MAX_PHRASES; i++) {
      add(`${run[i]} ${run[i + 1]}`, 'phrase');
      phrases++;
    }
  }
  return out;
}

/** The texts to look up in the fragment store for a narration (same extraction as when storing). */
export const lookupTexts = (description: string, reference?: string): Fragment[] => extractFragments(description, reference);

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

/** One row returned by the fragment-store lookup. */
export interface FragmentMatchRow {
  studentId: string;
  fragment: string;
  kind: FragmentKind;
  hits: number;
  /** The looked-up text that matched this stored fragment. */
  token: string;
  /** 1 for an exact match, otherwise the trigram similarity (>= 0.7). */
  similarity: number;
  /** How many different students have this fragment on file. */
  students: number;
}

const KIND_WEIGHT: Record<FragmentKind, number> = { phrase: 3, number: 3, word: 1.5, masked: 1 };

export interface HistoryScore {
  /** 0..1 (capped). */
  score: number;
  reasons: string[];
}

/**
 * Combines the matches of ONE transaction into a score per student. A fragment shared by many students
 * (a common surname) counts for little; one only this student has used counts for a lot; fragments seen
 * on repeated payments count a little more. Matching is advisory: nothing here ever assigns anyone.
 */
export function scoreHistory(rows: FragmentMatchRow[]): Map<string, HistoryScore> {
  const perStudent = new Map<string, { sum: number; best: Array<{ w: number; reason: string }> }>();
  for (const r of rows) {
    const rarity = 1 / Math.sqrt(Math.max(1, r.students));
    const repeat = 1 + 0.3 * Math.log(Math.max(1, r.hits));
    const w = KIND_WEIGHT[r.kind] * r.similarity * rarity * repeat;
    const label =
      r.kind === 'masked'
        ? `Account/phone ending ${r.fragment} seen before`
        : r.similarity < 1
        ? `"${r.token}" resembles "${r.fragment}" from earlier payments`
        : r.kind === 'number'
        ? `Account/phone ${r.fragment} seen before`
        : `"${r.fragment}" seen on earlier payments`;
    const cur = perStudent.get(r.studentId) || { sum: 0, best: [] };
    cur.sum += w;
    cur.best.push({ w, reason: label });
    perStudent.set(r.studentId, cur);
  }
  const out = new Map<string, HistoryScore>();
  for (const [id, v] of perStudent) {
    v.best.sort((a, b) => b.w - a.w);
    out.set(id, { score: Math.min(1, v.sum / 4), reasons: v.best.slice(0, 2).map((b) => b.reason) });
  }
  return out;
}
