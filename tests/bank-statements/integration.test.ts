// Integration tests against a REAL PostgreSQL (the apply step depends on row locks and one shared transaction).
// Run with:  TEST_DATABASE_URL=postgres://user@host:port/dbname npm run test:bank
// Skipped when TEST_DATABASE_URL is not set. Use a throwaway database: the test creates and deletes its own institutions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL;
if (URL) process.env.DATABASE_URL = URL;

let dbService: any, svc: any, core: any, schema: any;
const I1 = 'inst-bs-test-1';
const I2 = 'inst-bs-test-2';
const actor = { id: 'u1', name: 'Test Operator' };
let deps: any;
let failAudit = false;
const audits: any[] = [];

const csv = (rows: string[]) => Buffer.from(['Date,Narration,Chq/Ref No,Debit,Credit,Balance', ...rows].join('\n'));
const up = (buf: Buffer, month = '2026-09', name = 's.csv') => svc.createUpload(deps, I1, actor, { filename: name, buffer: buf, feeMonth: month });

before(async () => {
  if (skip) return;
  ({ dbService } = await import('../../server/db'));
  svc = await import('../../server/bank-statements/service');
  core = await import('../../server/collections-core');
  schema = await import('../../server/bank-statements/schema');
  await dbService.init();
  await dbService.withTx((c: any) => schema.ensureBankStatementSchema(c));
  const pool = (dbService as any).pgPool;
  deps = {
    pool,
    withTx: (fn: any) => dbService.withTx(fn),
    searchStudentIds: async (i: string, q: string, n: number) => (await dbService.searchStudents(i, { q, page: 1, pageSize: n })).students.map((s: any) => s.id),
    receivePayments: core.receivePayments,
    runVoucherTransaction: (i: string, scope: any, m: any) => dbService.runVoucherTransaction(i, scope, m),
    auditInTx: async (_c: any, entry: any) => {
      if (failAudit) throw new Error('injected audit failure');
      audits.push(entry);
    },
  };
  for (const i of [I1, I2]) {
    await pool.query(`DELETE FROM institutions WHERE id = $1`, [i]);
    await pool.query(`INSERT INTO institutions (id, name, code) VALUES ($1,$2,$3)`, [i, `Test ${i}`, i.slice(-8)]);
    await pool.query(`INSERT INTO classes (id, institution_id, name) VALUES ($1,$2,'Class 5')`, [`${i}-c`, i]);
  }
  const mk = async (id: string, name: string, reg: string, father: string, net: number, inst = I1, month = '2026-09', status = 'Issued') => {
    await pool.query(`INSERT INTO students (id, institution_id, name, reg_no, father_name, class_id, status) VALUES ($1,$2,$3,$4,$5,$6,'Active')`, [id, inst, name, reg, father, `${inst}-c`]);
    if (net > 0)
      await pool.query(
        `INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, net_due, amount_paid, status) VALUES ($1,$2,$3,$4,$5,$6,0,$7)`,
        [`v-${id}`, inst, `FE-${id}`, id, month, net, status]
      );
  };
  await mk('sAli', 'Ali Khan', 'R1', 'Khan Senior', 5000);
  await mk('sSara', 'Sara Ahmed', 'R2', 'Ahmed Senior', 12500);
  await mk('sUsman', 'Usman Raza', 'R3', 'Raza Senior', 7000);
  await mk('sNoVoucher', 'Zain NoVoucher', 'R4', 'Z', 0);
  await mk('sOther', 'Other Tenant', 'R9', 'X', 5000, I2);
});

after(async () => {
  if (skip) return;
  const pool = (dbService as any).pgPool;
  for (const i of [I1, I2]) await pool.query(`DELETE FROM institutions WHERE id = $1`, [i]);
  await pool.end();
});

const T = { skip };

