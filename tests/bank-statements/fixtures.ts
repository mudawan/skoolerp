// Builds synthetic bank-statement PDFs with jsPDF so the PDF adapter can be tested end to end.
// These are invented layouts, NOT any real bank's format.
import { jsPDF } from 'jspdf';

export interface FixtureRow {
  date: string;
  desc: string | string[]; // an array = narration wrapped over several lines
  ref?: string;
  debit?: string;
  credit?: string;
  amount?: string; // for the single-amount layout
  balance?: string;
}

const money = (s: string) => s;

/** Layout A: separate Withdrawal / Deposit / Balance columns, repeated heading per page. */
export function layoutA(rows: FixtureRow[], opts: { rowsPerPage?: number } = {}): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const perPage = opts.rowsPerPage ?? 30;
  const cols = { date: 40, desc: 120, ref: 300, debit: 430, credit: 490, balance: 555 };
  let page = 0;
  let y = 0;
  const drawHeader = () => {
    doc.setFontSize(14);
    doc.text('Example Bank Ltd', 40, 40);
    doc.setFontSize(9);
    doc.text('Account Number: 0123456789012', 40, 60);
    doc.text('Statement period 01-Sep-2026 to 30-Sep-2026', 40, 72);
    doc.setFontSize(9);
    y = 100;
    doc.text('Date', cols.date, y);
    doc.text('Transaction Details', cols.desc, y);
    doc.text('Chq/Ref No', cols.ref, y);
    doc.text('Withdrawal', cols.debit, y, { align: 'right' });
    doc.text('Deposit', cols.credit, y, { align: 'right' });
    doc.text('Balance', cols.balance, y, { align: 'right' });
    y += 16;
  };
  drawHeader();
  let onPage = 0;
  for (const r of rows) {
    if (onPage >= perPage) {
      doc.addPage();
      page++;
      drawHeader();
      onPage = 0;
    }
    doc.text(r.date, cols.date, y);
    const lines = Array.isArray(r.desc) ? r.desc : [r.desc];
    doc.text(lines[0], cols.desc, y);
    if (r.ref) doc.text(r.ref, cols.ref, y);
    if (r.debit) doc.text(money(r.debit), cols.debit, y, { align: 'right' });
    if (r.credit) doc.text(money(r.credit), cols.credit, y, { align: 'right' });
    if (r.balance) doc.text(money(r.balance), cols.balance, y, { align: 'right' });
    y += 12;
    for (const extra of lines.slice(1)) {
      doc.text(extra, cols.desc, y);
      y += 12;
    }
    y += 4;
    onPage++;
  }
  doc.setFontSize(8);
  doc.text('This is a computer generated statement and needs no signature.', 40, 800);
  void page;
  return Buffer.from(doc.output('arraybuffer'));
}

/** Layout B: one Amount column (no Dr/Cr marker) plus Balance — direction only from the balance arithmetic. */
export function layoutB(rows: FixtureRow[]): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const cols = { date: 40, desc: 130, amount: 470, balance: 555 };
  doc.setFontSize(9);
  doc.text('A/C No: PK36EXMP0000001234567', 40, 50);
  let y = 90;
  doc.text('Date', cols.date, y);
  doc.text('Narration', cols.desc, y);
  doc.text('Amount', cols.amount, y, { align: 'right' });
  doc.text('Balance', cols.balance, y, { align: 'right' });
  y += 16;
  for (const r of rows) {
    doc.text(r.date, cols.date, y);
    doc.text(Array.isArray(r.desc) ? r.desc[0] : r.desc, cols.desc, y);
    if (r.amount) doc.text(r.amount, cols.amount, y, { align: 'right' });
    if (r.balance) doc.text(r.balance, cols.balance, y, { align: 'right' });
    y += 16;
  }
  return Buffer.from(doc.output('arraybuffer'));
}

/** Layout C: no column headings at all, plain "date narration amount balance CR/DR" lines. */
export function layoutC(lines: string[]): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(9);
  let y = 60;
  for (const l of lines) {
    doc.text(l, 40, y);
    y += 14;
  }
  return Buffer.from(doc.output('arraybuffer'));
}
