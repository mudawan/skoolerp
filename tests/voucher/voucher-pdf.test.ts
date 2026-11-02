import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// jsPDF's ESM default export does not load under node:test, so bundle the generator with its ES build first.
const out = join(mkdtempSync(join(tmpdir(), 'vpdf-')), 'pdfgen.cjs');
execFileSync('npx', ['esbuild', 'src/utils/pdfGenerator.ts', '--bundle', '--platform=node', '--format=cjs',
  '--alias:jspdf=./node_modules/jspdf/dist/jspdf.es.js', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' });
const { buildVoucherPdf } = createRequire(import.meta.url)(out);
import { formatLineItemAmount } from '../../src/utils/voucherTheme';

const voucher: any = {
  id: 'v1', voucherNo: 'V-0001', studentId: 's1', classId: 'c1', month: '2026-10',
  issueDate: '2026-10-01', dueDate: '2026-10-10', netDue: 12300, roundingMultiple: 10,
  particulars: [
    { kind: 'Tuition', label: 'Tuition Fee', amount: 12000 },
    { kind: 'Transport', label: 'Transport Fee', amount: 1500 },
    { kind: 'Discount', label: 'Discount in Fee', amount: -1200 },
  ],
};
const context: any = {
  institute: { name: 'Test School', address: '1 Main Rd', logoUrl: '' },
  bankAccounts: [{ active: true, isDefault: true, bankName: 'HBL', accountNumber: '123', title: 'Test School', instructionsLtr: 'Pay at any branch' }],
  students: [{ id: 's1', name: 'Ali Khan', fatherName: 'Khan Sr', regNo: 'R-77' }],
  classes: [{ id: 'c1', name: 'Class 5' }],
};

test('line item formatter keeps sign, no currency', () => {
  assert.equal(formatLineItemAmount(-1200), '-1,200');
  assert.equal(formatLineItemAmount(12000), '12,000');
});

test('voucher PDF is monochrome and has the required rows', () => {
  const doc = buildVoucherPdf(voucher, context);
  const raw = doc.output() as string;
  // colour operators: only grey/black (r==g==b)
  const colours = [...raw.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)\b/g)];
  assert.ok(/ (g|G)\b/.test(raw), 'expected grey operators');
  assert.equal(colours.length, 0, 'no coloured rg/RG operators expected');
  for (const m of colours) assert.ok(m[1] === m[2] && m[2] === m[3], `non-grey colour ${m[0]}`);
  const text = raw;
  for (const t of ['BANK COPY', 'INSTITUTE COPY', 'STUDENT COPY', 'Student Name:', 'Father Name:', 'Registration No:', 'Class:', '-1,200', 'Amount ']) {
    assert.match(text, new RegExp(t.replace('(', '\\(')), t);
  }
  // order of student rows
  const i = ['Student Name:', 'Father Name:', 'Registration No:', 'Class:'].map((t) => text.indexOf(t));
  assert.deepEqual(i, [...i].sort((a, b) => a - b));
  // currency code only in header, net due, payable rows => exactly 3 per copy
  const code = 'USD';
  const n = (text.match(new RegExp(code, 'g')) || []).length;
  assert.equal(n, 9, `currency occurrences ${n}`);
  assert.ok(!/\(\s*-?USD 1,200|USD -1,200|USD 12,000/.test(text));
});