test('upload stages only credits; identical or fully-known files are refused, overlap adds only new rows', T, async () => {
  const a = await up(csv([
    '01/09/2026,IBFT FROM ALI KHAN,REF1,,"5,000.00","105,000.00"',
    '02/09/2026,ATM WITHDRAWAL,,"2,000.00",,"103,000.00"',
    '02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"',
  ]));
  assert.equal(a.parseStatus, 'parsed');
  assert.equal(a.newCount, 2);
  assert.equal(a.counts.pending, 2);

  // Exactly the same file again is refused outright and leaves no trace.
  const before = async () => (await deps.pool.query(
    `SELECT (SELECT COUNT(*) FROM bank_statement_uploads WHERE institution_id = $1)::int AS u,
            (SELECT COUNT(*) FROM bank_statement_files WHERE institution_id = $1)::int AS f`, [I1])).rows[0];
  const snap = await before();
  await assert.rejects(
    () => up(csv([
      '01/09/2026,IBFT FROM ALI KHAN,REF1,,"5,000.00","105,000.00"',
      '02/09/2026,ATM WITHDRAWAL,,"2,000.00",,"103,000.00"',
      '02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"',
    ])),
    (e: any) => e.httpStatus === 409 && /exact file was already uploaded as "s\.csv"/.test(e.message)
  );
  assert.deepEqual(await before(), snap);

  // A different file whose credits are all known already is refused too.
  await assert.rejects(
    () => up(csv(['02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"']), '2026-09', 'subset.csv'),
    (e: any) => e.httpStatus === 409 && /already loaded \(from "s\.csv"/.test(e.message)
  );
  assert.deepEqual(await before(), snap);

  const overlap = await up(csv([
    '02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"',
    '03/09/2026,RAAST FROM USMAN RAZA,,,"7,000.00","122,500.00"',
  ]), '2026-09', 'overlap.csv');
  assert.equal(overlap.newCount, 1);
  assert.equal(overlap.duplicateCount, 1);
  const open = await svc.listTransactions(deps.pool, I1, overlap.id);
  assert.deepEqual(open.map((t: any) => t.amount), [7000]);
});

test('failed parse stores the file but no transactions; locked month is refused', T, async () => {
  const bad = await svc.createUpload(deps, I1, actor, { filename: 'junk.csv', buffer: Buffer.from('hello,world\n1,2'), feeMonth: '2026-09' });
  assert.equal(bad.parseStatus, 'failed');
  assert.match(bad.parseError, /supported statement format|column headings/);
  const n = await deps.pool.query(`SELECT COUNT(*)::int AS n FROM bank_statement_transactions WHERE upload_id = $1`, [bad.id]);
  assert.equal(n.rows[0].n, 0);
  assert.ok((await svc.getUploadFile(deps.pool, I1, bad.id)).content.length > 0);

  await deps.pool.query(`INSERT INTO locked_months (institution_id, month) VALUES ($1,'2026-01') ON CONFLICT DO NOTHING`, [I1]);
  await assert.rejects(() => up(csv(['01/01/2026,X,,,"1.00","1.00"']), '2026-01'), (e: any) => e.httpStatus === 423);
  await deps.pool.query(`DELETE FROM locked_months WHERE institution_id = $1`, [I1]);
});

test('full flow: suggest → assign → preview → apply through the real fee engine, then learn from history', T, async () => {
  const u = await up(csv([
    '10/09/2026,IBFT FROM MUHAMMAD IQBAL TRF FEE,FT100,,"5,000.00","1.00"',
    '10/09/2026,ONLINE TRANSFER SARA AHMED,FT101,,"13,000.00","2.00"',
    '11/09/2026,CASH DEPOSIT UNKNOWN PERSON,FT102,,"999.00","3.00"',
  ]), '2026-09', 'flow.csv');
  const txs = await svc.listTransactions(deps.pool, I1, u.id);
  const [t1, t2, t3] = txs;

  // Amount signal: 5,000 matches Ali's outstanding exactly; 13,000 is near Sara's 12,500.
  const sug = await svc.suggestionsForUpload(deps.pool, I1, u.id);
  assert.equal(sug[t1.id][0].studentId, 'sAli');
  assert.match(sug[t1.id][0].reasons.join(' '), /equals the outstanding/);
  assert.equal(sug[t2.id][0].studentId, 'sSara');

  await svc.assignStudent(deps, I1, actor, t1.id, 'sAli');
  // Progressive elimination: Ali sinks for the other transactions of this upload.
  const after = await svc.suggestionsForTransaction(deps, I1, t3.id);
  const ali = after.find((s: any) => s.studentId === 'sAli');
  assert.ok(!ali || after.indexOf(ali) === after.length - 1 || ali.assignedInUpload);

  await svc.assignStudent(deps, I1, actor, t2.id, 'sSara');
  await svc.assignStudent(deps, I1, actor, t3.id, 'sNoVoucher');

  const pv = await svc.previewApply(deps.pool, I1, u.id);
  assert.equal(pv.readyCount, 2);
  assert.equal(pv.blockedCount, 1);
  assert.match(pv.rows.find((r: any) => r.txId === t3.id).blockedReason, /no fee voucher/i);
  assert.equal(pv.rows.find((r: any) => r.txId === t2.id).excess, 500);

  const res = await svc.applyAssigned(deps, I1, actor, u.id);
  assert.equal(res.appliedCount, 2);
  assert.equal(res.totalAmount, 18000);
  assert.equal(res.skipped.length, 1);

  // The fee engine did the work: collection, payments, voucher status, advance as overpayment.
  const v = (await deps.pool.query(`SELECT id, status, amount_paid, net_due FROM vouchers WHERE institution_id=$1 AND id IN ('v-sAli','v-sSara') ORDER BY id`, [I1])).rows;
  assert.deepEqual(v.map((x: any) => [x.status, Number(x.amount_paid)]), [['Paid', 5000], ['Paid', 13000]]);
  const col = (await deps.pool.query(`SELECT * FROM collections WHERE id = $1 AND institution_id = $2`, [res.collectionId, I1])).rows[0];
  assert.equal(Number(col.total_amount), 18000);
  assert.equal(col.transaction_count, 2);
  const pay = (await deps.pool.query(`SELECT mode, ref FROM (SELECT payment_mode AS mode, reference_no AS ref FROM transactions WHERE collection_id = $1 ORDER BY reference_no) x`, [res.collectionId])).rows;
  assert.deepEqual(pay, [{ mode: 'OnlineTransfer', ref: 'FT100' }, { mode: 'OnlineTransfer', ref: 'FT101' }]);

  const applied = await svc.listTransactions(deps.pool, I1, u.id, { status: 'applied' });
  assert.equal(applied.length, 2);
  assert.ok(applied.every((t: any) => t.collectionId === res.collectionId && t.collectionNo && !t.collectionMissing));
  const left = await svc.listTransactions(deps.pool, I1, u.id);
  assert.deepEqual(left.map((t: any) => t.id), [t3.id]);

  // Applying again does nothing; an applied row cannot be reassigned.
  await assert.rejects(() => svc.applyAssigned(deps, I1, actor, u.id, { txIds: [t1.id] }), (e: any) => e.httpStatus === 409);
  await assert.rejects(() => svc.assignStudent(deps, I1, actor, t1.id, 'sUsman'), (e: any) => e.httpStatus === 409);

  // History: a later statement from the same sender now points at Ali first, even with an unrelated amount.
  const next = await up(csv(['20/09/2026,IBFT FROM MUHAMMAD IQBAL,FT200,,"1,234.00","9.00"']), '2026-10', 'next.csv');
  const nt = (await svc.listTransactions(deps.pool, I1, next.id))[0];
  const hist = await svc.suggestionsForTransaction(deps, I1, nt.id);
  assert.equal(hist[0].studentId, 'sAli');
  assert.match(hist[0].reasons.join(' '), /MUHAMMAD IQBAL|MUHAMMAD|IQBAL/);
  // Free-text search still works and carries the same signals.
  const found = await svc.suggestionsForTransaction(deps, I1, nt.id, 'Sara');
  assert.equal(found[0].studentId, 'sSara');
});

test('apply is atomic: a failure inside the shared transaction records nothing', T, async () => {
  const u = await up(csv(['12/09/2026,CASH DEPOSIT USMAN RAZA,FT300,,"7,000.00","1.00"']), '2026-09', 'atomic.csv');
  const t = (await svc.listTransactions(deps.pool, I1, u.id))[0];
  await svc.assignStudent(deps, I1, actor, t.id, 'sUsman');
  const boom = { ...deps, auditInTx: async () => { throw new Error('audit write failed'); } };
  await assert.rejects(() => svc.applyAssigned(boom, I1, actor, u.id), /audit write failed/);
  const v = (await deps.pool.query(`SELECT status, amount_paid FROM vouchers WHERE id = 'v-sUsman'`)).rows[0];
  assert.equal(v.status, 'Issued');
  assert.equal(Number(v.amount_paid), 0);
  assert.equal((await deps.pool.query(`SELECT COUNT(*)::int n FROM transactions WHERE student_id='sUsman'`)).rows[0].n, 0);
  assert.equal((await svc.listTransactions(deps.pool, I1, u.id))[0].status, 'assigned');

  // And a good run afterwards works.
  const ok = await svc.applyAssigned(deps, I1, actor, u.id);
  assert.equal(ok.appliedCount, 1);
});

test('two operators applying at once: exactly one wins, money is posted once', T, async () => {
  const u = await up(csv(['13/09/2026,CASH DEPOSIT TEST TWICE,FT400,,"4,321.00","1.00"']), '2026-09', 'race.csv');
  const t = (await svc.listTransactions(deps.pool, I1, u.id))[0];
  await deps.pool.query(`INSERT INTO students (id, institution_id, name, reg_no, class_id, status) VALUES ('sRace',$1,'Race Student','R7',$2,'Active') ON CONFLICT DO NOTHING`, [I1, `${I1}-c`]);
  await deps.pool.query(`INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, net_due, amount_paid, status) VALUES ('v-sRace',$1,'FE-race','sRace','2026-09',9000,0,'Issued') ON CONFLICT DO NOTHING`, [I1]);
  await svc.assignStudent(deps, I1, actor, t.id, 'sRace');
  const results = await Promise.allSettled([svc.applyAssigned(deps, I1, actor, u.id), svc.applyAssigned(deps, I1, actor, u.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const v = (await deps.pool.query(`SELECT amount_paid FROM vouchers WHERE id = 'v-sRace'`)).rows[0];
  assert.equal(Number(v.amount_paid), 4321);
});

test('a reversed collection can be reopened and applied again; a live one cannot', T, async () => {
  const u = await up(csv(['14/09/2026,CASH DEPOSIT REOPEN CASE,FT500,,"3,000.00","1.00"']), '2026-09', 'reopen.csv');
  const t = (await svc.listTransactions(deps.pool, I1, u.id))[0];
  await deps.pool.query(`INSERT INTO students (id, institution_id, name, reg_no, class_id, status) VALUES ('sRe',$1,'Reopen Student','R8',$2,'Active') ON CONFLICT DO NOTHING`, [I1, `${I1}-c`]);
  await deps.pool.query(`INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, net_due, amount_paid, status) VALUES ('v-sRe',$1,'FE-re','sRe','2026-09',3000,0,'Issued') ON CONFLICT DO NOTHING`, [I1]);
  await svc.assignStudent(deps, I1, actor, t.id, 'sRe');
  const r1 = await svc.applyAssigned(deps, I1, actor, u.id);
  await assert.rejects(() => svc.reopenTransaction(deps, I1, actor, t.id), (e: any) => e.httpStatus === 409);

  // Simulate the Collections screen reversing it: collection + payment removed, voucher back to Issued.
  await deps.pool.query(`DELETE FROM transactions WHERE collection_id = $1`, [r1.collectionId]);
  await deps.pool.query(`DELETE FROM collections WHERE id = $1`, [r1.collectionId]);
  await deps.pool.query(`UPDATE vouchers SET amount_paid = 0, status = 'Issued' WHERE id = 'v-sRe'`);
  const shown = (await svc.listTransactions(deps.pool, I1, u.id, { status: 'applied' }))[0];
  assert.equal(shown.collectionMissing, true);
  const re = await svc.reopenTransaction(deps, I1, actor, t.id);
  assert.equal(re.status, 'assigned');
  assert.equal(re.studentId, 'sRe');
  assert.equal((await svc.applyAssigned(deps, I1, actor, u.id)).appliedCount, 1);
});

test('ignore / unassign / unignore transitions and the audit trail', T, async () => {
  const u = await up(csv(['15/09/2026,SOMETHING ELSE,FT600,,"50.00","1.00"']), '2026-09', 'ign.csv');
  const t = (await svc.listTransactions(deps.pool, I1, u.id))[0];
  await svc.assignStudent(deps, I1, actor, t.id, 'sAli');
  assert.equal((await svc.unassignStudent(deps, I1, actor, t.id)).status, 'pending');
  const ig = await svc.ignoreTransaction(deps, I1, actor, t.id, 'bank charge refund');
  assert.equal(ig.status, 'ignored');
  assert.equal(ig.ignoreReason, 'bank charge refund');
  assert.equal((await svc.listTransactions(deps.pool, I1, u.id)).length, 0);
  // Re-uploading does not resurrect an ignored transaction.
  await assert.rejects(() => up(csv(['15/09/2026,SOMETHING ELSE,FT600,,"50.00","1.00"']), '2026-09', 'ign2.csv'), (e: any) => e.httpStatus === 409);
  assert.equal((await svc.unignoreTransaction(deps, I1, actor, t.id)).status, 'pending');
  const ev = await deps.pool.query(`SELECT action FROM bank_statement_events WHERE txn_id = $1 ORDER BY id`, [t.id]);
  assert.deepEqual(ev.rows.map((r: any) => r.action), ['assign', 'unassign', 'ignore', 'unignore']);
});

test('institutions are isolated from each other', T, async () => {
  const u = await up(csv(['16/09/2026,CASH DEPOSIT ISOLATION,FT700,,"10.00","1.00"']), '2026-09', 'iso.csv');
  const t = (await svc.listTransactions(deps.pool, I1, u.id))[0];
  await assert.rejects(() => svc.getUpload(deps.pool, I2, u.id), (e: any) => e.httpStatus === 404);
  await assert.rejects(() => svc.assignStudent(deps, I2, actor, t.id, 'sOther'), (e: any) => e.httpStatus === 404);
  await assert.rejects(() => svc.assignStudent(deps, I1, actor, t.id, 'sOther'), (e: any) => e.httpStatus === 404);
  // Same transaction in the other school is NOT a duplicate of this one.
  const other = await svc.createUpload(deps, I2, actor, { filename: 'iso.csv', buffer: csv(['16/09/2026,CASH DEPOSIT ISOLATION,FT700,,"10.00","1.00"']), feeMonth: '2026-09' });
  assert.equal(other.newCount, 1);
});

test('simultaneous identical uploads: one succeeds, the other is refused', T, async () => {
  const buf = csv(['20/09/2026,RACE PAYER ONE,RC1,,"1,111.00","9.00"']);
  const r = await Promise.allSettled([up(buf, '2026-09', 'race-a.csv'), up(buf, '2026-09', 'race-b.csv')]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  const bad: any = r.find((x) => x.status === 'rejected');
  assert.equal(bad.reason.httpStatus, 409);
  const n = await deps.pool.query(`SELECT COUNT(*)::int AS n FROM bank_statement_uploads WHERE institution_id = $1 AND file_hash = (SELECT file_hash FROM bank_statement_uploads WHERE filename LIKE 'race-%' AND institution_id = $1 LIMIT 1)`, [I1]);
  assert.equal(n.rows[0].n, 1);
});

test('a failed parse can be retried with the same file', T, async () => {
  const junk = Buffer.from('nothing,useful\n1,2');
  const a = await svc.createUpload(deps, I1, actor, { filename: 'j1.csv', buffer: junk, feeMonth: '2026-09' });
  const b = await svc.createUpload(deps, I1, actor, { filename: 'j2.csv', buffer: junk, feeMonth: '2026-09' });
  assert.equal(a.parseStatus, 'failed');
  assert.equal(b.parseStatus, 'failed');
});

const rowsFor = async (uploadId: string) =>
  (await deps.pool.query(
    `SELECT (SELECT COUNT(*) FROM bank_statement_uploads WHERE id = $1)::int AS uploads,
            (SELECT COUNT(*) FROM bank_statement_transactions WHERE upload_id = $1)::int AS txns,
            (SELECT COUNT(*) FROM bank_statement_events WHERE upload_id = $1)::int AS events`, [uploadId])).rows[0];

test('delete is a hard cascade: rows, events, file and learned fragments go; the file can be uploaded again', T, async () => {
  const buf = csv(['21/09/2026,CASH DEPOSIT QUINCE ZEBRA,DZ1,,"4,321.00","10.00"']);
  const u = await up(buf, '2026-09', 'del-a.csv');
  const [t] = await svc.listTransactions(deps.pool, I1, u.id);
  await deps.pool.query(
    `INSERT INTO bank_statement_fragments (institution_id, student_id, fragment, kind, source_txn_id) VALUES ($1,'sAli','QUINCE','word',$2)`, [I1, t.id]);
  const file = await deps.pool.query(`SELECT file_id FROM bank_statement_uploads WHERE id = $1`, [u.id]);

  const res = await svc.deleteUpload(deps, I1, u.id);
  assert.equal(res.transactions, 1);
  assert.equal(res.fragments, 1);
  assert.equal(res.fileRemoved, true);
  assert.deepEqual(await rowsFor(u.id), { uploads: 0, txns: 0, events: 0 });
  assert.equal((await deps.pool.query(`SELECT 1 FROM bank_statement_files WHERE id = $1`, [file.rows[0].file_id])).rowCount, 0);
  assert.equal((await deps.pool.query(`SELECT 1 FROM bank_statement_fragments WHERE source_txn_id = $1`, [t.id])).rowCount, 0);
  await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), (e: any) => e.httpStatus === 404);

  const again = await up(buf, '2026-09', 'del-a2.csv'); // the file is free to load again
  assert.equal(again.newCount, 1);
});

test('delete is refused in a locked month and removes nothing', T, async () => {
  const u = await up(csv(['22/09/2026,CASH DEPOSIT LOCKED CASE,LK1,,"2,222.00","11.00"']), '2026-09', 'del-lock.csv');
  const before = await rowsFor(u.id);
  await deps.pool.query(`INSERT INTO locked_months (institution_id, month) VALUES ($1,'2026-09') ON CONFLICT DO NOTHING`, [I1]);
  try {
    await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), (e: any) => e.httpStatus === 423);
    assert.deepEqual(await rowsFor(u.id), before);
  } finally {
    await deps.pool.query(`DELETE FROM locked_months WHERE institution_id = $1`, [I1]);
  }
  await svc.deleteUpload(deps, I1, u.id);
});

test('a shared file survives until its last upload is deleted; other institutions are untouched', T, async () => {
  const buf = csv(['24/09/2026,CASH DEPOSIT SHARED FILE,SH1,,"3,333.00","13.00"']);
  const u = await up(buf, '2026-09', 'shared.csv');
  const { file_id } = (await deps.pool.query(`SELECT file_id FROM bank_statement_uploads WHERE id = $1`, [u.id])).rows[0];
  // a second upload row pointing at the same stored file (as an older version could have created)
  await deps.pool.query(
    `INSERT INTO bank_statement_uploads (id, institution_id, fee_month, filename, file_hash, file_id, parse_status) VALUES ('bsu-shared2',$1,'2026-09','shared2.csv','x','${file_id}','failed')`, [I1]);
  assert.equal((await svc.deleteUpload(deps, I1, u.id)).fileRemoved, false);
  assert.equal((await deps.pool.query(`SELECT 1 FROM bank_statement_files WHERE id = $1`, [file_id])).rowCount, 1);
  assert.equal((await svc.deleteUpload(deps, I1, 'bsu-shared2')).fileRemoved, true);
  await assert.rejects(() => svc.deleteUpload(deps, I2, 'bsu-nonexistent'), (e: any) => e.httpStatus === 404);
});

test('schema upgrade: old duplicate-file records are removed and the one-upload-per-file rule is enforced', T, async () => {
  const pool = deps.pool;
  const f = (await up(csv(['25/09/2026,CASH DEPOSIT UPGRADE CASE,UP1,,"1,234.00","14.00"']), '2026-09', 'up-orig.csv'));
  const { file_hash, file_id } = (await pool.query(`SELECT file_hash, file_id FROM bank_statement_uploads WHERE id = $1`, [f.id])).rows[0];
  await pool.query(`DROP INDEX uq_bank_statement_upload_hash`);
  await pool.query(`ALTER TABLE bank_statement_uploads ADD COLUMN exact_duplicate_of VARCHAR(64)`);
  await pool.query(
    `INSERT INTO bank_statement_uploads (id, institution_id, fee_month, filename, file_hash, file_id, parse_status, exact_duplicate_of)
     VALUES ('bsu-old-dup',$1,'2026-09','up-dup.csv',$2,$3,'parsed',$4)`, [I1, file_hash, file_id, f.id]);
  schema.resetSchemaFlagForTests();
  await dbService.withTx((c: any) => schema.ensureBankStatementSchema(c));
  assert.equal((await pool.query(`SELECT 1 FROM bank_statement_uploads WHERE id = 'bsu-old-dup'`)).rowCount, 0);
  assert.equal((await pool.query(`SELECT 1 FROM bank_statement_uploads WHERE id = $1`, [f.id])).rowCount, 1);
  assert.equal((await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='bank_statement_uploads' AND column_name='exact_duplicate_of'`)).rowCount, 0);
  await assert.rejects(() => pool.query(
    `INSERT INTO bank_statement_uploads (id, institution_id, fee_month, filename, file_hash, parse_status) VALUES ('bsu-x',$1,'2026-09','x.csv',$2,'parsed')`, [I1, file_hash]),
    (e: any) => e.code === '23505');
});

// ---------------------------------------------------------------------------------------------
// Deleting a statement reverses everything it posted, as if it had never been uploaded.
// ---------------------------------------------------------------------------------------------
type P = { kind: string; label: string; amount: number };
async function mkStudent(id: string, reg: string) {
  await deps.pool.query(`INSERT INTO students (id, institution_id, name, reg_no, father_name, class_id, status) VALUES ($1,$2,$3,$4,'F',$5,'Active')`, [id, I1, `Student ${id}`, reg, `${I1}-c`]);
}
async function mkVoucher(id: string, student: string, month: string, parts: P[], o: { prev?: number; paid?: number; status?: string } = {}) {
  const gross = parts.filter((p) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount').reduce((n, p) => n + p.amount, 0);
  const net = parts.reduce((n, p) => n + p.amount, 0);
  await deps.pool.query(
    `INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, gross_total, prev_balance, net_due, amount_paid, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, I1, `FE-${id}`, student, month, gross, o.prev || 0, net, o.paid || 0, o.status || 'Issued']
  );
  let k = 0;
  for (const p of parts) await deps.pool.query(`INSERT INTO voucher_particulars (id, voucher_id, kind, label, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`, [`${id}-p${k}`, id, p.kind, p.label, p.amount, k++]);
}
const snap = async (students: string[]) =>
  (await deps.pool.query(
    `SELECT v.id, v.month, v.gross_total::float, v.prev_balance::float, v.net_due::float, v.amount_paid::float, v.status,
            COALESCE((SELECT json_agg(json_build_array(p.kind, p.label, p.amount::float) ORDER BY p.sort_order) FROM voucher_particulars p WHERE p.voucher_id = v.id), '[]') AS parts
     FROM vouchers v WHERE v.institution_id = $1 AND v.student_id = ANY($2) ORDER BY v.id`, [I1, students])).rows;
const postedCount = async (students: string[]) =>
  (await deps.pool.query(`SELECT (SELECT COUNT(*) FROM transactions WHERE institution_id = $1 AND student_id = ANY($2))::int AS t`, [I1, students])).rows[0].t;
const collectionsNow = async () => (await deps.pool.query(`SELECT COUNT(*)::int AS n FROM collections WHERE institution_id = $1`, [I1])).rows[0].n;

async function loadAndApply(rowsCsv: string[], month: string, name: string, assign: Array<[number, string, any?]>) {
  const u = await up(csv(rowsCsv), month, name);
  const txs = await svc.listTransactions(deps.pool, I1, u.id);
  for (const [idx, sid, split] of assign) await svc.assignStudent(deps, I1, actor, txs[idx].id, sid, split);
  const r = await svc.applyAssigned(deps, I1, actor, u.id);
  assert.equal(r.appliedCount, assign.length);
  return u;
}

test('deleting an applied statement reverses its payments: vouchers return to exactly their earlier state', T, async () => {
  await mkStudent('sR1', 'R31');
  await mkVoucher('vR1-jul', 'sR1', '2026-07', [{ kind: 'Tuition', label: 'Tuition', amount: 1000 }], { status: 'Carried' });
  await mkVoucher('vR1-aug', 'sR1', '2026-08', [{ kind: 'PreviousBalance', label: 'Previous Balance Arrears', amount: 1000 }, { kind: 'Tuition', label: 'Tuition', amount: 1000 }], { prev: 1000 });
  await mkStudent('sR1b', 'R32');
  await mkVoucher('vR1b-aug', 'sR1b', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 3000 }]);
  const students = ['sR1', 'sR1b'];
  const before = await snap(students);
  const collsBefore = await collectionsNow();

  const u = await loadAndApply(
    ['03/08/2026,CASH DEPOSIT REVERSE ONE,RV1,,"2,500.00","1.00"', '03/08/2026,CASH DEPOSIT REVERSE TWO,RV2,,"3,000.00","2.00"'],
    '2026-08', 'rev1.csv', [[0, 'sR1'], [1, 'sR1b']]);
  const applied = await snap(students);
  assert.notDeepEqual(applied, before); // payments really changed the vouchers
  assert.equal(await postedCount(students), 2);

  const plan = await svc.deleteUpload(deps, I1, u.id, { dryRun: true });
  assert.equal(plan.paymentsToReverse, 2);
  assert.equal(plan.amountToReverse, 5500);
  assert.equal(plan.studentCount, 2);
  assert.equal(plan.blockedReason, null);
  assert.deepEqual(await snap(students), applied); // a preview changes nothing

  audits.length = 0;
  const res = await svc.deleteUpload(deps, I1, u.id);
  assert.equal(res.collectionsReversed, 1);
  assert.equal(res.paymentsReversed, 2);
  assert.deepEqual(await snap(students), before);
  assert.equal(await postedCount(students), 0);
  assert.equal(await collectionsNow(), collsBefore);
  assert.deepEqual(await rowsFor(u.id), { uploads: 0, txns: 0, events: 0 });
  assert.deepEqual(audits.map((a) => a.actionType), ['collection_reversal', 'bank_statement_delete']);

  // The same file can now be loaded and applied again with no trace of the first time.
  const again = await loadAndApply(
    ['03/08/2026,CASH DEPOSIT REVERSE ONE,RV1,,"2,500.00","1.00"', '03/08/2026,CASH DEPOSIT REVERSE TWO,RV2,,"3,000.00","2.00"'],
    '2026-08', 'rev1-again.csv', [[0, 'sR1'], [1, 'sR1b']]);
  assert.deepEqual(await snap(students), applied);
  await svc.deleteUpload(deps, I1, again.id);
  assert.deepEqual(await snap(students), before);
});

