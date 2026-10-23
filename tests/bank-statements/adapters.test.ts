import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseDate } from '../../server/bank-statements/parse-utils';
import { fingerprintAll } from '../../server/bank-statements/fingerprint';
import { genericCsvAdapter, genericXlsxAdapter } from '../../server/bank-statements/adapters/table-adapter';
import { genericPdfAdapter } from '../../server/bank-statements/adapters/pdf-adapter';
import { selectAdapter } from '../../server/bank-statements/adapters/registry';
import { AdapterError } from '../../server/bank-statements/types';
import { layoutA, layoutB, layoutC } from './fixtures';
import ExcelJS from 'exceljs';

const input = (filename: string, buffer: Buffer) => ({ filename, buffer });
const ctx = { feeMonth: '2026-09' };

// ---------------------------------------------------------------------------------------------
test('parseAmount reads the money formats banks print', () => {
  assert.deepEqual(parseAmount('1,234.50'), { value: 1234.5, sign: null });
  assert.deepEqual(parseAmount('1.234,50'), { value: 1234.5, sign: null });
  assert.deepEqual(parseAmount('12,500'), { value: 12500, sign: null });
  assert.deepEqual(parseAmount('12,50'), { value: 12.5, sign: null });
  assert.deepEqual(parseAmount('1,200,000'), { value: 1200000, sign: null });
  assert.deepEqual(parseAmount('(500.00)'), { value: 500, sign: 'dr' });
  assert.deepEqual(parseAmount('-500'), { value: 500, sign: 'dr' });
  assert.deepEqual(parseAmount('2,000.00 CR'), { value: 2000, sign: 'cr' });
  assert.deepEqual(parseAmount('Rs. 2,000'), { value: 2000, sign: null });
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('parseDate reads the date formats banks print', () => {
  assert.equal(parseDate('2026-09-14'), '2026-09-14');
  assert.equal(parseDate('14/09/2026'), '2026-09-14');
  assert.equal(parseDate('14-09-26'), '2026-09-14');
  assert.equal(parseDate('14-Sep-2026'), '2026-09-14');
  assert.equal(parseDate('14 September 2026'), '2026-09-14');
  assert.equal(parseDate('Sep 14, 2026'), '2026-09-14');
  assert.equal(parseDate('09/14/2026'), '2026-09-14'); // month-first inferred: 14 can't be a month
  assert.equal(parseDate('03/04/2026'), '2026-04-03'); // ambiguous: day-first by default
  assert.equal(parseDate('03/04/2026', 'MDY'), '2026-03-04');
  assert.equal(parseDate(46279), '2026-09-14'); // Excel serial
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('hello'), null);
});

// ---------------------------------------------------------------------------------------------
test('fingerprints are stable, distinguish repeated identical credits, and ignore wrapping/whitespace', () => {
  const base = { date: '2026-09-01', amount: 5000, description: 'IBFT FROM ALI KHAN', rowIndex: 1, raw: {} };
  const a = fingerprintAll('123', [base, { ...base, rowIndex: 2 }]);
  assert.notEqual(a[0].fingerprint, a[1].fingerprint, 'two identical same-day credits must stay distinct');
  const b = fingerprintAll('123', [{ ...base, description: 'ibft   from\nali khan', rowIndex: 9 }]);
  assert.equal(b[0].fingerprint, a[0].fingerprint, 'same transaction, different wrapping/row index → same fingerprint');
  const c = fingerprintAll('999', [base]);
  assert.notEqual(c[0].fingerprint, a[0].fingerprint, 'different account → different fingerprint');
  const d = fingerprintAll('123', [{ ...base, amount: 5000.01 }]);
  assert.notEqual(d[0].fingerprint, a[0].fingerprint);
});

// ---------------------------------------------------------------------------------------------
test('CSV: separate credit/debit columns, preamble, quoted commas, debits skipped', async () => {
  const csv = [
    'Account Number: 0123456789012',
    '',
    'Txn Date,Value Date,Narration,Chq/Ref No,Withdrawal,Deposit,Balance',
    '01/09/2026,01/09/2026,"IBFT FROM ALI KHAN, LAHORE",REF001,,"5,000.00","105,000.00"',
    '02/09/2026,02/09/2026,ATM WITHDRAWAL,,"2,000.00",,"103,000.00"',
    '02/09/2026,02/09/2026,CASH DEPOSIT SARA AHMED,,,"12,500.50","115,500.50"',
    'Total,,,,2000.00,17500.50,',
  ].join('\n');
  const r = await genericCsvAdapter.parse(input('s.csv', Buffer.from(csv)), ctx);
  assert.equal(r.transactions.length, 2);
  assert.equal(r.stats.debitsSkipped, 1);
  assert.equal(r.accountNumber, '0123456789012');
  assert.deepEqual(r.transactions.map((t) => [t.date, t.amount]), [['2026-09-01', 5000], ['2026-09-02', 12500.5]]);
  assert.equal(r.transactions[0].description, 'IBFT FROM ALI KHAN, LAHORE');
  assert.equal(r.transactions[0].reference, 'REF001');
  assert.equal(r.transactions[0].balance, 105000);
  assert.equal(r.periodFrom, '2026-09-01');
  assert.equal(r.periodTo, '2026-09-02');
});

test('CSV: single Amount column with Dr/Cr type column and semicolon delimiter', async () => {
  const csv = ['Date;Description;Amount;Type', '01-Sep-2026;IBFT A;"3,000.00";CR', '01-Sep-2026;CHEQUE;"900.00";DR'].join('\n');
  const r = await genericCsvAdapter.parse(input('s.csv', Buffer.from(csv)), ctx);
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].amount, 3000);
  assert.equal(r.stats.debitsSkipped, 1);
});

