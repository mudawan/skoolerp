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

test('upload stages only credits; re-upload and overlap add nothing already known', T, async () => {
  const a = await up(csv([
    '01/09/2026,IBFT FROM ALI KHAN,REF1,,"5,000.00","105,000.00"',
    '02/09/2026,ATM WITHDRAWAL,,"2,000.00",,"103,000.00"',
    '02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"',
  ]));
  assert.equal(a.parseStatus, 'parsed');
  assert.equal(a.newCount, 2);
  assert.equal(a.counts.pending, 2);

  const again = await up(csv([
    '01/09/2026,IBFT FROM ALI KHAN,REF1,,"5,000.00","105,000.00"',
    '02/09/2026,ATM WITHDRAWAL,,"2,000.00",,"103,000.00"',
    '02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.00","115,500.00"',
  ]));
  assert.equal(again.exactDuplicateOf, a.id);
  assert.equal(again.newCount, 0);
  assert.equal(again.duplicateCount, 2);
  assert.equal(again.counts.pending, 0);

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
  const again = await up(csv(['15/09/2026,SOMETHING ELSE,FT600,,"50.00","1.00"']), '2026-09', 'ign2.csv');
  assert.equal(again.newCount, 0);
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