test('a late fine added at payment is taken back with the payment', T, async () => {
  await mkStudent('sR2', 'R33');
  await mkVoucher('vR2-aug', 'sR2', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 1000 }]);
  const before = await snap(['sR2']);
  const u = await loadAndApply(['04/08/2026,CASH DEPOSIT FINE CASE,FN1,,"1,100.00","3.00"'], '2026-08', 'rev-fine.csv', [[0, 'sR2', { duesAmount: 1000, fineAmount: 100 }]]);
  const applied = await snap(['sR2']);
  assert.ok(applied[0].parts.some((p: any) => p[0] === 'Fine'));
  audits.length = 0;
  await svc.deleteUpload(deps, I1, u.id);
  assert.deepEqual(await snap(['sR2']), before);
  assert.ok(audits.some((a) => a.actionType === 'fine_modification'));
});

test('a locked month anywhere in the reversal refuses the delete and changes nothing', T, async () => {
  await mkStudent('sR3', 'R34');
  await mkVoucher('vR3-aug', 'sR3', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 500 }]);
  const u = await loadAndApply(['05/08/2026,CASH DEPOSIT LOCK CASE,LC1,,"500.00","4.00"'], '2026-08', 'rev-lock.csv', [[0, 'sR3']]);
  const applied = await snap(['sR3']);
  const rowsBefore = await rowsFor(u.id);
  await deps.pool.query(`INSERT INTO locked_months (institution_id, month) VALUES ($1,'2026-08') ON CONFLICT DO NOTHING`, [I1]);
  try {
    const plan = await svc.deleteUpload(deps, I1, u.id, { dryRun: true });
    assert.match(plan.blockedReason, /locked/);
    await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), (e: any) => e.httpStatus === 423);
    assert.deepEqual(await snap(['sR3']), applied);
    assert.deepEqual(await rowsFor(u.id), rowsBefore);
  } finally {
    await deps.pool.query(`DELETE FROM locked_months WHERE institution_id = $1`, [I1]);
  }
  // Statement month open, but the payment landed on a voucher of a locked month.
  await deps.pool.query(`UPDATE bank_statement_uploads SET fee_month = '2026-09' WHERE id = $1`, [u.id]);
  await deps.pool.query(`INSERT INTO locked_months (institution_id, month) VALUES ($1,'2026-08') ON CONFLICT DO NOTHING`, [I1]);
  try {
    const plan = await svc.deleteUpload(deps, I1, u.id, { dryRun: true });
    assert.match(plan.blockedReason, /2026-08/);
    await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), (e: any) => e.httpStatus === 423);
    assert.deepEqual(await snap(['sR3']), applied);
  } finally {
    await deps.pool.query(`DELETE FROM locked_months WHERE institution_id = $1`, [I1]);
  }
  await svc.deleteUpload(deps, I1, u.id);
});