test('CSV: signed amounts, no marker → negatives are debits; unmarked positives warn', async () => {
  const csv = ['Date,Details,Amount', '01/09/2026,IN,1500', '01/09/2026,OUT,-200'].join('\n');
  const r = await genericCsvAdapter.parse(input('s.csv', Buffer.from(csv)), ctx);
  assert.equal(r.transactions.length, 1);
  assert.ok(r.warnings.some((w) => /treated as credits/.test(w)));
});

test('CSV: no headings → readable AdapterError', async () => {
  await assert.rejects(
    () => genericCsvAdapter.parse(input('s.csv', Buffer.from('hello,world\n1,2')), ctx),
    (e: any) => e instanceof AdapterError && /column headings/.test(e.message)
  );
});

test('Excel: dates as real dates, amounts as numbers', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Statement');
  ws.addRow(['Bank of Example']);
  ws.addRow(['Date', 'Narration', 'Debit', 'Credit', 'Balance']);
  ws.addRow([new Date(Date.UTC(2026, 8, 3)), 'RAAST FROM USMAN', null, 7500, 107500]);
  ws.addRow([new Date(Date.UTC(2026, 8, 3)), 'FEE', 100, null, 107400]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  assert.ok((await genericXlsxAdapter.detect(input('s.xlsx', buf))) > 0.5);
  const r = await genericXlsxAdapter.parse(input('s.xlsx', buf), ctx);
  assert.equal(r.transactions.length, 1);
  assert.deepEqual([r.transactions[0].date, r.transactions[0].amount, r.transactions[0].balance], ['2026-09-03', 7500, 107500]);
});

