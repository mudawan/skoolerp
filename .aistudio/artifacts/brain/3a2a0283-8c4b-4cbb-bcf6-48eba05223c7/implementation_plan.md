# Fee Collection Deletion, Ghost Deposit Prevention & Ledger Desynchronization Fix

Resolve the workflow issue where deleting a payment collection (manual or CSV batch) leaves "ghost" deposits of Rs 3,100 in the student ledger, fails to persist deletions to the PostgreSQL database, and desynchronizes voucher amounts upon session re-authentication.

> [!IMPORTANT]
> **Summary of Key Decisions & User Clarifications:**
> - **Additive CSV Fine Logic**: When importing a CSV collection with a fine amount, this fine is **additive** to any existing fine on the voucher. For example, if a voucher already has a fine of Rs 200 and the CSV specifies a fine of Rs 500, the voucher's total fine becomes Rs 700. The imported payment transaction records `fineAdded = 500`.
> - **Precise Fine Reversal on Collection Deletion**: When a collection is deleted or reversed, only the specific fine increment contributed by that collection (`fineAdded`) is subtracted. For example, deleting the aforementioned collection will deduct Rs 500 from the Rs 700 fine, cleanly reverting the voucher's fine back to Rs 200 (not 0), and recalculating net due accordingly.
> - **Unified ID Synchronization**: Both the client and server will share identical deterministic entity IDs for collections and payment transactions. When `/api/collections/receive` executes, it will accept client-provided IDs (or return authoritative IDs that immediately update client state) so the client and database are always in 100% ID lockstep.
> - **Cascade Transaction Deletion on Collection Removal**: On the server in `dbService.runVoucherTransaction`, deleting a collection (`deleteCollectionIds`) will automatically and safely delete all transactions linked to that collection (`DELETE FROM transactions WHERE collection_id = $1`), preventing orphaned ghost transactions in PostgreSQL.
> - **Synchronous Client State Reversal in `deleteCollection`**: When deleting a collection, immediately reverse any `fineAdded` from the voucher particulars, decrement `amountPaid` by the collected sum, recalculate `netDue` and `status`, and persist the updated voucher state to PostgreSQL alongside the collection/transaction deletion.
> - **Reconciliation Guard in `StudentFeeLedger`**: Align student ledger deposits to display the sum of active transactions for that voucher, preventing phantom deposit displays if a voucher's `amountPaid` field ever temporarily diverges.

---

## 1. Overview & Core Concept

### What It Does
When an operator collects fee payment (either manually through the collection modal with a late fine, or in bulk via CSV) and later deletes the collection record, the system will:
1. Atomically delete the collection and all its associated transaction records from both active UI state and the authoritative PostgreSQL database.
2. Automatically deduct the payment amount from the student voucher's `amountPaid` and restore its status to `Issued` (or `Partial`).
3. Revert only the specific fine amount added during that collection (`fineAdded`) from the voucher particulars, preserving any pre-existing fines (e.g. Rs 700 reverts back to Rs 200 if the collection added Rs 500).
4. Recalculate gross total, discounts, and net due amounts with rounding rules applied.
5. Keep the student fee ledger, voucher list, collections history, and backend PostgreSQL database in exact mathematical synchronization before and after operator logout/login.

### Target Audience & Persona
School fee accountants, administrative cashiers, and system operators who manage fee collections, record manual adjustments, import bank CSV statements, and rectify erroneous payments.

### Key Value
Guarantees strict financial ledger integrity with zero ghost deposits, zero phantom transactions, accurate additive fines, and reliable payment reversal across client tabs and browser sessions.

---

## 2. User Experience & Visual Design

### Key User Flows

#### Flow A: Manual Collection & Subsequent Deletion
1. **Creation**: Student voucher for July is generated with Tuition Rs 2,600 and Late Fine rate Rs 500. Due date is 15-July. Student ledger shows `Total: Rs 2,600`, `Deposit: Rs 0`, `Balance: Rs 2,600`, `Status: Issued`.
2. **Collection with Fine**: Cashier collects payment on 31-July, adding Rs 500 late fine. Total becomes Rs 3,100, payment received is Rs 3,100. Student ledger displays `Total: Rs 3,100`, `Deposit: Rs 3,100`, `Balance: Rs 0`, `Status: Paid`.
3. **Deletion**: Cashier navigates to **Collections** and deletes the collection session.
   - The collection session and its transaction are purged from the UI and PostgreSQL.
   - The voucher's payment of Rs 3,100 is deducted (`amountPaid` becomes 0).
   - The Rs 500 late fine added during collection is reverted (`netDue` returns to Rs 2,600).
   - The voucher status transitions back to `Issued`.
   - The **Student Fee Ledger** immediately displays `Total: Rs 2,600`, `Deposit: Rs 0`, `Balance: Rs 2,600`, `Status: Issued`.
4. **Session Re-authentication**: Cashier logs out and logs back in. The ledger continues to display `Total: Rs 2,600`, `Deposit: Rs 0`. No ghost transactions or deposits exist in PostgreSQL.

#### Flow B: CSV Bulk Collection with Additive Fine & Batch Deletion
1. **Existing Voucher**: Student voucher has Tuition Rs 2,600 and an existing fine of Rs 200 (Total: Rs 2,800).
2. **CSV Import with Fine**: CSV specifies payment for this voucher with an additional fine of Rs 500.
   - Voucher fine becomes **Rs 700** (`200 + 500`).
   - Transaction records payment and stores `fineAdded: 500`.
   - Voucher total becomes Rs 3,300, and deposited is Rs 3,300.