test('a failure at any point rolls the whole delete back (nothing reversed, nothing removed)', T, async () => {
  await mkStudent('sR4', 'R35');
  await mkVoucher('vR4-aug', 'sR4', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 700 }]);
  const u = await loadAndApply(['06/08/2026,CASH DEPOSIT ROLLBACK CASE,RB1,,"700.00","5.00"'], '2026-08', 'rev-rb.csv', [[0, 'sR4']]);
  const applied = await snap(['sR4']);
  const rowsBefore = await rowsFor(u.id);
  const collsBefore = await collectionsNow();
  failAudit = true;
  try {
    await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), /injected audit failure/);
  } finally {
    failAudit = false;
  }
  assert.deepEqual(await snap(['sR4']), applied);
  assert.deepEqual(await rowsFor(u.id), rowsBefore);
  assert.equal(await collectionsNow(), collsBefore);
  await svc.deleteUpload(deps, I1, u.id);
});

test('a payment in the collection that did not come from this statement blocks the delete', T, async () => {
  await mkStudent('sR5', 'R36');
  await mkVoucher('vR5-aug', 'sR5', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 900 }]);
  const u = await loadAndApply(['07/08/2026,CASH DEPOSIT FOREIGN CASE,FG1,,"400.00","6.00"'], '2026-08', 'rev-foreign.csv', [[0, 'sR5']]);
  const col = (await deps.pool.query(`SELECT collection_id FROM bank_statement_transactions WHERE upload_id = $1`, [u.id])).rows[0].collection_id;
  await deps.pool.query(
    `INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, date) VALUES ('t-foreign',$1,'TXN-F',$2,'vR5-aug','sR5','2026-08',100,'2026-08-07')`, [I1, col]);
  try {
    const plan = await svc.deleteUpload(deps, I1, u.id, { dryRun: true });
    assert.equal(plan.foreignPayments, 1);
    await assert.rejects(() => svc.deleteUpload(deps, I1, u.id), (e: any) => e.httpStatus === 409);
  } finally {
    await deps.pool.query(`DELETE FROM transactions WHERE id = 't-foreign'`);
  }
  await svc.deleteUpload(deps, I1, u.id);
});

