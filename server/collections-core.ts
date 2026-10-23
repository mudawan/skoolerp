// The fee engine's "receive payments" step, shared by every way a payment can enter the system:
// POST /api/collections/receive (manual and CSV collections) and the Bank Statement Collections Loader.
//
// This is the code that used to live inline in the /api/collections/receive handler. It was moved here
// unchanged so a second caller does not need a second copy of the financial rules (status transitions,
// latest-voucher rule, locked-month check, document numbering, FOR UPDATE locking).

import { dbService, type VoucherTxWrites } from './db';
import { DEFAULT_PAYMENT_MODE } from '../src/utils/paymentMode';

export interface ReceivePaymentInput {
  payments: any[]; // { voucherId, amount, paymentMode, referenceNo, notes, date, fineAdded, updatedParticulars, id, transactionId }
  collectionNotes?: string;
  date: string;
  collectionId?: string;
  isBulkImport?: boolean;
}

export interface ReceivePaymentHooks {
  /** Runs inside the same database transaction, after all payment writes and before COMMIT. */
  afterWrites?: (client: any, result: { collection: any; transactions: any[] }) => Promise<void>;
}

export interface ReceivePaymentResult {
  collection: any;
  transactions: any[];
  updatedVouchers: any[];
  totalAmount: number;
  voucherIds: string[];
}

