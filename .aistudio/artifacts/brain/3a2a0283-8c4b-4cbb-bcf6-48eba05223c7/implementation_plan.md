# Visual Harmonization & Bulk Actions Plan: Defaulters & Arrears Tabs

Visually unifies all three tabs under **Fee Defaulters & Month-End Closure Gate** (**Unpaid Defaulters**, **Zero-Due / Settled**, and **Carried Forward**) by standardizing column definitions, dropping Father Name across all tabs, adding page-relative serial numbers (Sr #), adding row & header selection checkboxes, and providing tailored bulk action buttons for each tab.

---

## 1. User Requirements & Visual Discrepancy Analysis

Currently, the three tabs have divergent column structures, inconsistent row selectors, and missing bulk operations:
- **Tab 1 (Unpaid Defaulters)**: Has a checkbox column, "Student & Father Name" column with `• S/D/O <father>`, no serial number column, and bulk carry-forward.
- **Tab 2 (Zero-Due / Settled)**: Has no checkboxes, "Student Name" column, no serial number column, and no bulk actions.
- **Tab 3 (Carried Forward)**: Has no checkboxes, "Student Name" column, no serial number column, and only single-voucher undo buttons.

### Agreed User Preferences:
1. **Drop Father Name**: Remove Father Name column and subtitles across all tabs so all three display a clean, consistent "Student Name" column (Avatar + Name + Roll/Reg #).
2. **Serial Numbers (Sr #)**: Add a dedicated `Sr #` column across all three tabs, formatted with page-relative numbering starting from 1 on each page (`index + 1`).
3. **Checkboxes on All Tabs**: Provide selection checkboxes on all three tabs with header "Select All Visible" (including indeterminate state) and selection counters.
4. **Tab-Specific Bulk Actions**:
   - **Tab 1 (Unpaid Defaulters)**: Carry Forward Selected, Print List, Export List (CSV).
   - **Tab 2 (Zero-Due / Settled)**: Print List, Export List (CSV).
   - **Tab 3 (Carried Forward)**: Print List, Bulk Undo Carry Forward (with downstream validation modal).

---

## 2. Standardized Table Architecture & Column Geometry

All three tabs will share the exact same structural grid for common identifiers:

| Col # | Header | Width | Alignment | Description |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Checkbox | `w-10` | Center | Row selector with header indeterminate toggle |
| 2 | `Sr #` | `w-12` | Center | Tabular page-relative counter (`index + 1`) in `text-slate-500 font-mono text-[11px]` |
| 3 | `Voucher #` | `w-28` | Left | Mono badge `bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60` |
| 4 | `Student Name` | Flex | Left | Avatar (`size="sm"`) + Name (`font-bold text-slate-900`) + Roll/Reg (`text-[11px] text-slate-500`) |
| 5 | `Class` | `w-24` | Left | Class badge in `bg-slate-100 text-slate-800` |
| 6–8 | *Tab Specific Metrics* | Right | Right | Tabular figures (Net Due/Paid/Outstanding vs Gross/Concession/Net vs Carried/Month/Fine) |
| 9 | `Actions` | Auto | Right | Single action buttons (`Collect`, `Carry`, `Details`, `Undo`) |

---

## 3. Bulk Action Workflows & State Management

### A. Isolated Selection State Across Tabs
- Switching tabs (`activeTab` changed) immediately clears `selectedIds` (`setSelectedIds([])`) so selections do not bleed across different tabs.
- Selection counter banner adapts dynamically:
  - Tab 1: `{selectedIds.length} of {defaulterVouchers.length} defaulters selected`
  - Tab 2: `{selectedIds.length} of {zeroDueVouchers.length} zero-due records selected`
  - Tab 3: `{selectedIds.length} of {carriedVouchers.length} carried vouchers selected`

### B. Bulk Operations by Tab
1. **Unpaid Defaulters**:
   - `Carry Forward Selected ({selectedIds.length})` (triggers `CarryForwardModal`)
   - `Print List`: Formats a clean printable statement of selected defaulters.
   - `Export CSV`: Downloads CSV with Voucher #, Student Name, Roll/Reg, Class, Net Due, Paid, Outstanding.
2. **Zero-Due / Settled**:
   - `Print List`: Formats printable summary of selected concession / zero-due students.
   - `Export CSV`: Downloads CSV with Voucher #, Student Name, Roll/Reg, Class, Gross, Concession, Net Due, Status.
3. **Carried Forward**:
   - `Bulk Undo Carry Forward ({selectedIds.length})`:
     - Checks downstream voucher conflicts for all selected items.
     - Confirms restoration in a dedicated bulk undo modal with a summary of valid vouchers vs blocked vouchers.
     - Safely restores valid carried vouchers to their original status (`Issued` or `Partial`) and refreshes ledger state.
   - `Print List`: Formats printable report of carried-forward vouchers.

---

## 4. Proposed Changes to `src/components/DefaultersView.tsx`

1. **State & Helpers**:
   - Add `bulkUndoModal` state and handler to safely process multiple undo operations.
   - Add `handleExportSelectedCsv()` utility formatted for each active tab's data schema.
   - Add `handlePrintSelected()` utility triggering print styles for selected records.
   - Clear `selectedIds` on tab switch (`setActiveTab`).
2. **Header & Column Standardization**:
   - Add `Sr #` header and cell column across Tab 1, Tab 2, and Tab 3 (`index + 1`).
   - Add Checkbox column header and cell across Tab 2 and Tab 3.
   - Clean up Student column in all 3 tabs: remove `fatherName` so only Student Avatar, Name, and Roll/Reg are displayed.
3. **Banner Upgrades**:
   - Extend the selection banner to render tailored buttons for Tab 2 (Print + Export CSV) and Tab 3 (Print + Bulk Undo).

---

## 5. Verification Plan

1. **Compilation**: Run `compile_applet` and `lint_applet` to ensure zero TypeScript errors or missing imports.
2. **Visual Consistency Check**:
   - Verify all 3 tabs have identical Checkbox, Sr #, Voucher #, Student Name, and Class column layout.
   - Verify Father Name is cleanly omitted across all 3 tabs.
   - Verify Sr # starts at 1 on each page.
3. **Functional Workflow Check**:
   - Select multiple zero-due vouchers -> verify Export CSV and Print List.
   - Select multiple carried vouchers -> verify Bulk Undo modal and execution.
   - Select multiple unpaid defaulters -> verify existing Carry Forward and new Print/Export options.
