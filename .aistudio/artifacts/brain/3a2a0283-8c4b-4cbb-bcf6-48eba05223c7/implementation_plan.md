# User-Selectable Transport Fee Rounding

Add configurable transport fare rounding to Fee & Policy Settings, allowing schools to round calculated transport fees (e.g. nearest Rs. 5, 10, 50, 100 or 1 for exact) before incorporating them into the voucher gross and net due total.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions and architectural alignment have been incorporated:
>
> - **Transport Fee Source**: Transport fee is not a manual template override or CSV upload field (fee template overrides and CSV imports are strictly reserved for Fine and Flex1–4 items). Transport amounts are **always derived dynamically from the Transport Module assignments** (`TransportAssignment` + `TransportStop`).
> - **Setting Location**: Located in **Settings > Policies** tab alongside the existing Net Due / Late Fee Rounding policy card.
> - **Available Multiples**: Options matching voucher rounding: **1 (Exact / No rounding)**, **5**, **10**, **50**, and **100** (with custom numeric entry supported).
> - **Rounding Target**: Every active transport charge is computed from stop fare, discount, days charged, and trip type, and then rounded up to the selected transport multiple before entering the voucher particulars array.

---

## 1. Overview & Core Concept

- **What It Does**: Enables school administrators and accountants to specify whether and how calculated student transportation fares are rounded before appearing on monthly fee vouchers.
- **Problem Solved**: When transportation assignments feature prorated days (e.g. 17 days out of 31) or one-way trip discounts (50%), calculated amounts often result in awkward odd rupee figures (e.g. Rs. 1,645.16 or Rs. 1,827). Transport rounding cleanses these line items to cash-friendly increments (e.g. Rs. 1,650) prior to voucher generation.
- **Target Persona**: School finance managers, accountants, and transport coordinators seeking neat cash denominations on printed vouchers and receipts.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Configuring Transport Rounding Policy**:
   - The user navigates to **Settings > Policies** subtab.
   - A dedicated **Transport Fee Rounding Policy** card sits directly adjacent to the **Net Due Rounding Policy** card.
   - The card features:
     - Clear iconography (`Bus` icon in a styled indigo/teal container) and explanatory subtitle: *"Rounds calculated transportation fares up to the nearest multiple before adding to the fee voucher. Enter 1 or choose exact for no rounding."*
     - An integrated numeric input with `Rs.` prefix and a dropdown chevron opening quick presets: **Exact (1)**, **Rs. 5**, **Rs. 10**, **Rs. 50**, **Rs. 100**.
     - A dynamic **Modified** status badge if the draft differs from the saved policy.
     - Live summary in the **Save Policy Changes** confirmation modal.

2. **Voucher Generation & Calculation**:
   - During voucher preview and generation (single student, batch generation, and monthly voucher issuance), the transport line item is computed with the effective transport rounding multiple.
   - If a student has no active transport assignment, the transport amount is Rs. 0.
   - If a student has an active transport assignment, the prorated fare is rounded according to the policy before being added to the voucher particulars.

3. **Transport Assignment View**:
   - In **Transport Management > Student Assignments**, the calculated fare column reflects the effective transport rounding setting, ensuring complete consistency between what the transport coordinator sees and what appears on the generated voucher.

### Visual Identity & Theme Alignment
- Built strictly with Tailwind CSS tokens and consistent with existing design patterns (`PoliciesPanel.tsx` and `SettingsView.tsx`).
- Styled with single-elevation border cards, tabular numerals (`tabular-nums font-mono`) for currency values, clean typography with no mechanical clutter or pill badge sandwiches, and full keyboard/click accessibility.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Transport Line-Item Rounding vs. Net Voucher Rounding**:
  - *Chosen Approach*: Round the transport line item at calculation time before it joins the particulars array. The voucher's overall net due is then independently rounded by the voucher net due rounding rule.
  - *Rationale*: Guarantees that the printed transport line item on the voucher voucher slip is clean and legible (e.g. "Transport Fee: Rs. 1,850" rather than "Rs. 1,842.50").
- **Decision 2: Strict Assignment Derivation**:
  - *Chosen Approach*: Since transport amounts derive strictly from student assignments (stop monthly fare, discount, days charged, trip type), the rounding applies uniformly across all students with transport assignments.
  - *Rationale*: Aligns with the app's established separation of concerns where fee template customization covers tuition, fines, and the 4 flex items, while transport charges remain centrally managed by the transport assignment engine.
- **Decision 3: Storage & Persistence (Database Single Source of Truth)**:
  - *Chosen Approach*: Store `transportRoundingMultiple` (number) and `transportRoundingEnabled` (boolean) directly within `Institution.settings` in the database, saved via `apiUpdateInstituteSettings`.
  - *Rationale*: Eliminates local storage divergence so that all school operators (admin, accountant, transport manager) across all workstations share the identical authoritative policy. No local cache needed.

---

## 4. Technical Architecture & Data Strategy

### Complete Fee Calculation & Transport Rounding Formula

```text
┌─────────────────────────────────────────────────────────────┐
│                   Transport Assignment                      │
│     (stop.monthlyFare, discount, daysCharged, tripType)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Raw Fare Calculation                        │
│   raw = max(0, fare - discount) * (days / daysInMonth)      │
│         * (tripType === 'OneWay' ? 0.5 : 1.0)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             User-Selectable Transport Rounding              │
│       transportFee = roundUpToMultiple(raw, transportMult)  │
│       (where transportMult === 1 means exact / no rounding) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Fee Voucher Particulars                     │
│          kind: 'Transport', amount: transportFee            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Gross Total & Net Due                       │
│    grossTotal = Tuition + Transport + Flex1-4 + Fine        │
│    netDue = roundUpToMultiple(gross - discount + prev,      │
│                               voucherRoundingMult)          │
└─────────────────────────────────────────────────────────────┘
```

### Components and Files to Update

1. **`src/types.ts`**:
   - Extend `Institution.settings` typing with `transportRoundingMultiple?: number` and `transportRoundingEnabled?: boolean`.
2. **`src/utils/feeMath.ts`**:
   - Update `calculateTransportFee(assignment, stop, transportRoundingMultiple = 1): number` to apply `roundUpToMultiple(rawFare, transportRoundingMultiple)`.
   - Update `buildVoucherPreview` to pass `transportRoundingMultiple` into `calculateTransportFee`.
3. **`src/context/AppContext.tsx`**:
   - Add state: `transportRoundingMultiple` (default 1) and `transportRoundingEnabled` (default false/true based on value > 1).
   - Add setters: `setTransportRoundingMultiple` and `setTransportRoundingEnabled` with backend institution settings persistence (`apiUpdateInstituteSettings`).
   - Pass `transportRoundingMultiple` into all voucher generation routines (`generateVouchersForClass`, `generateMonthlyVouchers`, preview calculations).
4. **`src/components/settings/PoliciesPanel.tsx`**:
   - Add the **Transport Fee Rounding Policy** card with input and dropdown presets (Exact 1, Rs. 5, Rs. 10, Rs. 50, Rs. 100).
5. **`src/components/SettingsView.tsx`**:
   - Wire draft state, change detection (`hasPolicyChanges`), reset handler, and save confirmation modal for transport rounding.
6. **`src/components/TransportView.tsx`**:
   - Pass the configured `transportRoundingMultiple` to `calculateTransportFee` so the transport management table accurately displays the rounded fare that will appear on vouchers.
