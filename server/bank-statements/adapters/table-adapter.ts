import ExcelJS from 'exceljs';
import { parseCsvLine, detectCsvDelimiter, stripBom } from '../../../src/utils/csv';
import { AdapterError, type ParsedStatement, type ParsedTransaction, type StatementAdapter, type StatementInput } from '../types';
import { fileExt, parseAmount, parseDate } from '../parse-utils';

type Cell = unknown;
type Role = 'date' | 'description' | 'credit' | 'debit' | 'amount' | 'type' | 'balance' | 'reference';
type ColumnMap = Partial<Record<Role, number>>;

const clean = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join('').replace(/\s+/g, ' ').trim();
    if (o.result !== undefined) return clean(o.result);
    if (o.text !== undefined) return clean(o.text);
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
};

// Role priority matters: a column is claimed by the first role that fits it.
const ROLE_TESTS: Array<[Role, RegExp]> = [
  ['description', /(narration|description|particular|details?|remarks?)/],
  ['balance', /balance/],
  ['type', /^(dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|credit ?\/ ?debit|txn type|trans(action)? type|type|cr ?dr)$/],
  ['credit', /^(credit|credits|deposit|deposits|cr|money in|paid in|amount credited|credit amount|received)$/],
  ['debit', /^(debit|debits|withdrawal|withdrawals|dr|money out|paid out|amount debited|debit amount)$/],
  ['amount', /^(txn |trans(action)? )?amount$/],
  ['reference', /(ref|cheque|chq|instrument|utr|txn id|trans(action)? id|trace|stan|voucher|serial)/],
  ['date', /date/],
];

function mapHeader(cells: Cell[]): ColumnMap {
  const map: ColumnMap = {};
  const taken = new Set<number>();
  const labels = cells.map((c) => clean(c).toLowerCase());
  for (const [role, re] of ROLE_TESTS) {
    if (role === 'date') {
      // Prefer the transaction/posting date over a "value date" column.
      const idx = labels.findIndex((l, i) => !taken.has(i) && re.test(l) && !/value/.test(l));
      const fallback = labels.findIndex((l, i) => !taken.has(i) && re.test(l));
      const pick = idx >= 0 ? idx : fallback;
      if (pick >= 0) {
        map.date = pick;
        taken.add(pick);
      }
      continue;
    }
    const idx = labels.findIndex((l, i) => !taken.has(i) && l !== '' && re.test(l));
    if (idx >= 0) {
      map[role] = idx;
      taken.add(idx);
    }
  }
  return map;
}

/** A header row has a date column and a way to tell credits (credit column, or amount column). */
function isUsableHeader(m: ColumnMap): boolean {
  return m.date !== undefined && (m.credit !== undefined || m.amount !== undefined);
}

export function findHeader(rows: Cell[][]): { index: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const map = mapHeader(rows[i] || []);
    if (isUsableHeader(map)) return { index: i, map };
  }
  return null;
}

