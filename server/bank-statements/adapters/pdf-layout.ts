// Turns the positioned text of a bank-statement PDF into credit transactions.
// Pure functions over plain data, so the logic is tested without needing a PDF file.

import type { ParsedStatement, ParsedTransaction } from '../types';
import { AdapterError } from '../types';
import { AMOUNT_CELL_RE, LEADING_DATE_RE, parseAmount, parseDate } from '../parse-utils';

export interface LayoutCell {
  x0: number;
  x1: number;
  text: string;
}

/** One visual line of a page. `y` grows UPWARD (PDF coordinates): the top of a page has the largest y. */
export interface LayoutLine {
  page: number;
  y: number;
  cells: LayoutCell[];
}

type Role = 'date' | 'description' | 'credit' | 'debit' | 'amount' | 'balance' | 'reference';

interface HeaderCol {
  role: Role;
  x0: number;
  x1: number;
}

const HEADER_TESTS: Array<[Role, RegExp]> = [
  ['description', /narration|description|particular|details|remarks/],
  ['balance', /balance/],
  ['credit', /\b(credit|credits|deposit|deposits|cr|money in|paid in)\b(?!\s*card)/],
  ['debit', /\b(debit|debits|withdrawal|withdrawals|dr|money out|paid out)\b/],
  ['reference', /\b(ref|cheque|chq|instrument|utr)\b/],
  ['date', /\bdate\b/],
  ['amount', /\bamount\b/],
];

const NON_TX_LINE =
  /^(page\s+\d+|opening balance|closing balance|balance (brought|carried)|brought forward|carried forward|total\b|grand total|statement (period|of account|date)|this is a computer|printed on|generated on)/i;
const OPENING_LINE = /opening|brought forward|b\/f|balance forward/i;

const cx = (c: { x0: number; x1: number }) => (c.x0 + c.x1) / 2;
const lineText = (l: LayoutLine) => l.cells.map((c) => c.text).join(' ');

function classifyHeaderCells(cells: LayoutCell[]): HeaderCol[] {
  const cols: HeaderCol[] = [];
  const used = new Set<Role>();
  for (const cell of cells) {
    const label = cell.text.toLowerCase();
    for (const [role, re] of HEADER_TESTS) {
      if (used.has(role)) continue;
      if (role === 'date' && /value/.test(label)) continue;
      if (re.test(label)) {
        cols.push({ role, x0: cell.x0, x1: cell.x1 });
        used.add(role);
        break;
      }
    }
  }
  return cols;
}

const isHeader = (cols: HeaderCol[]) =>
  cols.some((c) => c.role === 'date') && cols.some((c) => c.role === 'credit' || c.role === 'amount') && cols.length >= 3;

/** Merges a wrapped two-line heading ("Transaction" over "Date") into one line of cells. */
function mergeLines(a: LayoutLine, b: LayoutLine): LayoutCell[] {
  const merged = a.cells.map((c) => ({ ...c }));
  for (const cell of b.cells) {
    const target = merged.find((m) => cx(cell) >= m.x0 - 6 && cx(cell) <= m.x1 + 6);
    if (target) {
      target.text = `${target.text} ${cell.text}`;
      target.x0 = Math.min(target.x0, cell.x0);
      target.x1 = Math.max(target.x1, cell.x1);
    } else merged.push({ ...cell });
  }
  return merged.sort((p, q) => p.x0 - q.x0);
}

function findHeader(lines: LayoutLine[]): { index: number; span: number; cols: HeaderCol[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const single = classifyHeaderCells(lines[i].cells);
    if (isHeader(single)) return { index: i, span: 1, cols: single };
    const next = lines[i + 1];
    if (next && next.page === lines[i].page && lines[i].y - next.y < 22) {
      const both = classifyHeaderCells(mergeLines(lines[i], next));
      if (isHeader(both)) return { index: i, span: 2, cols: both };
    }
  }
  return null;
}

interface RawRow {
  rowIndex: number;
  date: string;
  description: string;
  reference?: string;
  credit?: number;
  debit?: number;
  amount?: number;
  amountSign?: 'cr' | 'dr' | null;
  balance?: number;
  /** An "Opening/Brought forward balance" line: no transaction, but the balance reference for the next row. */
  opening?: boolean;
  raw: Record<string, unknown>;
}

