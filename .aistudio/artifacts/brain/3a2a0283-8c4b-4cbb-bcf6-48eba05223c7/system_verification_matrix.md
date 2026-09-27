# System Specification & Verification Matrix

This matrix documents all active business rules, mathematical formulas, user flows, configuration policies, and background actions currently implemented in the codebase. Use this document to audit each item and flag any legacy, duplicate, or outdated behavior for cleanup.

---

## 1. Fee Calculation & Voucher Engine (`src/utils/feeMath.ts`)

| ID | Feature / Rule | Implemented Logic | Current Status / Notes | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| **FEE-01** | **Particulars Ordering** | Particulars are computed in strict sequence: <br>1. Tuition Fee <br>2. Dynamic Flex 1 <br>3. Dynamic Flex 2 <br>4. Dynamic Flex 3 <br>5. Dynamic Flex 4 <br>6. Fine <br>7. Transport Fee (Dynamic) | Respects student-level template overrides over class-level defaults for Fine and Flex 1–4. Tuition is set on the Class. | `[x] Verified` |
| **FEE-02** | **Transport Fee Derivation** | Purely derived from active `TransportAssignment` + `TransportStop`. <br>$$\text{raw} = \max(0, \text{fare} - \text{disc}) \times \frac{\text{days}}{\text{daysInMonth}} \times \text{tripFactor}$$ <br>$$\text{fee} = \text{roundUp}(\text{raw}, \text{transportRoundingMult})$$ | Not exposed in fee template upload or manual overrides; strictly automated from transport assignments. | `[x] Verified` |
| **FEE-03** | **Transport Rounding Rule** | Configurable multiple: `1` (Exact), `5`, `10` (Default), `50`, `100`, or custom integer. Rounds the transport line item *before* joining gross total. | Saved in `institution.settings.transportRoundingMultiple`. **Default is 10** (rounds up to nearest Rs. 10), matching Net Due Rounding. | `[x] Verified` |
| **FEE-04** | **Gross Total & Flex 1–4 Adjustments** | $$\text{Gross} = \text{Tuition} + \sum \text{Flex}_{1..4} + \text{Fine} + \text{Transport}$$ | **Negative values are explicitly permitted in Flex 1–4** (e.g. Flex4 = `-4000` for "Transport Reversal"). Negative amounts reduce the Gross Total. | `[x] Verified` |
| **FEE-05** | **Discount / Concession** | Subtracted from Gross Total. Cannot exceed Gross Total (clamped to 0). | Configured per student in student profile or voucher edit. | `[x] Verified` |
| **FEE-06** | **Previous Balance / Arrears** | Added after discount: <br>$$\text{Subtotal} = (\text{Gross} - \text{Discount}) + \text{PreviousBalance}$$ | Driven by the Prior Month Arrears Policy (`accumulate` / `replace` / `ignore`). | `[x] Verified` |
| **FEE-07** | **Net Due Voucher Rounding** | $$\text{NetDue} = \text{roundUp}(\text{Subtotal}, \text{roundingMultiple})$$ | **Default multiple is 10** (Enabled). Rounds up the final voucher payable amount. | `[x] Verified` |
| **FEE-08** | **Late Fee Calculation** | If current date > due date and voucher is unpaid/partial: <br>Late fee added based on `defaultLateFeeRate` (flat amount or percentage). | Applied dynamically on viewing or payment recording. | `[x] Verified` |
| **FEE-09** | **Voucher Status Life-cycle** | Transitions: <br>`Issued` → `Partial` (if $0 < \text{Paid} < \text{NetDue}$) → `Paid` (if $\text{Paid} \ge \text{NetDue}$) | Status updates atomically whenever a payment transaction is recorded or reversed. | `[x] Verified` |

---

## 2. Policy Settings & Institution Config (`src/components/settings/PoliciesPanel.tsx`)

