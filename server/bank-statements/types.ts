// The contract between the core module and a bank-statement parser.
// A new bank layout means a new adapter file and one line in adapters/registry.ts — nothing else.

export interface StatementInput {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
}

export interface ParseContext {
  /** The fee month the operator chose (YYYY-MM). Adapters normally ignore it. */
  feeMonth: string;
}

/** One credit line, already normalised. Debits never leave an adapter. */
export interface ParsedTransaction {
  /** YYYY-MM-DD */
  date: string;
  /** Positive credit amount. */
  amount: number;
  description: string;
  reference?: string;
  /** Running balance after this line, when the statement prints one. */
  balance?: number;
  /** Position among ALL rows of the statement (for display and debugging). */
  rowIndex: number;
  /** Whatever the adapter saw, kept verbatim so a better adapter can be written from real data. */
  raw: Record<string, unknown>;
}

export interface ParsedStatement {
  adapterId: string;
  adapterVersion: string;
  bankName?: string;
  accountNumber?: string;
  periodFrom?: string;
  periodTo?: string;
  /** Credit lines only. */
  transactions: ParsedTransaction[];
  /** Things the operator should know: skipped rows, rows whose direction was unclear, ... */
  warnings: string[];
  stats: { rowsSeen: number; credits: number; debitsSkipped: number; unreadable: number };
}

export interface StatementAdapter {
  /** Stable identifier, stored with every upload ("generic-pdf", "generic-csv", ...). */
  readonly id: string;
  /** Bump when parsing behaviour changes; stored with every upload. */
  readonly version: string;
  readonly label: string;
  readonly formats: ReadonlyArray<'pdf' | 'csv' | 'xlsx'>;
  /** 0 = cannot parse this input, 1 = certain. Used for automatic selection. */
  detect(input: StatementInput): Promise<number>;
  /** Must throw AdapterError (with a readable message) when the file cannot be parsed. */
  parse(input: StatementInput, ctx: ParseContext): Promise<ParsedStatement>;
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}