function medianGap(lines: LayoutLine[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].page === lines[i - 1].page) {
      const g = lines[i - 1].y - lines[i].y;
      if (g > 0.5) gaps.push(g);
    }
  }
  if (gaps.length === 0) return 12;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function findAccountNumber(lines: LayoutLine[]): string | undefined {
  for (const l of lines) {
    const m = lineText(l).match(/(?:account|a\/c|acct|iban)[^A-Za-z0-9]*(?:no\.?|number|#)?[^A-Za-z0-9]*([A-Z]{0,2}[0-9][A-Z0-9-]{6,33})/i);
    if (m) return m[1];
  }
  return undefined;
}

/** Column-aware pass: every transaction line is split by the header's column positions. */
function collectWithColumns(lines: LayoutLine[], header: { index: number; span: number; cols: HeaderCol[] }) {
  const cols = header.cols;
  const numericCols = cols.filter((c) => c.role === 'credit' || c.role === 'debit' || c.role === 'amount' || c.role === 'balance');
  const descCol = cols.find((c) => c.role === 'description');
  const refCol = cols.find((c) => c.role === 'reference');
  const dateCol = cols.find((c) => c.role === 'date');
  const firstNumericX0 = Math.min(...numericCols.map((c) => c.x0));
  const typical = medianGap(lines.slice(header.index + header.span));

  const rows: RawRow[] = [];
  const warnings: string[] = [];
  let unreadable = 0;
  let current: RawRow | null = null;
  let prevLine: LayoutLine | null = null;

  const closeToNumeric = (cell: LayoutCell): HeaderCol | null => {
    let best: HeaderCol | null = null;
    let bestDist = Infinity;
    for (const col of numericCols) {
      const d = Math.min(Math.abs(cx(cell) - cx(col)), Math.abs(cell.x1 - col.x1), Math.abs(cell.x0 - col.x0));
      if (d < bestDist) {
        bestDist = d;
        best = col;
      }
    }
    const limit = best ? Math.max(best.x1 - best.x0, 40) + 12 : 0;
    return best && bestDist <= limit ? best : null;
  };

  for (let li = header.index + header.span; li < lines.length; li++) {
    const line = lines[li];
    const text = lineText(line);

    // A repeated heading on the next page.
    if (isHeader(classifyHeaderCells(line.cells))) {
      current = null;
      prevLine = line;
      continue;
    }
    if (NON_TX_LINE.test(text.trim())) {
      current = null;
      prevLine = line;
      continue;
    }

    const first = line.cells[0];
    const dateMatch = first ? LEADING_DATE_RE.exec(first.text) : null;
    const date = dateMatch ? parseDate(dateMatch[0]) : null;
    // The date must sit in (or left of) the description column, not in the money columns.
    const dateOk = !!date && (!dateCol || first.x0 < firstNumericX0 - 5);

    if (dateOk) {
      const row: RawRow = {
        rowIndex: rows.length + 1,
        date: date as string,
        description: '',
        raw: { line: text, page: line.page },
      };
      const descParts: string[] = [];
      const leftover = first.text.slice(dateMatch![0].length).trim();
      if (leftover) descParts.push(leftover);
      for (const cell of line.cells.slice(1)) {
        const isMoney = AMOUNT_CELL_RE.test(cell.text.trim());
        const numCol = isMoney ? closeToNumeric(cell) : null;
        if (numCol) {
          const a = parseAmount(cell.text);
          if (!a) continue;
          if (numCol.role === 'credit') row.credit = a.value;
          else if (numCol.role === 'debit') row.debit = a.value;
          else if (numCol.role === 'amount') {
            row.amount = a.value;
            row.amountSign = a.sign;
          } else row.balance = a.sign === 'dr' ? -a.value : a.value;
        } else if (refCol && (!descCol || Math.abs(cell.x0 - refCol.x0) < Math.abs(cell.x0 - descCol.x0))) {
          // Closer to the reference heading than to the narration heading.
          row.reference = [row.reference, cell.text].filter(Boolean).join(' ');
        } else {
          descParts.push(cell.text);
        }
      }
      row.description = descParts.join(' ').replace(/\s+/g, ' ').trim();
      const hasMoney = row.credit !== undefined || row.debit !== undefined || row.amount !== undefined;
      if (!hasMoney) {
        if (row.balance !== undefined && OPENING_LINE.test(row.description)) {
          row.opening = true;
          rows.push(row);
          current = null;
          prevLine = line;
          continue;
        }
        // A dated line with no amount: possibly the amount wrapped onto the next line. Keep it open.
      }
      rows.push(row);
      current = row;
      prevLine = line;
      continue;
    }

    // No date: a wrapped continuation of the previous transaction's narration?
    if (current && prevLine && prevLine.page === line.page) {
      const gap = prevLine.y - line.y;
      const inDescription = line.cells.every((c) => c.x0 < firstNumericX0 - 2 && (!descCol || c.x0 >= descCol.x0 - 14));
      const hasMoneyCell = line.cells.some((c) => AMOUNT_CELL_RE.test(c.text.trim()) && closeToNumeric(c));
      if (gap <= typical * 1.6 && inDescription && !hasMoneyCell) {
        current.description = `${current.description} ${text}`.replace(/\s+/g, ' ').trim();
        prevLine = line;
        continue;
      }
      // An amount that wrapped below its date line.
      if (gap <= typical * 1.6 && hasMoneyCell && current.credit === undefined && current.debit === undefined && current.amount === undefined) {
        for (const cell of line.cells) {
          const numCol = AMOUNT_CELL_RE.test(cell.text.trim()) ? closeToNumeric(cell) : null;
          const a = numCol ? parseAmount(cell.text) : null;
          if (!numCol || !a) continue;
          if (numCol.role === 'credit') current.credit = a.value;
          else if (numCol.role === 'debit') current.debit = a.value;
          else if (numCol.role === 'amount') {
            current.amount = a.value;
            current.amountSign = a.sign;
          } else current.balance = a.sign === 'dr' ? -a.value : a.value;
        }
        prevLine = line;
        continue;
      }
    }
    current = null;
    prevLine = line;
  }
  return { rows, warnings, unreadable };
}

/** No usable header: read each line as text. Dated line + the money figures found in it. */
function collectFromText(lines: LayoutLine[]) {
  const rows: RawRow[] = [];
  const warnings: string[] = [];
  const moneyRe = /\(?-?\d[\d,]*\.\d{2}\)?(?:\s?(?:CR|DR))?/gi;
  let current: RawRow | null = null;
  const typical = medianGap(lines);
  let prev: LayoutLine | null = null;
  for (const line of lines) {
    const text = lineText(line).trim();
    if (NON_TX_LINE.test(text)) {
      current = null;
      prev = line;
      continue;
    }
    const dm = LEADING_DATE_RE.exec(text);
    const date = dm ? parseDate(dm[0]) : null;
    if (dm && date) {
      const rest = text.slice(dm[0].length).trim();
      const figures = rest.match(moneyRe) || [];
      if (figures.length === 0) {
        current = null;
        prev = line;
        continue;
      }
      const firstFigureAt = rest.search(moneyRe);
      const desc = rest.slice(0, firstFigureAt).replace(/\s+/g, ' ').trim();
      const row: RawRow = { rowIndex: rows.length + 1, date, description: desc, raw: { line: text, page: line.page } };
      const parsed = figures.map((f) => parseAmount(f)).filter(Boolean) as Array<{ value: number; sign: 'cr' | 'dr' | null }>;
      if (parsed.length >= 2) {
        const amt = parsed[parsed.length - 2];
        const bal = parsed[parsed.length - 1];
        row.amount = amt.value;
        row.amountSign = amt.sign;
        row.balance = bal.sign === 'dr' ? -bal.value : bal.value;
      } else {
        row.amount = parsed[0].value;
        row.amountSign = parsed[0].sign;
      }
      rows.push(row);
      current = row;
    } else if (current && prev && prev.page === line.page && prev.y - line.y <= typical * 1.6 && !moneyRe.test(text)) {
      moneyRe.lastIndex = 0;
      current.description = `${current.description} ${text}`.replace(/\s+/g, ' ').trim();
    } else {
      current = null;
    }
    moneyRe.lastIndex = 0;
    prev = line;
  }
  if (rows.length > 0) {
    warnings.push('No column headings were found in the PDF, so lines were read as plain text. Check each amount carefully.');
  }
  return { rows, warnings, unreadable: 0 };
}

/** Decides credit/debit for every raw row and builds the final transactions. */
function resolveRows(rows: RawRow[], warnings: string[], unreadableIn: number) {
  const stats = { rowsSeen: rows.filter((r) => !r.opening).length, credits: 0, debitsSkipped: 0, unreadable: unreadableIn };
  const txns: ParsedTransaction[] = [];

  // Statement order, needed to read running-balance arithmetic correctly.
  const dated = rows.filter((r) => r.balance !== undefined);
  const descending = dated.length >= 2 && dated[0].date > dated[dated.length - 1].date;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.opening) continue;
    let credit: number | null = null;

    if (r.credit !== undefined || r.debit !== undefined) {
      if (r.credit !== undefined && r.credit > 0) credit = r.credit;
      else if (r.debit !== undefined && r.debit > 0) {
        stats.debitsSkipped++;
        continue;
      } else continue;
    } else if (r.amount !== undefined) {
      let dir: 'cr' | 'dr' | null = r.amountSign ?? null;
      if (dir === null && r.balance !== undefined) {
        // Compare with the neighbouring line that is earlier in time.
        const prev = descending ? rows[i + 1] : rows[i - 1];
        if (prev && prev.balance !== undefined) {
          const delta = r.balance - prev.balance;
          if (Math.abs(delta - r.amount) < 0.01) dir = 'cr';
          else if (Math.abs(delta + r.amount) < 0.01) dir = 'dr';
        }
      }
      if (dir === null) {
        stats.unreadable++;
        warnings.push(
          `Line ${r.rowIndex} (${r.date}, ${r.amount.toFixed(2)}): could not tell whether this is a credit or a debit — skipped. Add it by hand if it is a payment.`
        );
        continue;
      }
      if (dir === 'dr') {
        stats.debitsSkipped++;
        continue;
      }
      credit = r.amount;
    } else {
      stats.unreadable++;
      warnings.push(`Line ${r.rowIndex} (${r.date}): a dated line with no amount — skipped.`);
      continue;
    }

    const t: ParsedTransaction = {
      date: r.date,
      amount: credit,
      description: r.description,
      rowIndex: r.rowIndex,
      raw: r.raw,
    };
    if (r.reference) t.reference = r.reference;
    if (r.balance !== undefined) t.balance = r.balance;
    txns.push(t);
    stats.credits++;
  }
  return { txns, stats };
}

