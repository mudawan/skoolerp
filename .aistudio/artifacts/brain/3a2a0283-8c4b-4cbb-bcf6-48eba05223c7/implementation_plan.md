# Implementation Plan: Fix Carried Forward Outstanding Balance Calculation in Defaulters View

Fix the calculation of carried forward amounts in the Defaulter View so that it accounts for payments already made, reflecting the actual outstanding arrears (`netDue - amountPaid`) instead of the gross voucher amount (`netDue`).

---

## 1. Problem Summary

- **Current Behavior**:
  - The **Carried Forward** summary card in `DefaultersView.tsx` computes `totalCarriedArrears` by summing `v.netDue` (`carriedVouchers.reduce((sum, v) => sum + v.netDue, 0)`).
  - When filtering or viewing the Carried tab, `totalArrearsActiveTab` also sums `v.netDue`.
  - In the Carried tab table, only `Net Due` is displayed.
  - If a student has a voucher of Rs. 5,000 and paid Rs. 2,500 prior to carry forward, the card and tab show Rs. 5,000 instead of the actual carried outstanding arrears of Rs. 2,500.

- **Expected Behavior**:
  - The **Carried Forward** card must display the sum of actual outstanding balances: `Math.max(0, v.netDue - v.amountPaid)`.
  - The **Total Carried** metric pill in the toolbar must also compute `Math.max(0, v.netDue - v.amountPaid)` and use the proper amber styling.
  - The Carried Forward table will explicitly display **Net Due**, **Paid**, and **Carried Arrears** so users can immediately verify partial payments and the net carried balance.

---

## 2. Technical Changes

### A. Defaulters View (`src/components/DefaultersView.tsx`)
1. **Summary Metric Calculation**:
   - Update `totalCarriedArrears`:
     ```ts
     const totalCarriedArrears = useMemo(() => {
       return carriedVouchers.reduce(
         (sum, v) => sum + Math.max(0, v.netDue - v.amountPaid),
         0
       );
     }, [carriedVouchers]);
     ```
2. **Tab Toolbar Arrears Pill**:
   - Update `totalArrearsActiveTab` for the `'carried'` tab:
     ```ts
     return filteredVouchers.reduce(
       (sum, v) => sum + Math.max(0, v.netDue - v.amountPaid),
       0
     );
     ```
   - Fix styling in the toolbar pill for `'carried'` so it highlights with `text-amber-700` (matching the tab theme).
3. **Carried Forward Table Columns**:
   - In Tab 3 (`activeTab === 'carried'`), enhance table columns to display:
     - **Net Due**: Original voucher net due
     - **Paid**: Amount collected before carry forward
     - **Carried Arrears**: Remaining outstanding carried to next month (`Math.max(0, v.netDue - v.amountPaid)`)
     - **Carried To Month**
     - **Carried Late Surcharge**
     - **Actions** (Undo Carry)

---

## 3. Verification & Validation Plan

1. **Compilation & Linting**:
   - Run `compile_applet` and `lint_applet` to ensure zero TypeScript errors.
2. **Calculation Verification**:
   - Open Defaulters View for a month with partially paid carried vouchers (e.g., Net Due 5,000, Paid 2,500).
   - Verify the **Carried Forward** card shows Rs. 2,500 (not Rs. 5,000).
   - Verify the **Total Carried** pill in the table toolbar shows Rs. 2,500.
   - Verify the table shows Net Due (5,000), Paid (2,500), and Carried Arrears (2,500).
3. **Carry Forward Modal Consistency**:
   - Verify the Carry Forward confirmation modal continues to correctly display `v.netDue - v.amountPaid` for vouchers being carried.
