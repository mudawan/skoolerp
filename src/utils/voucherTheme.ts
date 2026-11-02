/**
 * Single root for the fee-voucher look (econoprint: black on white, light grey fills only).
 * Consumed by the PDF renderer (pdfGenerator.ts) and the on-screen preview (PrintVoucherModal.tsx),
 * so both always match. Change colours / sizes here only.
 */

export type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Colour tokens. Only black, white and one light grey fill are used. */
export const VOUCHER_RGB = {
  ink: [0, 0, 0] as RGB, // all text, borders and rules
  muted: [64, 64, 64] as RGB, // secondary labels (still print-safe, readable)
  fill: [238, 238, 238] as RGB, // light fill: student box, particulars header, net due row
  paper: [255, 255, 255] as RGB,
  border: [205, 205, 205] as RGB, // light neutral-grey border and rules
  tear: [110, 110, 110] as RGB, // tear-off line between copies
  itemRule: [230, 230, 230] as RGB, // line under each line item: half the border's contrast (205 -> 230)
};

export const VOUCHER_HEX = {
  ink: toHex(VOUCHER_RGB.ink),
  muted: toHex(VOUCHER_RGB.muted),
  fill: toHex(VOUCHER_RGB.fill),
  paper: toHex(VOUCHER_RGB.paper),
  border: toHex(VOUCHER_RGB.border),
  tear: toHex(VOUCHER_RGB.tear),
  itemRule: toHex(VOUCHER_RGB.itemRule),
};

/** Type scale (points in the PDF). One family; only three sizes. */
export const VOUCHER_FONT = {
  title: 8.5, // institute name, net due amount
  body: 7, // values, labels, line items, headings
  small: 6, // address, bank instructions, signatures
};

/** Preview equivalents in px (same ratio as the PDF scale). */
export const VOUCHER_FONT_PX = { title: 12, body: 10, small: 8.5 };

/** Line weights (mm in the PDF, px in the preview). */
export const VOUCHER_LINE = { card: 0.4, rule: 0.25 };

export const VOUCHER_COPY_TITLES = {
  bank: 'BANK COPY',
  institute: 'INSTITUTE COPY',
  student: 'STUDENT COPY',
} as const;

/** Student particulars rows: heading followed by value, in this order. */
export const VOUCHER_STUDENT_ROWS = [
  { key: 'name', heading: 'Student Name:' },
  { key: 'father', heading: 'Father Name:' },
  { key: 'regNo', heading: 'Registration No:' },
  { key: 'class', heading: 'Class:' },
] as const;

/**
 * Line-item amount: number only (no currency label), sign preserved so credits show as -1,200.
 * The currency code is shown only in the particulars header, net due and payable-after-due rows.
 */
export function formatLineItemAmount(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US');
}
