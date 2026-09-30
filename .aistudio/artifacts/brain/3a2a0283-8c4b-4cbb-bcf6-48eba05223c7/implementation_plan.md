# Currency Negative Amount Display Formatting (`Rs. -500`)

Standardize negative currency amounts across the entire application so that negative values, credits, and concessions display with the minus symbol positioned after the currency indicator as **"Rs. -500"** rather than the previous prefix style **"- Rs. 500"** or **"-Rs. 500"**.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed in Phase 1:
> - **Format Scope**: Applied everywhere across the app — including generator preview grids, student fee ledgers, voucher particulars editors, modals, summary cards, and generated PDF vouchers/receipts.
> - **Discounts & Concessions**: Concession lines and negative fee deductions will also be formatted with the negative symbol positioned directly within the currency unit (e.g. `Rs. -500` instead of `- Rs. 500` or `-Rs. 500`).

- **Confirmed Decision 1**: Format negative numbers uniformly as `Rs. -X` across all UI views and PDF outputs.
- **Confirmed Decision 2**: Concession line items and negative adjustment lines will use the standard `formatCurrency` helper with negative values to ensure consistent spacing, currency symbols, and localization.

---

### 1. Overview & Core Concept

- **What It Does**: Unifies the visual representation of negative financial values throughout Skooler. All negative balances, discounts, concessions, prior advance credits, and downward adjustments will consistently read as `Rs. -<amount>` (e.g., `Rs. -500`), matching standard Pakistani billing conventions and accounting notation.
- **Target Audience / Persona**: School accountants, bursars, administrators, and fee collectors who read voucher generation preview matrices, ledger line items, and issued student vouchers.
- **Key Value**: Eliminates visual inconsistency between different screens (where some screens used `- Rs. 500`, others `-Rs. 500`, and some `Rs. -500`). Increases clarity when distinguishing between fees owed and credits or discounts applied.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Fee Voucher Generation Preview (`VouchersView.tsx`)**:
   - The user opens Voucher Generation, chooses a billing month and class scope.
   - The generation preview table lists students with tuition fees, discounts, transport, and net amounts.
   - Any student with a concession, advance credit, or negative adjustment displays `Rs. -500` cleanly in both individual fee component columns and summary fields.
2. **Voucher Particulars Customizer / Editor (`VoucherParticularsEditor.tsx`)**:
   - When viewing or editing itemized particulars on a voucher, concessions and discount items render as `Rs. -500` in emerald or rose font instead of `-Rs. 500`.
   - The Concession summary footer box in the modal displays `Rs. -<total>` (or `Rs. 0` when zero).
3. **Transport Assignment Modal (`AssignmentModal.tsx`)**:
   - When entering a monthly transport discount, the live calculation summary displays `Rs. -<discount>` instead of `- Rs. <discount>`.
4. **Exported PDF Documents & Print Slips (`pdfGenerator.ts`, `PrintVoucherModal.tsx`)**:
   - Generated fee vouchers (bank copy, school copy, student copy) and student ledger PDFs format negative balances and concessions identically as `Rs. -500`.

#### Visual Identity & Theme
- **Typographic Treatment**: Monospace font (`font-mono`) preserved for all financial numbers to ensure numerical column alignment in tables and previews.
- **Color Consistency**:
  - Concessions and downward fee adjustments remain styled with the system's intentional semantic color codes (e.g., `text-emerald-700` for credits/advances and `text-rose-600` for deductions).
  - Unboxed, clean typography adhering to the frontend design constitution with no extraneous pills or candy tags.

---

### 3. Key Product Decisions & Trade-Offs

- **Centralized Formatting Utility in `feeMath.ts`**:
  - *Chosen Approach*: Update the canonical `formatCurrency(amount: number)` function in `src/utils/feeMath.ts` from returning `isNegative ? "- Rs. " + abs : "Rs. " + abs` to `isNegative ? "Rs. -" + abs : "Rs. " + abs`.
  - *Why*: Virtually every component (over 40 distinct usages across Vouchers, Collections, Ledgers, Reports, Defaulters, and PDF generation) relies on this single utility function. Updating this centralized function guarantees consistent formatting across 95% of the codebase in one authoritative place with zero regressions.
  - *Alternatives Considered*: Overriding strings manually in every component would create maintenance debt and drift over time.
- **Cleanup of Ad-hoc Minus Prefixes in Components**:
  - *Chosen Approach*: Refactor manual template literals like `-${formatCurrency(val)}` in `VoucherParticularsEditor.tsx` and `- ${formatCurrency(val)}` in `AssignmentModal.tsx` to pass the negative value directly into `formatCurrency(-val)`.
  - *Why*: Passing negative values to `formatCurrency` delegates all currency symbol placement, negative sign rules, and thousand-separators to the single source of truth.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### System Architecture & Flow

```
┌────────────────────────────────────────────────────────┐
│                   Data / State Stores                  │
│       Vouchers, Ledgers, Particulars, Collections       │
└───────────────────────────┬────────────────────────────┘
                            │ (numerical amount: -500)
                            ▼
┌────────────────────────────────────────────────────────┐
│           Canonical Formatter (feeMath.ts)             │
│        formatCurrency(amount: number): string          │
│        amount < 0 ──► "Rs. -" + abs(amount)            │
│        amount >= 0 ──► "Rs. " + amount                 │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       "Rs. -500"                       "Rs. -500"
                │                        │
                ▼                        ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│        UI Components          │ │    PDF Generator     │
│ - VouchersView (Preview Grid) │ │ - 3-Copy Vouchers    │
│ - VoucherParticularsEditor    │ │ - Single Slip Vouchers│
│ - StudentFeeLedger            │ │ - Fee Ledger Reports │
│ - Transport Assignment Modal  │ │ - Defaulter Sheets   │
│ - Collections & Payment Views │ │                      │
└───────────────────────────────┘ └──────────────────────┘
```

#### Files to be Updated

1. **`src/utils/feeMath.ts`**:
   - Update `formatCurrency(amount: number): string` to format negative numbers as `Rs. -${absVal}` instead of `- Rs. ${absVal}`.
2. **`src/components/VoucherParticularsEditor.tsx`**:
   - Replace `-${formatCurrency(displayAmount)}` with `formatCurrency(-displayAmount)`.
   - Replace `-{formatCurrency(Math.abs(item.amount))}` with `formatCurrency(-Math.abs(item.amount))`.
   - Replace `-${formatCurrency(discountTotal)}` with `formatCurrency(-discountTotal)`.
3. **`src/components/transport/AssignmentModal.tsx`**:
   - Replace `- ${formatCurrency(discount)}` with `formatCurrency(-discount)`.
4. **Verification & Build**:
   - Run `compile_applet` and verify no TypeScript or syntax regressions exist.