export function parseLayout(lines: LayoutLine[], adapterId: string, adapterVersion: string): ParsedStatement {
  if (lines.length === 0) {
    throw new AdapterError(
      'The PDF contains no readable text. It may be a scanned image; export the statement as a text PDF, CSV or Excel instead.'
    );
  }
  const header = findHeader(lines);
  const preamble = header ? lines.slice(0, header.index) : lines.slice(0, 25);
  const collected = header ? collectWithColumns(lines, header) : collectFromText(lines);
  if (collected.rows.filter((r) => !r.opening).length === 0) {
    throw new AdapterError('No transaction lines were found in the PDF (no lines starting with a date and an amount).');
  }
  const warnings = [...collected.warnings];
  const { txns, stats } = resolveRows(collected.rows, warnings, collected.unreadable);
  const dates = collected.rows.filter((r) => !r.opening).map((r) => r.date).sort();
  return {
    adapterId,
    adapterVersion,
    accountNumber: findAccountNumber(preamble),
    periodFrom: dates[0],
    periodTo: dates[dates.length - 1],
    transactions: txns,
    warnings,
    stats,
  };
}

/** True when the lines look like a bank statement (used for automatic adapter selection). */
export function layoutConfidence(lines: LayoutLine[]): number {
  if (lines.length === 0) return 0;
  if (findHeader(lines)) return 0.85;
  const dated = lines.filter((l) => LEADING_DATE_RE.test(lineText(l).trim())).length;
  return dated >= 3 ? 0.4 : 0.05;
}
