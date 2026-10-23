// Database-facing logic of the Bank Statement Collections Loader.
//
// Everything here is institution-scoped (every query filters on institution_id) and takes its
// database access and the fee-engine entry point as injected dependencies, so it is tested against a
// real Postgres without starting the web server.

import crypto from 'crypto';
import type {
  ApplyPreview,
  ApplyPreviewRow,
  ApplyResult,
  PaymentModeChoice,
  StatementTxRow,
  StatementTxStatus,
  StatementUploadSummary,
  Suggestion,
} from '../../src/plugins/bank-statements/shared';
import { FEE_MONTH_RE } from '../../src/plugins/bank-statements/shared';
import { AdapterError, type ParsedStatement, type StatementInput } from './types';
import { selectAdapter } from './adapters/registry';
import { fingerprintAll, hashBuffer } from './fingerprint';
import { extractFragments, lookupTexts, scoreHistory } from './fragments';
import {
  loadMonthVouchers,
  loadStudents,
  lookupFragments,
  scoreCandidate,
  suggestForTransactions,
  toSuggestion,
  type Queryable,
} from './suggest';

export class HttpError extends Error {
  constructor(public httpStatus: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface Actor {
  id: string;
  name: string;
  username?: string;
}

/** What apply needs from the existing fee engine (see server/collections-core.ts). */
export interface ReceivePaymentsFn {
  (
    institutionId: string,
    input: {
      payments: Array<{
        id: string;
        voucherId: string;
        amount: number;
        paymentMode: string;
        referenceNo?: string;
        notes?: string;
        date: string;
      }>;
      date: string;
      collectionNotes: string;
      isBulkImport: boolean;
    },
    hooks: {
      afterWrites: (
        client: Queryable,
        result: { collection: { id: string; collectionNo: string; totalAmount: number }; transactions: Array<{ id: string; voucherId: string; studentId: string }> }
      ) => Promise<void>;
    }
  ): Promise<{ collection: { id: string; collectionNo: string; totalAmount: number }; transactions: any[]; updatedVouchers: any[] }>;
}

export interface ServiceDeps {
  pool: Queryable;
  withTx: <T>(fn: (client: Queryable) => Promise<T>) => Promise<T>;
  /** Matches students for the search box; returns ids best-first. */
  searchStudentIds: (institutionId: string, q: string, limit: number) => Promise<string[]>;
  receivePayments?: ReceivePaymentsFn;
  /** Writes an entry to the app's main audit trail inside the caller's transaction. */
  auditInTx?: (client: Queryable, entry: Record<string, any>) => Promise<void>;
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const rid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

// ---------------------------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------------------------

const toIso = (v: any): string | null => (v ? new Date(v).toISOString() : null);
const num = (v: any): number => Number(v ?? 0);

function mapUpload(r: any): StatementUploadSummary {
  return {
    id: r.id,
    feeMonth: r.fee_month,
    filename: r.filename,
    adapterId: r.adapter_id,
    adapterVersion: r.adapter_version,
    bankName: r.bank_name,
    accountNumber: r.account_number,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    parseStatus: r.parse_status,
    parseError: r.parse_error,
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    exactDuplicateOf: r.exact_duplicate_of,
    totalCredits: r.total_credits,
    newCount: r.new_count,
    duplicateCount: r.duplicate_count,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    uploadedAt: toIso(r.uploaded_at) as string,
    counts: {
      pending: Number(r.c_pending || 0),
      assigned: Number(r.c_assigned || 0),
      applied: Number(r.c_applied || 0),
      ignored: Number(r.c_ignored || 0),
    },
    amounts: {
      pending: num(r.a_pending),
      assigned: num(r.a_assigned),
      applied: num(r.a_applied),
      ignored: num(r.a_ignored),
    },
  };
}

function mapTx(r: any): StatementTxRow {
  return {
    id: r.id,
    uploadId: r.upload_id,
    rowIndex: r.row_index,
    date: r.txn_date,
    amount: num(r.amount),
    description: r.description,
    reference: r.reference,
    balance: r.balance === null ? null : num(r.balance),
    status: r.status,
    studentId: r.student_id,
    studentName: r.s_name || null,
    studentRegNo: r.s_reg_no || null,
    studentClass: r.class_name || null,
    studentStatus: r.s_status || null,
    ignoreReason: r.ignore_reason,
    assignedByName: r.assigned_by_name,
    assignedAt: toIso(r.assigned_at),
    appliedByName: r.applied_by_name,
    appliedAt: toIso(r.applied_at),
    collectionId: r.collection_id,
    collectionNo: r.collection_no || null,
    collectionMissing: !!r.collection_missing,
  };
}

const UPLOAD_SELECT = `
  SELECT u.*,
    COALESCE(c.c_pending,0) AS c_pending, COALESCE(c.c_assigned,0) AS c_assigned,
    COALESCE(c.c_applied,0) AS c_applied, COALESCE(c.c_ignored,0) AS c_ignored,
    COALESCE(c.a_pending,0) AS a_pending, COALESCE(c.a_assigned,0) AS a_assigned,
    COALESCE(c.a_applied,0) AS a_applied, COALESCE(c.a_ignored,0) AS a_ignored
  FROM bank_statement_uploads u
  LEFT JOIN (
    SELECT upload_id,
      COUNT(*) FILTER (WHERE status='pending') AS c_pending,
      COUNT(*) FILTER (WHERE status='assigned') AS c_assigned,
      COUNT(*) FILTER (WHERE status='applied') AS c_applied,
      COUNT(*) FILTER (WHERE status='ignored') AS c_ignored,
      SUM(amount) FILTER (WHERE status='pending') AS a_pending,
      SUM(amount) FILTER (WHERE status='assigned') AS a_assigned,
      SUM(amount) FILTER (WHERE status='applied') AS a_applied,
      SUM(amount) FILTER (WHERE status='ignored') AS a_ignored
    FROM bank_statement_transactions WHERE institution_id = $1 GROUP BY upload_id
  ) c ON c.upload_id = u.id
  WHERE u.institution_id = $1`;

const TX_SELECT = `
  SELECT t.*, s.name AS s_name, s.reg_no AS s_reg_no, s.status AS s_status, cl.name AS class_name,
         col.collection_no AS collection_no,
         (t.status = 'applied' AND col.id IS NULL) AS collection_missing
  FROM bank_statement_transactions t
  LEFT JOIN students s ON s.id = t.student_id AND s.institution_id = t.institution_id
  LEFT JOIN classes cl ON cl.id = s.class_id AND cl.institution_id = t.institution_id
  LEFT JOIN collections col ON col.id = t.collection_id AND col.institution_id = t.institution_id`;

async function event(
  db: Queryable,
  institutionId: string,
  actor: Actor,
  e: { uploadId?: string | null; txnId?: string | null; action: string; from?: string | null; to?: string | null; detail?: object }
) {
  await db.query(
    `INSERT INTO bank_statement_events (institution_id, upload_id, txn_id, action, from_student_id, to_student_id, user_id, user_name, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [institutionId, e.uploadId ?? null, e.txnId ?? null, e.action, e.from ?? null, e.to ?? null, actor.id, actor.name, JSON.stringify(e.detail ?? {})]
  );
}

// ---------------------------------------------------------------------------------------------
// Upload & staging
// ---------------------------------------------------------------------------------------------

export interface UploadInput {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  feeMonth: string;
  adapterId?: string;
}

export async function isMonthLocked(db: Queryable, institutionId: string, month: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM locked_months WHERE institution_id = $1 AND month = $2`, [institutionId, month]);
  return r.rows.length > 0;
}

export async function createUpload(
  deps: ServiceDeps,
  institutionId: string,
  actor: Actor,
  input: UploadInput
): Promise<StatementUploadSummary> {
  if (!FEE_MONTH_RE.test(input.feeMonth || '')) throw new HttpError(400, 'Choose the fee month (YYYY-MM) this statement belongs to.');
  if (!input.buffer || input.buffer.length === 0) throw new HttpError(400, 'The uploaded file is empty.');
  if (input.buffer.length > MAX_FILE_BYTES) throw new HttpError(413, `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const filename = (input.filename || 'statement').replace(/[\\/\r\n]+/g, '_').slice(0, 255);
  if (await isMonthLocked(deps.pool, institutionId, input.feeMonth)) {
    throw new HttpError(423, `Fee books for ${input.feeMonth} are locked. An Admin must unlock the month before a statement can be loaded into it.`);
  }

  const fileHash = hashBuffer(input.buffer);
  const stmtInput: StatementInput = { filename, mimeType: input.mimeType, buffer: input.buffer };

  // Parse OUTSIDE any database transaction: it can be slow and touches nothing in the database.
  let parsed: ParsedStatement | null = null;
  let adapterId: string | null = null;
  let adapterVersion: string | null = null;
  let parseError: string | null = null;
  try {
    const adapter = await selectAdapter(stmtInput, input.adapterId);
    adapterId = adapter.id;
    adapterVersion = adapter.version;
    parsed = await adapter.parse(stmtInput, { feeMonth: input.feeMonth });
  } catch (err: any) {
    if (err instanceof AdapterError) parseError = err.message;
    else {
      console.error('[BankStatements] Unexpected parse failure:', err);
      parseError = `The file could not be read (${err?.message || 'unexpected error'}).`;
    }
  }

  return deps.withTx(async (db) => {
    const fileId = rid('bsf');
    await db.query(
      `INSERT INTO bank_statement_files (id, institution_id, file_hash, filename, mime_type, size_bytes, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (institution_id, file_hash) DO NOTHING`,
      [fileId, institutionId, fileHash, filename, input.mimeType || null, input.buffer.length, input.buffer]
    );
    const fileRow = await db.query(`SELECT id FROM bank_statement_files WHERE institution_id = $1 AND file_hash = $2`, [institutionId, fileHash]);
    const storedFileId = fileRow.rows[0].id as string;

    const prior = await db.query(
      `SELECT id FROM bank_statement_uploads WHERE institution_id = $1 AND file_hash = $2 AND parse_status = 'parsed' ORDER BY uploaded_at ASC LIMIT 1`,
      [institutionId, fileHash]
    );
    const exactDuplicateOf = prior.rows[0]?.id ?? null;

    const uploadId = rid('bsu');
    const warnings = parsed ? [...parsed.warnings] : [];
    if (parsed && parsed.transactions.length === 0) warnings.push('No credit transactions were found in this statement.');
    if (exactDuplicateOf) warnings.push('This exact file was uploaded before; it can add no new transactions.');

    await db.query(
      `INSERT INTO bank_statement_uploads
        (id, institution_id, fee_month, filename, file_hash, file_id, adapter_id, adapter_version, bank_name, account_number,
         period_from, period_to, parse_status, parse_error, warnings, exact_duplicate_of, uploaded_by, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        uploadId, institutionId, input.feeMonth, filename, fileHash, storedFileId, adapterId, adapterVersion,
        parsed?.bankName ?? null, parsed?.accountNumber ?? null, parsed?.periodFrom ?? null, parsed?.periodTo ?? null,
        parsed ? 'parsed' : 'failed', parseError, JSON.stringify(warnings), exactDuplicateOf, actor.id, actor.name,
      ]
    );

    let newCount = 0;
    let duplicateCount = 0;
    if (parsed && parsed.transactions.length > 0) {
      const fps = fingerprintAll(parsed.accountNumber, parsed.transactions);
      const inserted = new Set<string>();
      for (let i = 0; i < fps.length; i += 200) {
        const chunk = fps.slice(i, i + 200);
        const params: any[] = [];
        const values = chunk.map((t, k) => {
          const o = k * 11;
          params.push(rid('bst'), institutionId, uploadId, t.rowIndex, t.fingerprint, t.date, t.amount, t.description, t.reference ?? null, t.balance ?? null, JSON.stringify(t.raw));
          return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11}::jsonb,'pending')`;
        });
        const res = await db.query(
          `INSERT INTO bank_statement_transactions
             (id, institution_id, upload_id, row_index, fingerprint, txn_date, amount, description, reference, balance, raw, status)
           VALUES ${values.join(',')}
           ON CONFLICT (institution_id, fingerprint) WHERE status <> 'duplicate' DO NOTHING
           RETURNING fingerprint`,
          params
        );
        for (const r of res.rows) inserted.add(r.fingerprint.trim());
      }
      newCount = inserted.size;
      const dupes = fps.filter((t) => !inserted.has(t.fingerprint));
      duplicateCount = dupes.length;
      if (dupes.length > 0) {
        const known = await db.query(
          `SELECT id, fingerprint FROM bank_statement_transactions WHERE institution_id = $1 AND fingerprint = ANY($2) AND status <> 'duplicate'`,
          [institutionId, dupes.map((d) => d.fingerprint)]
        );
        const originalOf = new Map<string, string>(known.rows.map((r: any) => [r.fingerprint.trim(), r.id]));
        for (const t of dupes) {
          await db.query(
            `INSERT INTO bank_statement_transactions
               (id, institution_id, upload_id, row_index, fingerprint, txn_date, amount, description, reference, balance, raw, status, duplicate_of)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'duplicate',$12)`,
            [rid('bst'), institutionId, uploadId, t.rowIndex, t.fingerprint, t.date, t.amount, t.description, t.reference ?? null, t.balance ?? null, JSON.stringify(t.raw), originalOf.get(t.fingerprint) ?? null]
          );
        }
      }
    }
    await db.query(`UPDATE bank_statement_uploads SET total_credits = $1, new_count = $2, duplicate_count = $3 WHERE id = $4`, [
      parsed ? parsed.transactions.length : 0, newCount, duplicateCount, uploadId,
    ]);
    await event(db, institutionId, actor, {
      uploadId, action: parsed ? 'upload' : 'upload_failed',
      detail: { filename, feeMonth: input.feeMonth, adapterId, total: parsed?.transactions.length ?? 0, newCount, duplicateCount, error: parseError },
    });
    const out = await db.query(`${UPLOAD_SELECT} AND u.id = $2`, [institutionId, uploadId]);
    return mapUpload(out.rows[0]);
  });
}

export async function listUploads(db: Queryable, institutionId: string, limit = 100): Promise<StatementUploadSummary[]> {
  const r = await db.query(`${UPLOAD_SELECT} ORDER BY u.uploaded_at DESC LIMIT $2`, [institutionId, limit]);
  return r.rows.map(mapUpload);
}

export async function getUpload(db: Queryable, institutionId: string, uploadId: string): Promise<StatementUploadSummary> {
  const r = await db.query(`${UPLOAD_SELECT} AND u.id = $2`, [institutionId, uploadId]);
  if (r.rows.length === 0) throw new HttpError(404, 'Statement upload not found.');
  return mapUpload(r.rows[0]);
}

export async function getUploadFile(db: Queryable, institutionId: string, uploadId: string) {
  const r = await db.query(
    `SELECT f.filename, f.mime_type, f.content FROM bank_statement_uploads u
     JOIN bank_statement_files f ON f.id = u.file_id WHERE u.institution_id = $1 AND u.id = $2`,
    [institutionId, uploadId]
  );
  if (r.rows.length === 0) throw new HttpError(404, 'Statement file not found.');
  return { filename: r.rows[0].filename as string, mimeType: (r.rows[0].mime_type as string) || 'application/octet-stream', content: r.rows[0].content as Buffer };
}

export type TxFilter = 'open' | 'all' | StatementTxStatus;

export async function listTransactions(
  db: Queryable,
  institutionId: string,
  uploadId: string,
  opts: { status?: TxFilter; q?: string } = {}
): Promise<StatementTxRow[]> {
  await getUpload(db, institutionId, uploadId);
  const status = opts.status || 'open';
  const statuses = status === 'open' ? ['pending', 'assigned'] : status === 'all' ? ['pending', 'assigned', 'applied', 'ignored'] : [status];
  const params: any[] = [institutionId, uploadId, statuses];
  let where = `t.institution_id = $1 AND t.upload_id = $2 AND t.status = ANY($3)`;
  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    where += ` AND (t.description ILIKE $4 OR t.reference ILIKE $4 OR s.name ILIKE $4 OR s.reg_no ILIKE $4)`;
  }
  const r = await db.query(`${TX_SELECT} WHERE ${where} ORDER BY t.txn_date, t.row_index`, params);
  return r.rows.map(mapTx);
}

// ---------------------------------------------------------------------------------------------
// Status transitions (pending <-> assigned, ignored, and re-opening a reversed application)
// ---------------------------------------------------------------------------------------------

async function lockTx(db: Queryable, institutionId: string, txId: string) {
  const r = await db.query(`SELECT * FROM bank_statement_transactions WHERE id = $1 AND institution_id = $2 FOR UPDATE`, [txId, institutionId]);
  if (r.rows.length === 0) throw new HttpError(404, 'Bank transaction not found.');
  return r.rows[0];
}

async function readTx(db: Queryable, institutionId: string, txId: string): Promise<StatementTxRow> {
  const r = await db.query(`${TX_SELECT} WHERE t.id = $1 AND t.institution_id = $2`, [txId, institutionId]);
  return mapTx(r.rows[0]);
}

const EDITABLE = new Set(['pending', 'assigned']);

export async function assignStudent(deps: ServiceDeps, institutionId: string, actor: Actor, txId: string, studentId: string): Promise<StatementTxRow> {
  return deps.withTx(async (db) => {
    const t = await lockTx(db, institutionId, txId);
    if (!EDITABLE.has(t.status)) throw new HttpError(409, `This transaction is already ${t.status} and can no longer be reassigned.`);
    const s = await db.query(`SELECT id FROM students WHERE id = $1 AND institution_id = $2`, [studentId, institutionId]);
    if (s.rows.length === 0) throw new HttpError(404, 'That student does not exist.');
    await db.query(
      `UPDATE bank_statement_transactions SET status='assigned', student_id=$1, assigned_by=$2, assigned_by_name=$3, assigned_at=NOW()
       WHERE id=$4 AND institution_id=$5`,
      [studentId, actor.id, actor.name, txId, institutionId]
    );
    await event(db, institutionId, actor, { uploadId: t.upload_id, txnId: txId, action: 'assign', from: t.student_id, to: studentId });
    return readTx(db, institutionId, txId);
  });
}

export async function unassignStudent(deps: ServiceDeps, institutionId: string, actor: Actor, txId: string): Promise<StatementTxRow> {
  return deps.withTx(async (db) => {
    const t = await lockTx(db, institutionId, txId);
    if (t.status !== 'assigned') {
      if (t.status === 'pending') return readTx(db, institutionId, txId);
      throw new HttpError(409, `This transaction is already ${t.status}.`);
    }
    await db.query(
      `UPDATE bank_statement_transactions SET status='pending', student_id=NULL, assigned_by=NULL, assigned_by_name=NULL, assigned_at=NULL
       WHERE id=$1 AND institution_id=$2`,
      [txId, institutionId]
    );
    await event(db, institutionId, actor, { uploadId: t.upload_id, txnId: txId, action: 'unassign', from: t.student_id });
    return readTx(db, institutionId, txId);
  });
}

export async function ignoreTransaction(deps: ServiceDeps, institutionId: string, actor: Actor, txId: string, reason?: string): Promise<StatementTxRow> {
  return deps.withTx(async (db) => {
    const t = await lockTx(db, institutionId, txId);
    if (!EDITABLE.has(t.status)) throw new HttpError(409, `This transaction is already ${t.status}.`);
    await db.query(
      `UPDATE bank_statement_transactions
       SET status='ignored', student_id=NULL, assigned_by=NULL, assigned_by_name=NULL, assigned_at=NULL,
           ignore_reason=$1, ignored_by=$2, ignored_at=NOW()
       WHERE id=$3 AND institution_id=$4`,
      [(reason || '').trim().slice(0, 500) || null, actor.id, txId, institutionId]
    );
    await event(db, institutionId, actor, { uploadId: t.upload_id, txnId: txId, action: 'ignore', from: t.student_id, detail: { reason: reason || null } });
    return readTx(db, institutionId, txId);
  });
}

export async function unignoreTransaction(deps: ServiceDeps, institutionId: string, actor: Actor, txId: string): Promise<StatementTxRow> {
  return deps.withTx(async (db) => {
    const t = await lockTx(db, institutionId, txId);
    if (t.status !== 'ignored') throw new HttpError(409, 'Only an ignored transaction can be restored.');
    await db.query(
      `UPDATE bank_statement_transactions SET status='pending', ignore_reason=NULL, ignored_by=NULL, ignored_at=NULL WHERE id=$1 AND institution_id=$2`,
      [txId, institutionId]
    );
    await event(db, institutionId, actor, { uploadId: t.upload_id, txnId: txId, action: 'unignore' });
    return readTx(db, institutionId, txId);
  });
}

/**
 * An applied transaction whose collection has since been reversed/deleted in Collections is put back to
 * "assigned" (same student) so it can be applied again. A still-valid application can never be reopened.
 */
export async function reopenTransaction(deps: ServiceDeps, institutionId: string, actor: Actor, txId: string): Promise<StatementTxRow> {
  return deps.withTx(async (db) => {
    const t = await lockTx(db, institutionId, txId);
    if (t.status !== 'applied') throw new HttpError(409, 'Only an applied transaction can be reopened.');
    const col = await db.query(`SELECT 1 FROM collections WHERE id = $1 AND institution_id = $2`, [t.collection_id, institutionId]);
    if (col.rows.length > 0) {
      throw new HttpError(409, 'Its collection still exists. Reverse the collection in Collections first, then reopen it here.');
    }
    await db.query(
      `UPDATE bank_statement_transactions
       SET status='assigned', collection_id=NULL, payment_txn_id=NULL, voucher_id=NULL, applied_by=NULL, applied_by_name=NULL, applied_at=NULL
       WHERE id=$1 AND institution_id=$2`,
      [txId, institutionId]
    );
    await event(db, institutionId, actor, { uploadId: t.upload_id, txnId: txId, action: 'reopen', to: t.student_id, detail: { collectionId: t.collection_id } });
    return readTx(db, institutionId, txId);
  });
}

// ---------------------------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------------------------

/** Top suggestions for every open transaction of an upload (one fragment lookup for the whole batch). */
export async function suggestionsForUpload(db: Queryable, institutionId: string, uploadId: string, limit = 3): Promise<Record<string, Suggestion[]>> {
  const upload = await getUpload(db, institutionId, uploadId);
  const ctx = await loadMonthVouchers(db, institutionId, upload.feeMonth);
  const rows = (
    await db.query(
      `SELECT id, amount, description, reference, status, student_id FROM bank_statement_transactions
       WHERE institution_id = $1 AND upload_id = $2 AND status IN ('pending','assigned','applied')`,
      [institutionId, uploadId]
    )
  ).rows;
  const assignedBy = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.student_id && (r.status === 'assigned' || r.status === 'applied')) {
      const s = assignedBy.get(r.student_id) || new Set<string>();
      s.add(r.id);
      assignedBy.set(r.student_id, s);
    }
  }
  const elsewhere = (txId: string) => {
    const out = new Set<string>();
    for (const [studentId, txs] of assignedBy) if ([...txs].some((id) => id !== txId)) out.add(studentId);
    return out;
  };
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'assigned').map((r) => ({ id: r.id, amount: num(r.amount), description: r.description, reference: r.reference }));
  const result = await suggestForTransactions(db, institutionId, ctx, open, elsewhere, limit);
  return Object.fromEntries(result);
}

/** Suggestions for one transaction, optionally filtered by what the operator typed in the search box. */
export async function suggestionsForTransaction(
  deps: ServiceDeps,
  institutionId: string,
  txId: string,
  q?: string,
  limit = 8
): Promise<Suggestion[]> {
  const db = deps.pool;
  const t = (await db.query(`SELECT * FROM bank_statement_transactions WHERE id = $1 AND institution_id = $2`, [txId, institutionId])).rows[0];
  if (!t) throw new HttpError(404, 'Bank transaction not found.');
  const upload = await getUpload(db, institutionId, t.upload_id);
  const ctx = await loadMonthVouchers(db, institutionId, upload.feeMonth);
  const assigned = new Set<string>(
    (
      await db.query(
        `SELECT DISTINCT student_id FROM bank_statement_transactions
         WHERE institution_id = $1 AND upload_id = $2 AND id <> $3 AND status IN ('assigned','applied') AND student_id IS NOT NULL`,
        [institutionId, t.upload_id, txId]
      )
    ).rows.map((r: any) => r.student_id)
  );
  const amount = num(t.amount);

  if (!q || !q.trim()) {
    const m = await suggestForTransactions(db, institutionId, ctx, [{ id: txId, amount, description: t.description, reference: t.reference }], () => assigned, limit);
    return m.get(txId) || [];
  }

  const ids = await deps.searchStudentIds(institutionId, q.trim(), 20);
  if (ids.length === 0) return [];
  const rows = await lookupFragments(db, institutionId, lookupTexts(t.description, t.reference || undefined).map((f) => f.text));
  const history = scoreHistory(rows);
  const students = await loadStudents(db, institutionId, ids);
  const out: Suggestion[] = [];
  for (const id of ids) {
    const st = students.get(id);
    if (!st) continue;
    const v = ctx.vouchers.get(id) || null;
    const { score, reasons } = scoreCandidate(amount, { history: history.get(id) || null, voucher: v, assignedInUpload: assigned.has(id) });
    out.push(toSuggestion(st, score, reasons.length ? reasons : ['Matches your search'], v, assigned.has(id)));
  }
  // Search order (best text match first) is the tie-breaker; signals reorder within it.
  const order = new Map(ids.map((id, i) => [id, i]));
  out.sort((a, b) => b.score - a.score || (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0));
  return out.slice(0, limit * 2);
}

// ---------------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------------

/** Bank credits that came through a transfer channel are recorded as Online Transfer, the rest as Bank Deposit. */
export function inferPaymentMode(description: string): 'OnlineTransfer' | 'BankDeposit' {
  return /\b(IBFT|RAAST|ONLINE|MOBILE|APP|1LINK|INTERNET|IB|TRANSFER|TRF|NIFT)\b/i.test(description) ? 'OnlineTransfer' : 'BankDeposit';
}

export async function previewApply(db: Queryable, institutionId: string, uploadId: string, txIds?: string[]): Promise<ApplyPreview> {
  const upload = await getUpload(db, institutionId, uploadId);
  const params: any[] = [institutionId, uploadId];
  let extra = '';
  if (txIds && txIds.length > 0) {
    params.push(txIds);
    extra = ` AND t.id = ANY($3)`;
  }
  const rows = (
    await db.query(`${TX_SELECT} WHERE t.institution_id = $1 AND t.upload_id = $2 AND t.status = 'assigned'${extra} ORDER BY t.txn_date, t.row_index`, params)
  ).rows;
  const monthLocked = await isMonthLocked(db, institutionId, upload.feeMonth);
  const ctx = await loadMonthVouchers(db, institutionId, upload.feeMonth);

  const out: ApplyPreviewRow[] = rows.map((r) => {
    const amount = num(r.amount);
    const v = r.student_id ? ctx.vouchers.get(r.student_id) : undefined;
    let blocked: string | null = null;
    if (!r.s_name) blocked = 'The assigned student no longer exists.';
    else if (monthLocked) blocked = `Fee books for ${upload.feeMonth} are locked.`;
    else if (!v) blocked = `${r.s_name} has no fee voucher for ${upload.feeMonth}. Generate the voucher first.`;
    else if (v.status === 'Reversed') blocked = `Voucher ${v.voucherNo} is reversed.`;
    else if (!v.payable) blocked = v.blockedReason;
    const outstanding = v ? v.outstanding : null;
    return {
      txId: r.id,
      rowIndex: r.row_index,
      date: r.txn_date,
      amount,
      description: r.description,
      studentId: r.student_id,
      studentName: r.s_name || null,
      studentRegNo: r.s_reg_no || null,
      voucherId: v?.voucherId ?? null,
      voucherNo: v?.voucherNo ?? null,
      outstanding,
      excess: outstanding === null ? 0 : Math.max(0, Math.round((amount - outstanding) * 100) / 100),
      ready: blocked === null,
      blockedReason: blocked,
    };
  });
  const ready = out.filter((r) => r.ready);
  return {
    feeMonth: upload.feeMonth,
    monthLocked,
    rows: out,
    readyCount: ready.length,
    blockedCount: out.length - ready.length,
    readyTotal: Math.round(ready.reduce((s, r) => s + r.amount, 0) * 100) / 100,
  };
}

export async function applyAssigned(
  deps: ServiceDeps,
  institutionId: string,
  actor: Actor,
  uploadId: string,
  opts: { txIds?: string[]; paymentMode?: PaymentModeChoice } = {}
): Promise<ApplyResult> {
  if (!deps.receivePayments) throw new Error('Bank statements: receivePayments is not wired.');
  const upload = await getUpload(deps.pool, institutionId, uploadId);
  const preview = await previewApply(deps.pool, institutionId, uploadId, opts.txIds);
  const ready = preview.rows.filter((r) => r.ready);
  const skipped = preview.rows.filter((r) => !r.ready).map((r) => ({ txId: r.txId, reason: r.blockedReason || 'Not ready' }));
  if (ready.length === 0) {
    throw new HttpError(409, preview.rows.length === 0 ? 'No assigned transactions to apply.' : `Nothing is ready to apply. ${skipped[0]?.reason || ''}`.trim());
  }

  const mode = opts.paymentMode && opts.paymentMode !== 'auto' ? opts.paymentMode : null;
  const rowsById = new Map(ready.map((r) => [r.txId, r]));
  const payments = ready.map((r) => ({
    id: `txn-bs-${r.txId}`,
    voucherId: r.voucherId as string,
    amount: r.amount,
    paymentMode: mode || inferPaymentMode(r.description),
    referenceNo: undefined as string | undefined,
    notes: `Bank statement ${upload.filename}: ${r.description.slice(0, 160)}`,
    date: r.date,
  }));
  // The bank's own reference (when it printed one) is kept as the payment's reference number.
  const refs = (await deps.pool.query(`SELECT id, reference FROM bank_statement_transactions WHERE institution_id = $1 AND id = ANY($2)`, [institutionId, ready.map((r) => r.txId)])).rows;
  const refById = new Map(refs.map((r: any) => [r.id, r.reference as string | null]));
  payments.forEach((p, i) => {
    p.referenceNo = refById.get(ready[i].txId) || undefined;
  });

  const earliest = ready.map((r) => r.date).sort()[0];
  const result = await deps.receivePayments(
    institutionId,
    {
      payments,
      date: earliest,
      collectionNotes: `Bank statement ${upload.filename} (${upload.feeMonth}): ${ready.length} payment(s)`,
      isBulkImport: true,
    },
    {
      // Runs inside the SAME database transaction as the voucher/collection writes: either the payments are
      // recorded AND the bank rows are marked applied, or neither happens.
      afterWrites: async (db, res) => {
        const ids = ready.map((r) => r.txId);
        const upd = await db.query(
          `UPDATE bank_statement_transactions t
           SET status = 'applied', collection_id = $1, payment_txn_id = u.pid, voucher_id = u.vid,
               applied_by = $2, applied_by_name = $3, applied_at = NOW()
           FROM unnest($4::text[], $5::text[], $6::text[], $7::text[]) AS u(id, pid, vid, sid)
           WHERE t.id = u.id AND t.institution_id = $8 AND t.status = 'assigned' AND t.student_id = u.sid`,
          [
            res.collection.id, actor.id, actor.name,
            ids, ids.map((id) => `txn-bs-${id}`), ids.map((id) => rowsById.get(id)!.voucherId), ids.map((id) => rowsById.get(id)!.studentId),
            institutionId,
          ]
        );
        if ((upd.rowCount ?? 0) !== ids.length) {
          throw Object.assign(
            new Error('Some transactions were changed by someone else while applying. Nothing was recorded — reload and try again.'),
            { httpStatus: 409 }
          );
        }

        // Historical fragments: only operator-verified (applied) transactions may teach the suggestion engine.
        const full = (await db.query(`SELECT id, description, reference, student_id FROM bank_statement_transactions WHERE institution_id = $1 AND id = ANY($2)`, [institutionId, ids])).rows;
        const frag = new Map<string, { student: string; text: string; kind: string; src: string; hits: number }>();
        for (const t of full) {
          for (const f of extractFragments(t.description, t.reference || undefined)) {
            const key = `${t.student_id}\u0000${f.text}`;
            const cur = frag.get(key);
            if (cur) cur.hits++;
            else frag.set(key, { student: t.student_id, text: f.text, kind: f.kind, src: t.id, hits: 1 });
          }
        }
        if (frag.size > 0) {
          const list = [...frag.values()];
          await db.query(
            `INSERT INTO bank_statement_fragments (institution_id, student_id, fragment, kind, hits, source_txn_id)
             SELECT $1, u.student, u.fragment, u.kind, u.hits, u.src
             FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::text[]) AS u(student, fragment, kind, hits, src)
             ON CONFLICT (institution_id, student_id, fragment)
             DO UPDATE SET hits = bank_statement_fragments.hits + EXCLUDED.hits, last_seen_at = NOW()`,
            [institutionId, list.map((x) => x.student), list.map((x) => x.text), list.map((x) => x.kind), list.map((x) => x.hits), list.map((x) => x.src)]
          );
        }

        for (const id of ids) {
          await event(db, institutionId, actor, {
            uploadId, txnId: id, action: 'apply', to: rowsById.get(id)!.studentId,
            detail: { collectionId: res.collection.id, collectionNo: res.collection.collectionNo, voucherId: rowsById.get(id)!.voucherId, amount: rowsById.get(id)!.amount },
          });
        }
        if (deps.auditInTx) {
          await deps.auditInTx(db, {
            actionType: 'bank_statement_apply',
            actionTitle: 'Bank Statement Payments Applied',
            module: 'Collections',
            description: `Applied ${ids.length} bank-statement payment(s) from ${upload.filename} for ${upload.feeMonth} (${res.collection.collectionNo}).`,
            targetId: res.collection.collectionNo,
            targetLabel: `${ids.length} payment(s) from ${upload.filename}`,
            month: upload.feeMonth,
            amount: res.collection.totalAmount,
            metadata: { uploadId, transactionIds: ids },
          });
        }
      },
    }
  );

  return {
    collectionId: result.collection.id,
    collectionNo: result.collection.collectionNo,
    appliedCount: ready.length,
    totalAmount: result.collection.totalAmount,
    skipped,
  };
}