test('a collection already reversed in Collections is skipped; the delete still completes', T, async () => {
  await mkStudent('sR6', 'R37');
  await mkVoucher('vR6-aug', 'sR6', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 800 }]);
  const before = await snap(['sR6']);
  const u = await loadAndApply(['08/08/2026,CASH DEPOSIT SKIP CASE,SK1,,"800.00","7.00"'], '2026-08', 'rev-skip.csv', [[0, 'sR6']]);
  const col = (await deps.pool.query(`SELECT collection_id FROM bank_statement_transactions WHERE upload_id = $1`, [u.id])).rows[0].collection_id;
  // someone reverses it in Collections (the same rows the fee engine's own reversal removes)
  await deps.pool.query(`DELETE FROM transactions WHERE collection_id = $1`, [col]);
  await deps.pool.query(`DELETE FROM collections WHERE id = $1`, [col]);
  await deps.pool.query(`UPDATE vouchers SET amount_paid = 0, status = 'Issued' WHERE id = 'vR6-aug'`);
  const res = await svc.deleteUpload(deps, I1, u.id);
  assert.equal(res.collectionsReversed, 0);
  assert.deepEqual(await snap(['sR6']), before);
});

test('two deletes of the same statement at once: one wins, the other gets not-found; money reversed once', T, async () => {
  await mkStudent('sR7', 'R38');
  await mkVoucher('vR7-aug', 'sR7', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 600 }]);
  const before = await snap(['sR7']);
  const u = await loadAndApply(['09/08/2026,CASH DEPOSIT TWICE CASE,TW1,,"600.00","8.00"'], '2026-08', 'rev-twice.csv', [[0, 'sR7']]);
  const r = await Promise.allSettled([svc.deleteUpload(deps, I1, u.id), svc.deleteUpload(deps, I1, u.id)]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(((r.find((x) => x.status === 'rejected') as any).reason).httpStatus, 404);
  assert.deepEqual(await snap(['sR7']), before);
});

