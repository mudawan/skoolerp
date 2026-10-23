// The suggestion engine. Ranks students for one bank transaction. Advisory only: it never assigns.
//
// Signals, strongest first (matches the specification):
//   1. history   — fragments of earlier verified payments match this narration
//   2. amount    — the fee month's open voucher is close to the credited amount
//   3. open      — any open voucher in the fee month
//   4. elimination — students already assigned in this upload sink below the ones still waiting
//   5. search    — free-text student search (only when the operator types a query)

import type { Suggestion, VoucherHint } from '../../src/plugins/bank-statements/shared';
import { lookupTexts, scoreHistory, type FragmentMatchRow, type HistoryScore } from './fragments';

export interface Queryable {
  query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface CandidateSignals {
  history: HistoryScore | null;
  voucher: (VoucherHint & { netDue: number }) | null;
  assignedInUpload: boolean;
}

/** Pure scoring of one student for one transaction amount. */
export function scoreCandidate(amount: number, sig: CandidateSignals): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (sig.history && sig.history.score > 0) {
    score += 1000 * sig.history.score;
    reasons.push(...sig.history.reasons);
  }

  const v = sig.voucher;
  if (v && (v.status === 'Issued' || v.status === 'Partial') && v.outstanding > 0) {
    const d = Math.abs(v.outstanding - amount) / Math.max(v.outstanding, amount);
    if (d < 0.0005) {
      score += 300;
      reasons.push('Amount equals the outstanding balance');
    } else if (d <= 0.05) {
      score += 200;
      reasons.push('Amount is within 5% of the outstanding balance');
    } else if (d <= 0.25) {
      score += 100;
      reasons.push('Amount is close to the outstanding balance');
    } else {
      score += 50;
      reasons.push('Has an open voucher this month');
    }
  } else if (v && v.status === 'Paid') {
    score -= 30;
    reasons.push('Voucher for this month is already paid');
  }

  if (v && !v.payable) {
    score -= 100;
    if (v.blockedReason) reasons.push(v.blockedReason);
  }

  if (sig.assignedInUpload) {
    score = score * 0.25 - 50;
    reasons.push('Already assigned to another transaction in this upload');
  } else {
    score += 20;
  }
  return { score, reasons };
}

// ---------------------------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------------------------

export interface StudentLite {
  id: string;
  name: string;
  regNo: string;
  className: string | null;
  fatherName: string | null;
  status: string;
}

export interface SuggestionContext {
  feeMonth: string;
  /** studentId -> the voucher of the fee month (any non-reversed status). */
  vouchers: Map<string, VoucherHint & { netDue: number }>;
  /** studentId -> student row, filled lazily by loadStudents(). */
  students: Map<string, StudentLite>;
}

/** All non-reversed vouchers of the fee month, with whether each can actually take a payment. */
export async function loadMonthVouchers(db: Queryable, institutionId: string, feeMonth: string): Promise<SuggestionContext> {
  const res = await db.query(
    `SELECT v.id, v.voucher_no, v.student_id, v.month, v.status, v.net_due, v.amount_paid,
            EXISTS (SELECT 1 FROM vouchers t
                    WHERE t.institution_id = v.institution_id AND t.student_id = v.student_id
                      AND t.month > v.month AND t.status <> 'Reversed') AS has_later
     FROM vouchers v
     WHERE v.institution_id = $1 AND v.month = $2 AND v.status <> 'Reversed'`,
    [institutionId, feeMonth]
  );
  const vouchers = new Map<string, VoucherHint & { netDue: number }>();
  for (const r of res.rows) {
    const netDue = Number(r.net_due);
    const paid = Number(r.amount_paid);
    let blockedReason: string | null = null;
    if (r.status === 'Carried') blockedReason = `Voucher ${r.voucher_no} was carried forward — its balance is on a later voucher`;
    else if (r.has_later) blockedReason = `Voucher ${r.voucher_no} is not the student's latest voucher`;
    vouchers.set(r.student_id, {
      voucherId: r.id,
      voucherNo: r.voucher_no,
      month: r.month,
      status: r.status,
      outstanding: Math.max(0, netDue - paid),
      payable: blockedReason === null,
      blockedReason,
      netDue,
    });
  }
  return { feeMonth, vouchers, students: new Map() };
}

export async function loadStudents(db: Queryable, institutionId: string, ids: string[]): Promise<Map<string, StudentLite>> {
  const out = new Map<string, StudentLite>();
  if (ids.length === 0) return out;
  const res = await db.query(
    `SELECT s.id, s.name, s.reg_no, s.father_name, s.status, c.name AS class_name
     FROM students s LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.institution_id = $1 AND s.id = ANY($2)`,
    [institutionId, ids]
  );
  for (const r of res.rows) {
    out.set(r.id, {
      id: r.id,
      name: r.name,
      regNo: r.reg_no || '',
      className: r.class_name || null,
      fatherName: r.father_name || null,
      status: r.status,
    });
  }
  return out;
}

