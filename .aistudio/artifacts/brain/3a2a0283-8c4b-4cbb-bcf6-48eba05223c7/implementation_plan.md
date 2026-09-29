# Standardize Negative Currency Formatting to "Rs. -500"

Standardize the representation of negative monetary amounts across all voucher generation preview modals, particulars editors, fee ledgers, reports, and print/PDF views so negative balances and concessions display consistently as **"Rs. -500"** rather than **"- Rs. 500"** or **"-Rs. 500"**.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following formatting conventions were confirmed via interactive clarification:
> - **Global Formatting Scope**: The `"Rs. -500"` display standard applies across all screen previews, fee ledgers, table summaries, and printable voucher / receipt documents.
> - **Line Item Consistency**: Discounts, concessions, credit balances, and negative adjustments in fee breakdowns and particular lists will uniformly use `"Rs. -{amount}"` (e.g. `Rs. -500` for a Rs. 500 discount).

- **Confirmed Decision 1**: Update `formatCurrency(amount)` in `src/utils/feeMath.ts` to return `Rs. -${absVal}` whenever `amount < 0`, serving as the single authoritative source of truth for currency rendering.
- **Confirmed Decision 2**: Eliminate manual prefixing patterns like `-${formatCurrency(val)}` or `- ${formatCurrency(val)}` in components (such as `VoucherParticularsEditor` and `AssignmentModal`), replacing them with standard calls to `formatCurrency(-Math.abs(val))` or `formatCurrency(item.amount)`.

> [!NOTE]
> **Status: Executed & Verified**: All negative currency amounts across preview modals, particulars editors, ledger tables, transport assignment dialogs, thermal receipt slips, and printable/PDF vouchers are now uniformly formatted as `"Rs. -500"`. Build and lint validation passed with zero errors.

---

## 1. Overview & Core Concept

- **What It Does**: Formats all negative currency figures throughout Skooler (such as family advance credits, sibling discounts, transport fee deductions, and negative ledger balances) with the currency symbol preceding the negative sign (`Rs. -500`).
- **Target Audience / Persona**: School administrators, accountants, and cashiers who review voucher batch generation previews, edit particulars, inspect ledgers, and print vouchers for parents.
- **Key Value**: Professional, unified accounting notation across all preview cards and financial reports that eliminates visual discrepancies between various modals and printed receipts.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Batch Generation Preview**: When accountants generate monthly fee vouchers, students with advance credits or custom discounts see their concessions rendered cleanly as `Rs. -500` in the breakdown table and calculation summaries.
2. **Voucher Particulars Editor**: In the modal dialog where individual line items are reviewed or adjusted, discount items display with distinct red/slate styling as `Rs. -500` instead of `-${formatCurrency(val)}` (which previously generated double symbols like `-Rs. 500`).
3. **Student Fee Ledger & Account History**: Advance payments and negative balances in the running balance column and summary stat cards consistently reflect `Rs. -500`.
4. **Printable Vouchers & Receipt Modals**: Parents and bank branches receive vouchers where negative line items show as `Rs. -500`, aligning printed documents with screen previews.

### Visual Identity & Theme
- **Color Discipline**: Negative discount figures and credit adjustments retain their semantic text cues (`text-rose-600` or `text-emerald-700` for credits/advances where applicable).
- **Tabular Numerals**: All figures continue using `font-mono tabular-nums` to ensure exact column alignment regardless of digit widths or the negative sign.
- **Single-Line Controls**: Line item amounts remain `whitespace-nowrap font-mono` to prevent wrapping.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Centralized Formatter vs. Local Overrides**
  - *Chosen Approach*: Update `formatCurrency` in `src/utils/feeMath.ts` and audit all component-level string interpolations.
  - *Why*: Over 80% of views consume `formatCurrency`. Updating the central utility guarantees immediate consistency while fixing any stray hardcoded template literals prevents regression.
  - *Alternatives Considered*: Overriding in individual preview modal files was rejected because it would lead to drift and inconsistency between preview screens and ledger tables.

- **Decision 2: Handling of Explicit Concession Inputs**
  - *Chosen Approach*: In components where discounts are stored as positive values (e.g. `monthlyDiscount = 500`) but displayed as negative line items, format them using `formatCurrency(-displayAmount)` or direct template `Rs. -${absVal}`.
  - *Why*: Prevents double negatives or malformed strings like `Rs. --500`.

---

## 4. Technical Architecture & Data Strategy

### Component & Data Flow Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                    src/utils/feeMath.ts                       │
│  formatCurrency(amount: number): string                       │
│    amount < 0  ──►  "Rs. -" + abs(amount).toLocaleString()   │
│    amount >= 0 ──►  "Rs. "  + abs(amount).toLocaleString()   │
└───────────────────────────────┬───────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Voucher Preview  │  │ Fee Ledger &     │  │ Print & PDF      │
│ & Editor Modals  │  │ Collections View │  │ Receipts         │
│ - Particulars    │  │ - Running Bal    │  │ - PrintVoucher   │
│ - Defaulters     │  │ - Advance Bal    │  │ - PaymentReceipt │
│ - Batch Wizard   │  │ - Net Due        │  │ - PDF Generator  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Component Auditing Checklist
1. **`src/utils/feeMath.ts`**:
   - `formatCurrency(amount)`: change line 30 from `return isNegative ? `- Rs. ${absVal}` : `Rs. ${absVal}`;` to `return isNegative ? `Rs. -${absVal}` : `Rs. ${absVal}`;`.
2. **`src/components/VoucherParticularsEditor.tsx`**:
   - Lines 417, 421, 451: replace manual `-${formatCurrency(...)}` with `formatCurrency(-Math.abs(amount))` so it outputs `Rs. -500`.
3. **`src/components/transport/AssignmentModal.tsx`**:
   - Line 507: replace `{discount > 0 ? `- ${formatCurrency(discount)}` : 'Rs. 0'}` with `{discount > 0 ? formatCurrency(-discount) : 'Rs. 0'}`.
4. **`src/utils/pdfGenerator.ts` & `src/components/PaymentReceiptModal.tsx`**:
   - Verify any raw string constructions of negative balances conform to `"Rs. -{amount}"`.
5. **Verification**:
   - Run `lint_applet` and `compile_applet` to verify compilation and layout stability.