export async function receivePayments(
  institutionId: string,
  input: ReceivePaymentInput,
  hooks: ReceivePaymentHooks = {}
): Promise<ReceivePaymentResult> {
  const { payments, collectionNotes, date, collectionId: requestedCollectionId } = input;

  const yearStr = new Date().getFullYear().toString();
  const collectionId =
    typeof requestedCollectionId === 'string' && requestedCollectionId.trim()
      ? requestedCollectionId.trim()
      : `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const voucherIds = [...new Set(payments.map((p: any) => p.voucherId))] as string[];

  let totalCollectionAmount = 0;
  let createdTxns: any[] = [];
  let updatedVouchersList: any[] = [];
  let newCollection: any;

  // Locks exactly the voucher rows referenced by this batch of payments
  // (Postgres: SELECT ... FOR UPDATE). Concurrent payment collection on
  // *different* vouchers proceeds without contention; concurrent
  // attempts to pay the SAME voucher block until the first transaction
  // commits, then see its fresh state — closing the lost-update race
  // where two cashiers collecting payment near-simultaneously could
  // previously have one payment silently vanish via a full-collection
  // overwrite.
  await dbService.runVoucherTransaction(institutionId, { voucherIds }, async (lockedVouchers, helpers) => {
    const voucherUpserts: Record<string, any> = {};
    const newTransactions: NonNullable<VoucherTxWrites['newTransactions']> = [];
    totalCollectionAmount = 0;
    createdTxns = [];
    updatedVouchersList = [];

    for (let i = 0; i < payments.length; i++) {
      const item = payments[i];
      const base = voucherUpserts[item.voucherId] || lockedVouchers.get(item.voucherId);
      if (!base) {
        throw Object.assign(new Error(`Voucher ID ${item.voucherId} not found.`), { httpStatus: 404 });
      }
      const v = { ...base };
      if (v.status === 'Reversed' || v.status === 'Carried') {
        throw Object.assign(
          new Error(`Voucher ${v.voucherNo} is in status '${v.status}' and cannot accept payments.`),
          { httpStatus: 400 }
        );
      }
      if (item.amount <= 0) {
        throw Object.assign(new Error('Payment amount must be greater than zero.'), { httpStatus: 400 });
      }
      // Earlier balances are folded into the student's latest voucher, so only
      // the latest non-reversed voucher can take a payment.
      if (await helpers.hasLaterActiveVoucher(item.voucherId)) {
        throw Object.assign(
          new Error(`Voucher ${v.voucherNo} is not the student's latest voucher. Record the payment against the latest voucher.`),
          { httpStatus: 400 }
        );
      }

      const txnNo = await helpers.mintDocumentNumber('TXN', yearStr);

      // Update voucher line items if fine or particulars were revised at payment
      if (item.updatedParticulars && Array.isArray(item.updatedParticulars) && item.updatedParticulars.length > 0) {
        v.particulars = item.updatedParticulars;
        v.grossTotal = item.updatedParticulars
          .filter((p: any) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
          .reduce((s: number, p: any) => s + Number(p.amount), 0);
        v.discountTotal = item.updatedParticulars
          .filter((p: any) => p.kind === 'Discount')
          .reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
        v.netDue = item.updatedParticulars.reduce((s: number, p: any) => s + Number(p.amount), 0);
      } else if (item.fineAdded && Number(item.fineAdded) !== 0) {
        const fineAdd = Number(item.fineAdded);
        const cleanParts = (v.particulars || []).map((p: any) => ({ ...p }));
        const fIdx = cleanParts.findIndex((p: any) => p.kind === 'Fine');
        if (fIdx >= 0) {
          cleanParts[fIdx] = { ...cleanParts[fIdx], amount: Number(cleanParts[fIdx].amount || 0) + fineAdd };
        } else {
          cleanParts.push({ kind: 'Fine', label: 'Fine', amount: fineAdd });
        }
        v.particulars = cleanParts;
        v.grossTotal = cleanParts
          .filter((p: any) => p.kind !== 'PreviousBalance' && p.kind !== 'Discount')
          .reduce((s: number, p: any) => s + Number(p.amount), 0);
        v.discountTotal = cleanParts
          .filter((p: any) => p.kind === 'Discount')
          .reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
        v.netDue = cleanParts.reduce((s: number, p: any) => s + Number(p.amount), 0);
      }

      const updatedPaid = (v.amountPaid || 0) + item.amount;
      v.amountPaid = updatedPaid;
      if (updatedPaid >= v.netDue && v.netDue > 0) {
        v.status = 'Paid';
      } else if (updatedPaid > 0) {
        v.status = 'Partial';
      } else if (v.netDue <= 0 && updatedPaid === 0) {
        v.status = 'Paid';
      } else {
        v.status = 'Issued';
      }

      const txnId =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim()
          : typeof item.transactionId === 'string' && item.transactionId.trim()
          ? item.transactionId.trim()
          : `txn-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

      const newTxn = {
        id: txnId,
        txnNo,
        collectionId,
        voucherId: v.id,
        studentId: v.studentId,
        month: v.month,
        amount: item.amount,
        fineAdded: item.fineAdded,
        paymentMode: item.paymentMode || DEFAULT_PAYMENT_MODE,
        referenceNo: item.referenceNo,
        notes: item.notes || `Payment for ${v.voucherNo}`,
        date: item.date || date,
      };

      totalCollectionAmount += item.amount;
      createdTxns.push(newTxn);
      updatedVouchersList.push(v);
      voucherUpserts[v.id] = v;
      newTransactions.push(newTxn);
    }

    const collectionNo = await helpers.mintDocumentNumber('COL', yearStr);
    newCollection = {
      id: collectionId,
      collectionNo,
      date,
      totalAmount: totalCollectionAmount,
      transactionCount: createdTxns.length,
      notes: collectionNotes || `Payment collection receipt ${collectionNo}`,
      isBulkImport: input.isBulkImport || false,
    };

    const writes: VoucherTxWrites = { voucherUpserts, newTransactions, newCollections: [newCollection] };
    if (hooks.afterWrites) {
      writes.afterWrites = (client) => hooks.afterWrites!(client, { collection: newCollection, transactions: createdTxns });
    }
    return { writes, result: null };
  });

  return {
    collection: newCollection,
    transactions: createdTxns,
    updatedVouchers: updatedVouchersList,
    totalAmount: totalCollectionAmount,
    voucherIds,
  };
}
