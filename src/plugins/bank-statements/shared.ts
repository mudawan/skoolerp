// Types shared by the Bank Statement Collections Loader's server and screen.
// Nothing here may import from either side: it is plain data shapes and tiny helpers.

export const FEE_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `duplicate` rows exist only to record that an upload contained an already-known transaction. */
export type StatementTxStatus = 'pending' | 'assigned' | 'applied' | 'ignored' | 'duplicate';

export type PaymentMode = 'BankDeposit' | 'OnlineTransfer' | 'SchoolCashier';

export interface AdapterInfo {
  id: string;
  version: string;
  label: string;
  formats: Array<'pdf' | 'csv' | 'xlsx'>;
}

export interface StatementUploadSummary {
  id: string;
  feeMonth: string;
  filename: string;
  adapterId: string | null;
  adapterVersion: string | null;
  bankName: string | null;
  accountNumber: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  parseStatus: 'parsed' | 'failed';
  parseError: string | null;
  warnings: string[];
  /** Another upload of byte-identical content existed before this one. */
  totalCredits: number;
  newCount: number;
  duplicateCount: number;
  uploadedBy: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  counts: { pending: number; assigned: number; applied: number; ignored: number };
  amounts: { pending: number; assigned: number; applied: number; ignored: number };
}

export interface StatementTxRow {
  id: string;
  uploadId: string;
  rowIndex: number;
  date: string;
  amount: number;
  description: string;
  reference: string | null;
  balance: number | null;
  status: StatementTxStatus;
  studentId: string | null;
  studentName: string | null;
  studentRegNo: string | null;
  studentClass: string | null;
  studentStatus: string | null;
  ignoreReason: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  appliedByName: string | null;
  appliedAt: string | null;
  /** How this payment will be (or was) recorded. A guess from the narration until the operator chooses. */
  paymentMode: PaymentMode;
  /** True while paymentMode is only the guess from the narration (nothing chosen/saved yet). */
  paymentModeGuessed: boolean;
  collectionId: string | null;
  collectionNo: string | null;
  /** Applied, but the collection it created has since been deleted/reversed. */
  collectionMissing: boolean;
  duesAmount?: number | null;
  fineAmount?: number | null;
  voucherDueDate?: string | null;
  voucherLateFeeRate?: number | null;
  isOverdue?: boolean;
}

export interface VoucherHint {
  voucherId: string;
  voucherNo: string;
  month: string;
  status: string;
  outstanding: number;
  /** False when the voucher cannot take a payment (carried, reversed, or a later voucher exists). */
  payable: boolean;
  blockedReason: string | null;
  dueDate?: string | null;
  lateFeeRate?: number;
}

export interface Suggestion {
  studentId: string;
  name: string;
  regNo: string;
  className: string | null;
  fatherName: string | null;
  status: string;
  score: number;
  reasons: string[];
  voucher: VoucherHint | null;
  assignedInUpload: boolean;
  suggestedDues?: number;
  suggestedFine?: number;
  isOverdue?: boolean;
}

export interface ApplyPreviewRow {
  txId: string;
  rowIndex: number;
  date: string;
  amount: number;
  description: string;
  studentId: string | null;
  studentName: string | null;
  studentRegNo: string | null;
  voucherId: string | null;
  voucherNo: string | null;
  outstanding: number | null;
  duesAmount: number;
  fineAmount: number;
  /** Amount above what the voucher still owes; the fee engine holds it as advance credit. */
  excess: number;
  paymentMode: PaymentMode;
  ready: boolean;
  blockedReason: string | null;
}

export interface ApplyPreview {
  feeMonth: string;
  monthLocked: boolean;
  rows: ApplyPreviewRow[];
  readyCount: number;
  blockedCount: number;
  readyTotal: number;
  /** Totals over the rows that are ready, so the confirmation can summarise without listing every student. */
  totals: { duesTotal: number; fineTotal: number; fineCount: number; excessTotal: number; excessCount: number; partialCount: number };
}

export interface ApplyResult {
  collectionId: string;
  collectionNo: string;
  appliedCount: number;
  totalAmount: number;
  skipped: Array<{ txId: string; reason: string }>;
}

/** What deleting a statement will do (computed by the server; same code as the delete itself). */
export interface DeletePlan {
  uploadId: string;
  filename: string;
  feeMonth: string;
  transactions: number;
  appliedRows: number;
  collections: Array<{ id: string; collectionNo: string; totalAmount: number; paymentCount: number }>;
  paymentsToReverse: number;
  amountToReverse: number;
  studentCount: number;
  monthsTouched: string[];
  lockedMonths: string[];
  foreignPayments: number;
  blockedReason: string | null;
}