test('delete racing an apply of the same statement ends consistent (either fully posted then fully reversed, or the apply refused)', T, async () => {
  await mkStudent('sR8', 'R39');
  await mkVoucher('vR8-aug', 'sR8', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 650 }]);
  const before = await snap(['sR8']);
  const u = await up(csv(['10/08/2026,CASH DEPOSIT RACE APPLY,RA1,,"650.00","9.00"']), '2026-08', 'rev-race.csv');
  const [t] = await svc.listTransactions(deps.pool, I1, u.id);
  await svc.assignStudent(deps, I1, actor, t.id, 'sR8');
  await Promise.allSettled([svc.applyAssigned(deps, I1, actor, u.id), svc.deleteUpload(deps, I1, u.id)]);
  const left = (await deps.pool.query(`SELECT COUNT(*)::int AS n FROM bank_statement_uploads WHERE id = $1`, [u.id])).rows[0].n;
  if (left === 0) {
    assert.deepEqual(await snap(['sR8']), before);
    assert.equal(await postedCount(['sR8']), 0);
  } else {
    // the delete lost the race (asked to retry): the statement is intact and fully posted, or never posted
    const posted = await postedCount(['sR8']);
    assert.ok(posted === 0 || posted === 1);
    await svc.deleteUpload(deps, I1, u.id).catch(() => undefined);
  }
  assert.deepEqual(await snap(['sR8']), before);
});