| ID | Policy Setting | Default Value | Available Options / Behavior | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| **POL-01** | **Net Due Rounding** | `Multiple: 10` (Enabled) | Multiples: `1` (Exact), `5`, `10`, `50`, `100`, Custom. Rounds voucher net payable amount up. | `[x] Verified` |
| **POL-02** | **Transport Fee Rounding** | `Multiple: 10` (Enabled) | Multiples: `1` (Exact), `5`, `10`, `50`, `100`, Custom. Rounds individual transport line items up. | `[x] Verified` |
| **POL-03** | **Default Due Date** | `15th` of Month | Dropdown 1st–28th. Automatically sets due date on newly generated vouchers. | `[x] Verified` |
| **POL-04** | **Default Late Fee** | `Rs. 100` / `0%` | Flat amount or percentage rate applied post-due-date. | `[x] Verified` |
| **POL-05** | **Prior Month Arrears Rule** | `accumulate` | - `accumulate`: Carry forward all unpaid balance into new voucher. <br>- `replace`: Void prior vouchers and overwrite. <br>- `ignore`: Issue fresh current-month voucher only. | `[x] Verified` |
| **POL-06** | **Skipped Month Rule** | `warn` | - `warn`: Alert user when generating vouchers with gaps. <br>- `block`: Prohibit generation until gap months are resolved. <br>- `allow`: Silently generate without restrictions. | `[x] Verified` |
| **POL-07** | **Voucher Deletion Resolution** | `archive` | - `archive`: Soft-delete/mark as void. <br>- `cascade`: Hard delete voucher and reverse transactions. <br>- `restrict`: Disallow deletion if payment exists. | `[x] Verified` |
| **POL-08** | **Voucher Copy Configuration** | Bank, School, Student | Custom print order and active/inactive toggle per copy type. | `[x] Verified` |

---

## 3. Transport Management Module (`src/components/TransportView.tsx`)

| ID | Transport Flow / Feature | Trigger / Mechanics | Validation & Constraints | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| **TRN-01** | **Bus Fleet Management** | Add / Edit / Reorder / Delete bus routes and vehicles. | **No seating capacity field exists or is tracked.** Fields: Bus Number, Model, Registration Number, Driver Name, Driver Phone, Route Name, Sort Order. | `[x] Verified (No Capacity)` |
| **TRN-02** | **Bus Stops & Fare Grid** | Add / Edit / Reorder / Delete stops. Base monthly fare attached to stop. | Positive currency values, unique stop names per route. | `[x] Verified` |
| **TRN-03** | **Student Assignments** | Assign student to Bus + Stop for active month with trip type, days charged, and discount. | Trip types: `RoundTrip` (100% fare) or `OneWay` (50% fare). Days clamped to month length. | `[x] Verified` |
| **TRN-04** | **Monthly Rollover** | "Copy from Previous Month" button copies active assignments from Month $M-1$ to Month $M$. | Bypasses existing assignments to avoid overwriting current month edits. | `[x] Verified` |
| **TRN-05** | **Bulk Days Update** | "Apply Days to All" sets `daysCharged` across all active assignments in selected month. | Updates UI immediately and persists changes. | `[x] Verified` |
| **TRN-06** | **Bulk CSV Import (Assignments)** | Upload CSV (`regNo`, `bus`, `stop`, `tripType`, `days`, `discount`). | Modal previews validation: duplicates, missing students, invalid stops, **rounded net fare (nearest 10)**, est. revenue. | `[x] Verified` |
| **TRN-07** | **Bulk CSV Import (Stops)** | Upload CSV (`name`, `landmark`, `monthlyFare`, `sortOrder`). | Validates numeric fares and uniqueness; supports add & update. | `[x] Verified` |

---

## 4. Bulk Data Ingestion & Roster Management

| ID | Data Flow | File / Component | Behavior & Scope | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| **ING-01** | **Student Bulk Import** | `StudentsView.tsx` | Ingests student profiles (`regNo`, `name`, `fatherName`, `class`, `gender`, `phone`). Validates duplicate registration numbers. | `[x] Verified` |
| **ING-02** | **Fee Template Overrides CSV** | `SettingsView.tsx` | **Scope**: Strictly updates **Fine** and **Flex 1–4** (Admission, Registration, Exam, Other) student overrides. **Does not include Tuition** (which is set on Classes) and **does not include Transport** (which is automated from assignments). Supports negative values for reversals. | `[x] Verified` |
| **ING-03** | **Fee Template Hierarchy** | `SettingsView.tsx` | 4-Tier Scope: Global Baseline $\rightarrow$ Class Overrides $\rightarrow$ Student Overrides $\rightarrow$ Overrides Directory. Negative amounts permitted for Flex 1–4. | `[x] Verified` |

---

## 5. Payment Reconciler & Collections Engine (`CollectionsView.tsx`, `AppContext.tsx`)

### Architecture & Detailed Workflow

The payment system operates on **voucher-level receivables** paired with an immutable collection log:

1. **Voucher as Accounts Receivable**:
   A Fee Voucher (`FeeVoucher`) defines the total legal receivable (`netDue`).
2. **Payment Collection Event**:
   When payment is received:
   - A `FeeCollection` record is created (e.g. `COL2026-000042`) representing the deposit receipt/slip.
   - A `PaymentTransaction` record is created (e.g. `TXN2026-000089`) binding the receipt to the specific `voucherId`, `studentId`, `amount`, `paymentMode` (Cash, Bank Transfer, Cheque, Online), `date`, and reference number.
3. **Voucher Status Rebalance**:
   $$\text{voucher.amountPaid} = \text{voucher.amountPaid} + \text{transaction.amount}$$
   - If $\text{amountPaid} \ge \text{netDue}$: Status becomes **`Paid`**.
   - If $0 < \text{amountPaid} < \text{netDue}$: Status becomes **`Partial`**.
   - If unpaid: Status remains **`Issued`** (or **`Overdue`** if past due date).
4. **Collection Reversal / Rollback**:
   Deleting a collection (e.g. bounced cheque, clerical error) automatically deducts the payment from `voucher.amountPaid`, recalculates the status back to `Partial` or `Issued`, and restores the student's arrears ledger.

### Concrete Example:

- **Scenario**: September Voucher #V-2026-09-0120 has `netDue = Rs. 15,000`.
- **Action 1 (Sept 10)**: Parent pays `Rs. 10,000` via Cash.
  - Generates `COL2026-000101` and `TXN2026-000201` for `Rs. 10,000`.
  - Voucher updates: `amountPaid = 10,000`, `remainingDue = 5,000`, `status = Partial`.
- **Action 2 (Sept 14)**: Parent pays the remaining `Rs. 5,000` via Bank Transfer.
  - Generates `COL2026-000102` and `TXN2026-000202` for `Rs. 5,000`.
  - Voucher updates: `amountPaid = 15,000`, `remainingDue = 0`, `status = Paid`.
- **October Rollover**: Since September is `Paid`, the October voucher carries forward `Previous Balance = Rs. 0`.

---

## 6. Edge Case Analysis: Negative Adjustments in Flex 1–4

### The Scenario:
A student was mistakenly charged `Rs. 4,000` transport in September and the parent paid the full amount. In October, the institution wants to refund/credit the `Rs. 4,000` by setting Flex4 ("Transport Reversal") to `-4000`.

### System Behavior:
1. **Allowed in Data Model**:
   - `allowNegativeAmount` in `SettingsView.tsx` explicitly permits `Flex1`, `Flex2`, `Flex3`, and `Flex4` to accept negative numbers.
   - The CSV overrides parser (`processCsvContent`) supports negative numbers (`-4000`).
2. **Calculation Impact**:
   - October Tuition: `Rs. 8,000`
   - October Transport: `Rs. 4,000`
   - Flex4 ("Transport Reversal"): `-Rs. 4,000`
   - $$\text{Gross Total} = 8,000 + 4,000 + (-4,000) = \text{Rs. 8,000}$$
   - Net Due becomes `Rs. 8,000`, effectively zeroing out the transport charge for October and balancing the books without needing cash outflow.
3. **UI & Voucher Rendering**:
   - Negative Flex items are displayed in distinct rose/red text (e.g. `-Rs. 4,000`).
   - The voucher particular label clearly prints `Transport Reversal: -Rs. 4,000`.

---

## 7. Cleanup Executed & Pruning Log

| Target File / Area | Action Taken | Status |
| :--- | :--- | :--- |
| `src/utils/feeMath.ts` (Lines ~704–725) | Pruned dormant fee template override branches (`transportStudentOverride`, `transportClassOverride`). Transport fee is now calculated purely and directly from `TransportAssignment` and `TransportStop` with the configured transport rounding multiple. | `[x] Completed` |
| `src/context/AppContext.tsx` & `feeMath.ts` | Default transport rounding multiple updated to `10` (rounding up), matching Net Due Rounding. | `[x] Completed` |
| `feeMath.ts` & `AppContext.tsx` (Arrears/Advance) | Removed artificial positive clamping on prior voucher debt rollover (`priorVoucher.netDue - priorVoucher.amountPaid`), allowing negative advance credit balances to carry forward into future vouchers cleanly. | `[x] Completed` |
| `.aistudio/artifacts/` | Retained `system_verification_matrix.md` as the authoritative single source of truth for system rules and verification. | `[x] Completed` |
