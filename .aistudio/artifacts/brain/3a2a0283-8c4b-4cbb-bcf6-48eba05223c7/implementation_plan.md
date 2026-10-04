# Remove Rounding Factor Indicator from Net Due Labels

Eliminates the rounding factor suffix (e.g. `Net Due (1)` or `ROUNDED TO 10`) across voucher collection modals, particulars editors, print templates, and inspection views, presenting clean, professional `Net Due` labels everywhere.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following label formatting decisions were confirmed based on your selections:

- **Collection Modal & Particulars Editor**: Always display `Net Due` cleanly without appending any rounding factor suffix (such as `(1)` or `(10)`).
- **Print Templates & Inspect Views**: Remove `(ROUNDED TO X)` text from voucher print layouts and inspection dialogs, standardizing the label to `NET DUE AMOUNT:` across all views.
- **Underlying Rounding Math Preserved**: The actual financial rounding calculation policy configured in Settings continues to function accurately behind the scenes; only the redundant visual indicator text is stripped from the user interface.

---

## 1. Overview & Core Concept

When collecting payments or reviewing voucher breakdowns, the particulars editor and voucher modals previously displayed suffixes like `Net Due (1)` or `NET DUE AMOUNT (ROUNDED TO 10):`. Because the rounding policy is an institutional rule configured in Settings, showing the factor integer directly in transaction labels added visual clutter and confusion (especially when rounding multiple is 1 or active).

This change streamlines all Net Due labels across the application into concise, clutter-free typography.

---

## 2. User Experience & Visual Design

### Before vs. After Labeling

- **Voucher Particulars Editor & Collection Dialogs**:
  - *Before*: `Net Due (1)` or `Net Due (10)`
  - *After*: `Net Due`
- **Voucher Print Layout & Modal Preview**:
  - *Before*: `NET DUE AMOUNT (ROUNDED TO 10):`
  - *After*: `NET DUE AMOUNT:`
- **Defaulters Voucher Inspection View**:
  - *Before*: `NET DUE AMOUNT (ROUNDED TO 10):`
  - *After*: `NET DUE AMOUNT:`

### Visual Design Specifications
- Adheres to SaaS dashboard and zero-pill typography standards: crisp labels, high readability, and clean layout alignment.
- Financial figures remain formatted with `font-mono tabular-nums` for consistent column alignment.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Complete Removal vs. Tooltip
- **Chosen Approach**: Completely remove the rounding factor string from all Net Due labels without adding hover tooltips or secondary pill tags.
- **Why**: Eliminates noise from high-frequency billing and collection workflows. The administrative rounding multiple remains visible in Institutional Policies where administrators manage it.

---

## 4. Technical Architecture & File Modifications

### Component Changes

1. **`src/components/VoucherParticularsEditor.tsx`**:
   - Update line 456: Replace `{roundingEnabled ? `Net Due (${roundingMultiple ?? 10})` : 'Net Due'}` with `'Net Due'`.

2. **`src/components/PrintVoucherModal.tsx`**:
   - Update lines 373–375: Replace dynamic label with static `'NET DUE AMOUNT:'`.

3. **`src/components/DefaultersView.tsx`**:
   - Update lines 1361–1363: Replace dynamic label in inspect modal with static `'NET DUE AMOUNT:'`.