// ---------------------------------------------------------------------------------------------
// Payment method per row: a guess from the narration, the operator's choice saved on the row, used when posting.
// ---------------------------------------------------------------------------------------------
test('payment method: guessed from the narration, saved when chosen, logged, and used per payment when posting', T, async () => {
  await mkStudent('sM1', 'R41');
  await mkStudent('sM2', 'R42');
  await mkVoucher('vM1-aug', 'sM1', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 1000 }]);
  await mkVoucher('vM2-aug', 'sM2', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 2000 }]);
  const u = await up(csv([
    '11/08/2026,IBFT FROM MODE ONE,MD1,,"1,000.00","20.00"',
    '11/08/2026,CASH DEPOSIT MODE TWO,MD2,,"2,000.00","21.00"',
  ]), '2026-08', 'modes.csv');
  const [t1, t2] = await svc.listTransactions(deps.pool, I1, u.id);

  // nothing chosen yet: the guess comes from the narration and is flagged as a guess
  assert.equal(t1.paymentMode, 'OnlineTransfer');
  assert.equal(t1.paymentModeGuessed, true);
  assert.equal(t2.paymentMode, 'BankDeposit');
  assert.equal(t2.paymentModeGuessed, true);
  assert.equal((await deps.pool.query(`SELECT payment_mode FROM bank_statement_transactions WHERE id = $1`, [t1.id])).rows[0].payment_mode, null);

  // the operator's choice is saved on the row and logged
  const changed = await svc.setPaymentMode(deps, I1, actor, t2.id, 'OnlineTransfer');
  assert.equal(changed.paymentMode, 'OnlineTransfer');
  assert.equal(changed.paymentModeGuessed, false);
  assert.equal((await deps.pool.query(`SELECT payment_mode FROM bank_statement_transactions WHERE id = $1`, [t2.id])).rows[0].payment_mode, 'OnlineTransfer');
  const ev = await deps.pool.query(`SELECT detail FROM bank_statement_events WHERE txn_id = $1 AND action = 'payment_mode'`, [t2.id]);
  assert.deepEqual(ev.rows[0].detail, { from: 'BankDeposit', to: 'OnlineTransfer' });
  // a choice survives un-assigning and re-assigning
  await svc.assignStudent(deps, I1, actor, t2.id, 'sM2');
  await svc.unassignStudent(deps, I1, actor, t2.id);
  assert.equal((await svc.listTransactions(deps.pool, I1, u.id)).find((t: any) => t.id === t2.id).paymentMode, 'OnlineTransfer');
  // and the operator can pick the first row's method explicitly the other way
  await svc.setPaymentMode(deps, I1, actor, t1.id, 'BankDeposit');

  await assert.rejects(() => svc.setPaymentMode(deps, I1, actor, t1.id, 'Cheque'), (e: any) => e.httpStatus === 400);
  await assert.rejects(() => svc.setPaymentMode(deps, I2, actor, t1.id, 'BankDeposit'), (e: any) => e.httpStatus === 404); // another school

  await svc.assignStudent(deps, I1, actor, t1.id, 'sM1');
  await svc.assignStudent(deps, I1, actor, t2.id, 'sM2');
  // the preview's totals summarise without listing students
  const pv = await svc.previewApply(deps.pool, I1, u.id);
  assert.deepEqual(pv.totals, { duesTotal: 3000, fineTotal: 0, fineCount: 0, excessTotal: 0, excessCount: 0, partialCount: 0 });
  assert.deepEqual(pv.rows.map((r: any) => r.paymentMode).sort(), ['BankDeposit', 'OnlineTransfer']);

  const res = await svc.applyAssigned(deps, I1, actor, u.id);
  assert.equal(res.appliedCount, 2);
  const modes = (await deps.pool.query(`SELECT student_id, payment_mode FROM transactions WHERE student_id IN ('sM1','sM2') ORDER BY student_id`)).rows;
  assert.deepEqual(modes.map((m: any) => [m.student_id, m.payment_mode]), [['sM1', 'BankDeposit'], ['sM2', 'OnlineTransfer']]);

  // once posted the method can no longer be changed, and the posted row reports the method actually used
  await assert.rejects(() => svc.setPaymentMode(deps, I1, actor, t1.id, 'OnlineTransfer'), (e: any) => e.httpStatus === 409);
  const posted = await svc.listTransactions(deps.pool, I1, u.id, { status: 'applied' });
  assert.deepEqual(posted.map((t: any) => [t.studentId, t.paymentMode]).sort(), [['sM1', 'BankDeposit'], ['sM2', 'OnlineTransfer']]);
  await svc.deleteUpload(deps, I1, u.id);
});

