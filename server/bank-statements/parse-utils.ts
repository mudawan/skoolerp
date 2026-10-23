// Small, dependency-free parsing helpers shared by every statement adapter.

/**
 * Parses a money cell: "1,234.50", "1.234,50", "(500.00)", "-500", "500.00 CR", "Rs. 2,000".
 * Returns null when the text holds no number. A trailing DR/CR marker or brackets set the sign
 * only through `sign` — the amount itself is always returned positive.
 */
export function parseAmount(text: string | number | null | undefined): { value: number; sign: 'cr' | 'dr' | null } | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') {
    if (!Number.isFinite(text)) return null;
    return { value: Math.abs(text), sign: text < 0 ? 'dr' : null };
  }
  let s = String(text).trim();
  if (!s) return null;
  let sign: 'cr' | 'dr' | null = null;
  const marker = s.match(/\b(CR|DR)\.?\s*$/i) || s.match(/^(CR|DR)\.?\s+/i);
  if (marker) {
    sign = marker[1].toUpperCase() === 'CR' ? 'cr' : 'dr';
    s = s.replace(marker[0], ' ');
  }
  if (/^\(.*\)$/.test(s.trim()) || /^-/.test(s.trim()) || /-\s*$/.test(s.trim())) {
    sign = sign || 'dr';
  }
  s = s.replace(/[^\d.,]/g, '');
  // Stray punctuation from a currency prefix ("Rs. 2,000" leaves ". 2,000") must not read as a decimal point.
  s = s.replace(/^[.,]+/, '').replace(/[.,]+$/, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Only commas: "1,234" / "1,234,567" are thousands; "12,50" is a decimal comma.
    const after = s.length - lastComma - 1;
    const commas = (s.match(/,/g) || []).length;
    s = after === 3 || commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    // "1.234.567" has several dots: thousands.
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return { value, sign };
}

/** True for a money-looking cell such as "12,500.00" or "(400.00)" or "1,200.00 CR". */
export const AMOUNT_CELL_RE = /^\(?-?\s*(?:rs\.?|pkr|usd|\$)?\s*\d[\d,]*(?:\.\d{1,2})?\)?(?:\s*(?:CR|DR)\.?)?$/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export type DateOrder = 'DMY' | 'MDY';

/**
 * Parses the date formats banks use into YYYY-MM-DD: 2026-09-14, 14/09/2026, 14-09-26,
 * 14-Sep-2026, 14 September 2026, Sep 14, 2026, and Excel serial numbers / Date objects.
 * Numeric day/month are read day-first unless `order` says otherwise (or one side is > 12).
 */
export function parseDate(input: string | number | Date | null | undefined, order: DateOrder = 'DMY'): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return validYmd(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === 'number') {
    // Excel serial date (1900 system): 25569 = 1970-01-01.
    if (input > 20000 && input < 80000) {
      const d = new Date(Math.round((input - 25569) * 86400 * 1000));
      return validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  const s = String(input).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]*(\d{2,4})(?:\s.*)?$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return validYmd(fullYear(+m[3]), mon, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return validYmd(fullYear(+m[3]), mon, +m[2]);
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    const y = fullYear(+m[3]);
    let day = order === 'DMY' ? a : b;
    let mon = order === 'DMY' ? b : a;
    if (mon > 12 && day <= 12) [day, mon] = [mon, day];
    return validYmd(y, mon, day);
  }
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return order === 'DMY' ? validYmd(+m[3], +m[2], +m[1]) : validYmd(+m[3], +m[1], +m[2]);
  return null;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Matches a date at the START of a text cell and reports how much text it used. */
export const LEADING_DATE_RE =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/. ][A-Za-z]{3,9}[-/. ,]*\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4})(?=\s|$)/;

/** Uppercases and collapses every run of non-alphanumerics to one space. */
export function normalizeText(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export const toMinor = (n: number): number => Math.round(n * 100);

/** Strips the file extension and lowercases it ("Stmt.PDF" -> "pdf"). */
export function fileExt(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}