/** Looks the given texts up in the fragment store (exact, plus trigram-similar for words). */
export async function lookupFragments(db: Queryable, institutionId: string, texts: string[]): Promise<FragmentMatchRow[]> {
  const uniq = Array.from(new Set(texts.filter(Boolean)));
  if (uniq.length === 0) return [];
  const res = await db.query(
    `SELECT f.student_id, f.fragment, f.kind, f.hits, t.tok,
            CASE WHEN f.fragment = t.tok THEN 1.0 ELSE similarity(f.fragment, t.tok) END AS sim,
            (SELECT COUNT(DISTINCT x.student_id) FROM bank_statement_fragments x
              WHERE x.institution_id = f.institution_id AND x.fragment = f.fragment) AS students
     FROM unnest($2::text[]) AS t(tok)
     JOIN bank_statement_fragments f
       ON f.institution_id = $1
      AND (f.fragment = t.tok
           OR (f.kind = 'word' AND length(t.tok) >= 5 AND f.fragment % t.tok AND similarity(f.fragment, t.tok) >= 0.7))`,
    [institutionId, uniq]
  );
  return res.rows.map((r) => ({
    studentId: r.student_id,
    fragment: r.fragment,
    kind: r.kind,
    hits: Number(r.hits),
    token: r.tok,
    similarity: Number(r.sim),
    students: Number(r.students),
  }));
}

export interface TxForSuggestion {
  id: string;
  amount: number;
  description: string;
  reference: string | null;
}

/**
 * Ranks candidates for several transactions with ONE fragment lookup. `assignedElsewhere(txId)` returns the
 * students already assigned to OTHER transactions of the same upload (progressive elimination).
 */
export async function suggestForTransactions(
  db: Queryable,
  institutionId: string,
  ctx: SuggestionContext,
  txns: TxForSuggestion[],
  assignedElsewhere: (txId: string) => Set<string>,
  limit = 3
): Promise<Map<string, Suggestion[]>> {
  const fragsByTx = new Map<string, string[]>();
  const allTexts: string[] = [];
  for (const t of txns) {
    const texts = lookupTexts(t.description, t.reference || undefined).map((f) => f.text);
    fragsByTx.set(t.id, texts);
    allTexts.push(...texts);
  }
  const matches = await lookupFragments(db, institutionId, allTexts);
  const byToken = new Map<string, FragmentMatchRow[]>();
  for (const m of matches) {
    const a = byToken.get(m.token) || [];
    a.push(m);
    byToken.set(m.token, a);
  }

  const result = new Map<string, Suggestion[]>();
  const perTx: Array<{ t: TxForSuggestion; scored: Array<{ id: string; score: number; reasons: string[]; assigned: boolean }> }> = [];
  const needStudents = new Set<string>();

  for (const t of txns) {
    const rows = (fragsByTx.get(t.id) || []).flatMap((tok) => byToken.get(tok) || []);
    const history = scoreHistory(rows);
    const taken = assignedElsewhere(t.id);
    const candidates = new Set<string>([...history.keys(), ...ctx.vouchers.keys()]);
    const scored: Array<{ id: string; score: number; reasons: string[]; assigned: boolean }> = [];
    for (const id of candidates) {
      const voucher = ctx.vouchers.get(id) || null;
      // Without any signal for this transaction a student is not a suggestion.
      const h = history.get(id) || null;
      const open = voucher && (voucher.status === 'Issued' || voucher.status === 'Partial') && voucher.outstanding > 0;
      if (!h && !open) continue;
      const { score, reasons } = scoreCandidate(t.amount, { history: h, voucher, assignedInUpload: taken.has(id) });
      scored.push({ id, score, reasons, assigned: taken.has(id) });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);
    top.forEach((s) => needStudents.add(s.id));
    perTx.push({ t, scored: top });
  }

  const students = await loadStudents(db, institutionId, Array.from(needStudents));
  for (const { t, scored } of perTx) {
    const list: Suggestion[] = [];
    for (const s of scored) {
      const st = students.get(s.id);
      if (!st) continue;
      list.push(toSuggestion(st, s.score, s.reasons, ctx.vouchers.get(s.id) || null, s.assigned));
    }
    result.set(t.id, list);
  }
  return result;
}

export function toSuggestion(
  st: StudentLite,
  score: number,
  reasons: string[],
  voucher: (VoucherHint & { netDue: number }) | null,
  assignedInUpload: boolean
): Suggestion {
  const hint: VoucherHint | null = voucher
    ? {
        voucherId: voucher.voucherId,
        voucherNo: voucher.voucherNo,
        month: voucher.month,
        status: voucher.status,
        outstanding: voucher.outstanding,
        payable: voucher.payable,
        blockedReason: voucher.blockedReason,
      }
    : null;
  return {
    studentId: st.id,
    name: st.name,
    regNo: st.regNo,
    className: st.className,
    fatherName: st.fatherName,
    status: st.status,
    score: Math.round(score * 10) / 10,
    reasons,
    voucher: hint,
    assignedInUpload,
  };
}