3. **Batch Deletion**: Cashier deletes the imported collection batch.
   - The batch collection row and all imported transaction rows are removed from database.
   - The Rs 500 fine is subtracted from the Rs 700 fine, cleanly reverting the fine to **Rs 200**.
   - Net due returns to Rs 2,800 and paid amount returns to Rs 0.
   - Ledger displays `Total: Rs 2,800`, `Deposit: Rs 0`.
4. **Session Re-authentication**: Cashier logs out and logs back in. Ledger displays `Total: Rs 2,800`, `Deposit: Rs 0`.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Additive Fine Increment & Granular Fine Reversal
- **Approach**: 
  - In `bulkCsvCollection` (and manual collection fine updates), calculate the new fine as `currentFine + csvFine` (or `newFine - originalFine` for manual collections). Store this exact differential in `transaction.fineAdded`.
  - In `deleteCollection`, look up each transaction's `fineAdded`. For each voucher, subtract `totalFineAddedForVoucher` from the voucher's fine item:
    ```ts
    const currentFine = cleanParticulars[fineIndex].amount;
    const revertedFine = Math.max(0, currentFine - fineToRevert);
    ```
    If `revertedFine > 0`, keep the Fine particular with `amount: revertedFine`; only remove the Fine line item if the reverted fine is 0.
- **Why**: Perfectly aligns with the user's rule: pre-existing fines (e.g. 200) remain intact when reversing a collection that introduced an additional fine (e.g. 500).

### Decision 2: Shared Deterministic IDs for Collections & Transactions
- **Approach**: Allow `/api/collections/receive` to accept client-provided `collectionId` and `payment.transactionId`s (falling back to generated ones only if omitted), and update client React state with the authoritative server response.
- **Why**: Eliminates the mismatch where the client holds `col-<timestamp>` while PostgreSQL holds `col-<timestamp>-<random>`, which previously caused `DELETE FROM collections WHERE id = ...` to match 0 rows and leave payments ghosted in the database.

### Decision 3: Server-Side Cascade Transaction Deletion by `collection_id`
- **Approach**: In `server/db.ts` under `runVoucherTransaction`, when `deleteCollectionIds` is passed:
  ```sql
  DELETE FROM transactions WHERE collection_id = ANY($1) AND institution_id = $2;
  DELETE FROM collections WHERE id = ANY($1) AND institution_id = $2;
  ```
- **Why**: Provides an ironclad foreign-key safety net. Even if a client only submits collection IDs (or if transaction IDs drifted during an offline/reconnection window), all transactions belonging to the deleted collection session are guaranteed to be cleaned up, preventing orphan payment records.

---

## 4. Technical Architecture & Data Strategy

### System Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Application                            │
│                                                                        │
│   ┌─────────────────────┐                 ┌────────────────────────┐   │
│   │   CollectionsView   │                 │    StudentFeeLedger    │   │
│   │  (Delete Session)   │                 │   (Displays Balance)   │   │
│   └──────────┬──────────┘                 └───────────▲────────────┘   │
│              │                                        │                │
│              ▼                                        │                │
│   ┌───────────────────────────────────────────────────┴────────────┐   │
│   │                        AppContext                              │   │
│   │  - deleteCollection(id)                                       │   │
│   │  - Reverts fineAdded (e.g. 700 - 500 = 200 fine preserved)   │   │
│   │  - Decrements voucher.amountPaid -> 0                          │   │
│   │  - Recalculates netDue (3300 -> 2800) & status (Issued)       │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │ POST /api/vouchers/batch-update
                                   │ { deleteCollectionIds, deleteTransactionIds, voucherUpserts }
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Express Server                                │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │   server.ts /api/vouchers/batch-update                         │   │
│   │   - Validates user permissions ('fees.delete')                 │   │
│   │   - Runs dbService.runVoucherTransaction()                     │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │                                     │
│                                  ▼                                     │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │   server/db.ts runVoucherTransaction()                         │   │
│   │   - DELETE FROM transactions WHERE collection_id = $1          │   │
│   │   - DELETE FROM collections WHERE id = $1                      │   │
│   │   - UPDATE vouchers SET amount_paid=0, net_due=2800, status... │   │
│   │   - DELETE & re-insert voucher_particulars (Tuition 2600, 200) │   │
│   │   - COMMIT transaction atomically                              │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Database                             │
│   - collections table: Collection row purged                           │
│   - transactions table: Txn rows for collection purged                 │
│   - vouchers table: amount_paid = 0, net_due = 2800                    │
│   - voucher_particulars: Tuition = 2600, Fine = 200 (preserved)        │
└────────────────────────────────────────────────────────────────────────┘
```

### Components to Update
1. **`server.ts`**:
   - In `/api/collections/receive`: Allow optional client-provided `collectionId` and `payment.transactionId` so IDs stay strictly in sync between client and server.
   - In `/api/vouchers/batch-update`: Ensure collection deletions and fine reversals properly pass validation checks.
2. **`server/db.ts`**:
   - In `runVoucherTransaction`: When `deleteCollectionIds` is provided, execute `DELETE FROM transactions WHERE collection_id = $1` to purge all linked transactions in the database and eliminate orphan records.
3. **`src/context/AppContext.tsx`**:
   - In `bulkCsvCollection`: Ensure the imported fine adds to existing fine (e.g. 200 + 500 = 700) and stores `fineAdded: 500` on the transaction.
   - In `deleteCollection`: Accurately subtract `fineAdded` from voucher particulars so pre-existing fines are preserved, deduct payments from `amountPaid`, and send synchronized IDs to `apiVoucherBatchUpdate`.
   - In `collectVoucherPayment`: Reconcile state with server-minted collection and transaction numbers.
4. **`src/components/StudentFeeLedger.tsx`**:
   - Ensure the deposit and balance calculations are robustly derived and guarded against desynchronized voucher states.