// ---------------------------------------------------------------------------------------------
test('PDF layout A: columns, wrapped narration, repeated heading across pages, footer ignored', async () => {
  const rows = [
    { date: '01-Sep-2026', desc: 'Opening Balance', balance: '100,000.00' },
    { date: '01-Sep-2026', desc: ['IBFT FROM MUHAMMAD ALI', 'ACC 0300123 FEE SEPT'], ref: 'FT26244', credit: '5,000.00', balance: '105,000.00' },
    { date: '02-Sep-2026', desc: 'ATM CASH WITHDRAWAL', debit: '2,000.00', balance: '103,000.00' },
    { date: '02-Sep-2026', desc: 'CASH DEPOSIT BY SARA', credit: '12,500.50', balance: '115,500.50' },
    { date: '03-Sep-2026', desc: 'CHEQUE 000123', debit: '700.00', balance: '114,800.50' },
    { date: '04-Sep-2026', desc: 'RAAST FROM USMAN', credit: '7,250.00', balance: '122,050.50' },
  ];
  const pdf = layoutA(rows, { rowsPerPage: 3 }); // forces a page break + repeated heading
  assert.ok((await genericPdfAdapter.detect(input('s.pdf', pdf))) >= 0.8);
  const r = await genericPdfAdapter.parse(input('s.pdf', pdf), ctx);
  assert.deepEqual(
    r.transactions.map((t) => [t.date, t.amount]),
    [['2026-09-01', 5000], ['2026-09-02', 12500.5], ['2026-09-04', 7250]]
  );
  assert.match(r.transactions[0].description, /IBFT FROM MUHAMMAD ALI ACC 0300123 FEE SEPT/);
  assert.equal(r.transactions[0].reference, 'FT26244');
  assert.equal(r.transactions[0].balance, 105000);
  assert.equal(r.stats.debitsSkipped, 2);
  assert.equal(r.accountNumber, '0123456789012');
  assert.ok(!r.transactions.some((t) => /computer generated/.test(t.description)), 'footer must not leak into narration');
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
});

test('PDF layout B: single Amount column, direction from running-balance arithmetic', async () => {
  const rows = [
    { date: '01/09/2026', desc: 'Brought forward', balance: '50,000.00' },
    { date: '01/09/2026', desc: 'ONLINE TRANSFER ZAIN', amount: '4,000.00', balance: '54,000.00' },
    { date: '02/09/2026', desc: 'UTILITY BILL', amount: '1,000.00', balance: '53,000.00' },
    { date: '03/09/2026', desc: 'CASH DEP', amount: '6,000.00', balance: '59,000.00' },
  ];
  const r = await genericPdfAdapter.parse(input('s.pdf', layoutB(rows)), ctx);
  assert.deepEqual(r.transactions.map((t) => t.amount), [4000, 6000]);
  assert.equal(r.stats.debitsSkipped, 1);
  assert.equal(r.accountNumber, 'PK36EXMP0000001234567');
});

test('PDF layout B: amount with no way to tell direction is skipped with a warning, never guessed', async () => {
  const rows = [{ date: '01/09/2026', desc: 'MYSTERY', amount: '4,000.00' }];
  const r = await genericPdfAdapter.parse(input('s.pdf', layoutB(rows)), ctx);
  assert.equal(r.transactions.length, 0);
  assert.equal(r.stats.unreadable, 1);
  assert.ok(r.warnings.some((w) => /credit or a debit/.test(w)));
});

test('PDF layout C: no headings, text mode, CR/DR markers, with a visible warning', async () => {
  const pdf = layoutC([
    '01-Sep-2026 IBFT FROM ALI 5,000.00 CR 105,000.00',
    '02-Sep-2026 ATM WITHDRAWAL 2,000.00 DR 103,000.00',
    '03-Sep-2026 CASH DEPOSIT 1,500.00 CR 104,500.00',
  ]);
  const r = await genericPdfAdapter.parse(input('s.pdf', pdf), ctx);
  assert.deepEqual(r.transactions.map((t) => t.amount), [5000, 1500]);
  assert.ok(r.warnings.some((w) => /plain text/.test(w)));
});

test('PDF: not a PDF / no text → clear errors', async () => {
  await assert.rejects(() => genericPdfAdapter.parse(input('x.pdf', Buffer.from('nope')), ctx), AdapterError);
});

// ---------------------------------------------------------------------------------------------
test('registry picks the right adapter automatically and rejects unknown files', async () => {
  const csv = Buffer.from('Date,Narration,Credit\n01/09/2026,X,100');
  assert.equal((await selectAdapter(input('a.csv', csv))).id, 'generic-csv');
  assert.equal((await selectAdapter(input('a.pdf', layoutA([{ date: '01-Sep-2026', desc: 'X', credit: '1.00', balance: '1.00' }])))).id, 'generic-pdf');
  await assert.rejects(() => selectAdapter(input('a.bin', Buffer.from('zzzz'))), AdapterError);
  assert.equal((await selectAdapter(input('a.csv', csv), 'generic-csv')).id, 'generic-csv');
  await assert.rejects(() => selectAdapter(input('a.csv', csv), 'no-such'), AdapterError);
});