test('payment method cannot be changed in a locked month', T, async () => {
  const u = await up(csv(['12/08/2026,CASH DEPOSIT LOCKED MODE,LM1,,"333.00","22.00"']), '2026-08', 'modes-lock.csv');
  const [t] = await svc.listTransactions(deps.pool, I1, u.id);
  await deps.pool.query(`INSERT INTO locked_months (institution_id, month) VALUES ($1,'2026-08') ON CONFLICT DO NOTHING`, [I1]);
  try {
    await assert.rejects(() => svc.setPaymentMode(deps, I1, actor, t.id, 'OnlineTransfer'), (e: any) => e.httpStatus === 423);
  } finally {
    await deps.pool.query(`DELETE FROM locked_months WHERE institution_id = $1`, [I1]);
  }
  await svc.deleteUpload(deps, I1, u.id);
});

test('preview totals count late fines, advance credit and partial payments', T, async () => {
  await mkStudent('sM3', 'R43'); await mkStudent('sM4', 'R44');
  await mkVoucher('vM3-aug', 'sM3', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 1000 }]);
  await mkVoucher('vM4-aug', 'sM4', '2026-08', [{ kind: 'Tuition', label: 'Tuition', amount: 1000 }]);
  const u = await up(csv([
    '13/08/2026,CASH DEPOSIT OVER,OV1,,"1,300.00","23.00"',
    '13/08/2026,CASH DEPOSIT PARTIAL,PT1,,"400.00","24.00"',
  ]), '2026-08', 'totals.csv');
  const [a, b] = await svc.listTransactions(deps.pool, I1, u.id);
  await svc.assignStudent(deps, I1, actor, a.id, 'sM3');
  await svc.assignStudent(deps, I1, actor, b.id, 'sM4');
  const pv = await svc.previewApply(deps.pool, I1, u.id);
  assert.equal(pv.totals.excessCount, 1);
  assert.equal(pv.totals.excessTotal, 300);
  assert.equal(pv.totals.partialCount, 1);
  assert.equal(pv.totals.duesTotal, 1400);
  await svc.deleteUpload(deps, I1, u.id);
});