function findAccountNumber(rows: Cell[][], headerIndex: number): string | undefined {
  for (let i = 0; i < Math.min(headerIndex, 30); i++) {
    const line = (rows[i] || []).map(clean).join(' ');
    const m = line.match(/(?:account|a\/c|acct|iban)[^A-Za-z0-9]*(?:no\.?|number|#)?[^A-Za-z0-9]*([A-Z]{0,2}[0-9][A-Z0-9-]{6,33})/i);
    if (m) return m[1];
  }
  return undefined;
}

export interface TableParseOptions {
  adapterId: string;
  adapterVersion: string;
}

/** Turns rows of cells (from a CSV or a worksheet) into a ParsedStatement. */
export function parseTable(rows: Cell[][], opts: TableParseOptions): ParsedStatement {
  const header = findHeader(rows);
  if (!header) {
    throw new AdapterError(
      'Could not find the column headings. The sheet needs at least a Date column and a Credit (or Amount) column.'
    );
  }
  const { index: headerIndex, map } = header;
  const warnings: string[] = [];
  const stats = { rowsSeen: 0, credits: 0, debitsSkipped: 0, unreadable: 0 };
  const txns: ParsedTransaction[] = [];
  const allDates: string[] = [];
  let assumedDirection = 0;

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => clean(c) === '')) continue;
    const at = (role: Role): Cell => (map[role] === undefined ? undefined : row[map[role] as number]);

    const rawDate = at('date');
    const date = parseDate(rawDate instanceof Date ? rawDate : (typeof rawDate === 'number' ? rawDate : clean(rawDate)));
    if (!date) {
      const hasMoney = ['credit', 'debit', 'amount'].some((k) => parseAmount(clean(at(k as Role))) !== null);
      if (hasMoney && !/total|balance|opening|closing|brought|carried/i.test(row.map(clean).join(' '))) {
        stats.unreadable++;
        warnings.push(`Row ${r + 1}: has an amount but no readable date — skipped.`);
      }
      continue;
    }
    stats.rowsSeen++;
    allDates.push(date);

    let credit: number | null = null;
    const typeText = clean(at('type')).toUpperCase();

    if (map.credit !== undefined) {
      const c = parseAmount(typeof at('credit') === 'number' ? (at('credit') as number) : clean(at('credit')));
      const d = map.debit !== undefined ? parseAmount(typeof at('debit') === 'number' ? (at('debit') as number) : clean(at('debit'))) : null;
      if (c && c.value > 0) credit = c.value;
      else if (d && d.value > 0) stats.debitsSkipped++;
      else continue; // a line with no money at all (carry-forward text etc.)
    } else {
      const a = parseAmount(typeof at('amount') === 'number' ? (at('amount') as number) : clean(at('amount')));
      if (!a || a.value === 0) continue;
      let direction: 'cr' | 'dr' | null = a.sign;
      if (typeText) {
        if (/^(CR|CREDIT|C)$/.test(typeText) || /CREDIT/.test(typeText)) direction = 'cr';
        else if (/^(DR|DEBIT|D)$/.test(typeText) || /DEBIT/.test(typeText)) direction = 'dr';
      }
      if (direction === null) {
        direction = 'cr';
        assumedDirection++;
      }
      if (direction === 'cr') credit = a.value;
      else stats.debitsSkipped++;
    }
    if (credit === null) continue;

    const description = clean(at('description'));
    const reference = clean(at('reference'));
    const bal = parseAmount(typeof at('balance') === 'number' ? (at('balance') as number) : clean(at('balance')));
    const t: ParsedTransaction = {
      date,
      amount: credit,
      description,
      rowIndex: r + 1,
      raw: Object.fromEntries(row.map((c, i) => [String(i), clean(c)])),
    };
    if (reference) t.reference = reference;
    if (bal) t.balance = bal.sign === 'dr' ? -bal.value : bal.value;
    txns.push(t);
    stats.credits++;
  }

  if (assumedDirection > 0) {
    warnings.push(
      `${assumedDirection} row(s) had an Amount column with no Dr/Cr marker or sign; they were treated as credits. Check them before applying.`
    );
  }
  allDates.sort();
  return {
    adapterId: opts.adapterId,
    adapterVersion: opts.adapterVersion,
    accountNumber: findAccountNumber(rows, headerIndex),
    periodFrom: allDates[0],
    periodTo: allDates[allDates.length - 1],
    transactions: txns,
    warnings,
    stats,
  };
}

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

export function csvToRows(buffer: Buffer): string[][] {
  const text = stripBom(buffer.toString('utf8'));
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== '') || '';
  const delimiter = detectCsvDelimiter(first);
  return lines.map((l) => (l.trim() === '' ? [] : parseCsvLine(l, [delimiter])));
}

export const genericCsvAdapter: StatementAdapter = {
  id: 'generic-csv',
  version: '1.0.0',
  label: 'Generic CSV statement',
  formats: ['csv'],
  async detect(input: StatementInput): Promise<number> {
    const ext = fileExt(input.filename);
    if (ext !== 'csv' && ext !== 'txt' && !/csv|text\/plain/i.test(input.mimeType || '')) return 0;
    try {
      return findHeader(csvToRows(input.buffer)) ? 0.9 : 0.2;
    } catch {
      return 0.1;
    }
  },
  async parse(input: StatementInput): Promise<ParsedStatement> {
    return parseTable(csvToRows(input.buffer), { adapterId: this.id, adapterVersion: this.version });
  },
};

// ---------------------------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------------------------

async function worksheetsToRows(buffer: Buffer): Promise<Cell[][][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch (err: any) {
    throw new AdapterError(`The Excel file could not be opened (${err?.message || 'unreadable'}). Only .xlsx is supported.`);
  }
  const out: Cell[][][] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cell.value;
      });
      rows[rowNumber - 1] = cells;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push(rows);
  });
  return out;
}

export const genericXlsxAdapter: StatementAdapter = {
  id: 'generic-xlsx',
  version: '1.0.0',
  label: 'Generic Excel statement',
  formats: ['xlsx'],
  async detect(input: StatementInput): Promise<number> {
    const isZip = input.buffer.length > 4 && input.buffer[0] === 0x50 && input.buffer[1] === 0x4b;
    if (!isZip) return 0;
    return fileExt(input.filename) === 'xlsx' ? 0.8 : 0.3;
  },
  async parse(input: StatementInput): Promise<ParsedStatement> {
    const sheets = await worksheetsToRows(input.buffer);
    for (const rows of sheets) {
      if (findHeader(rows)) return parseTable(rows, { adapterId: this.id, adapterVersion: this.version });
    }
    throw new AdapterError(
      'No worksheet has recognisable column headings (a Date column and a Credit or Amount column).'
    );
  },
};
