# Implementation Plan: Fix Single Student Voucher Generation Preview Behavior

## 1. Problem Diagnosis & Scope

### Root Cause
In `src/components/VouchersView.tsx`, when the operator opens the Voucher Generator modal with the "Single Student Only" scope:
1. Selecting a student from the search combobox triggers:
   ```tsx
   handleSingleStudentChange(s.id);
   setSingleStudentSearchQuery(`${s.name} (${s.regNo})`);
   setIsSingleStudentComboOpen(false);
   ```
2. In `handleSingleStudentChange`:
   ```tsx
   const handleSingleStudentChange = (studentId: string) => {
     setSelectedSingleStudentId(studentId);
     const { data, selected } = buildGeneratorPreview('student', scopeClassId, targetMonth);
     setPreviewsData(data);
     setSelectedGenStudentIds(selected);
   };
   ```
3. Because `setSelectedSingleStudentId(studentId)` is an asynchronous React state updater, `buildGeneratorPreview` immediately executes in the same tick using the stale closure state of `selectedSingleStudentId` (which was initially `''`). As a result:
   - `previewVoucherGeneration` runs with an empty array `[]`, producing 0 preview rows while the student's name is in the search box.
4. When the operator subsequently clicks the clear `X` button on the search box, `handleSingleStudentChange('')` executes. At this moment, `selectedSingleStudentId` holds the previously selected student's ID from the previous render, causing the preview to only generate and display **after** clearing the name from the search box.
5. Furthermore, clearing the search box fails to empty the preview table because of the same inverted state lag.

### Desired Behavior
- When a student is selected from the combobox dropdown:
  - The student's name and registration number remain visible in the search field.
  - The voucher calculation, breakdown, and preview table row display immediately.
- When the student name is removed from the search field (clicking `X` or clearing input):
  - The preview table rows and summary figures immediately clear to empty (`0 vouchers`).

---

## 2. Proposed Changes

### `src/components/VouchersView.tsx`

1. **Refactor `buildGeneratorPreview` to Accept an Optional `studentIdOverride`**:
   Update `buildGeneratorPreview` so it can be passed an explicit student ID rather than relying solely on asynchronous component state:
   ```tsx
   const buildGeneratorPreview = (
     newScope: typeof scope,
     newClassId: string,
     newMonth: string,
     studentIdOverride?: string
   ) => {
     let data: ReturnType<typeof previewVoucherGeneration>;
     const effectiveStudentId = studentIdOverride !== undefined ? studentIdOverride : selectedSingleStudentId;
     if (newScope === 'student') {
       data = previewVoucherGeneration(
         newMonth,
         'students',
         undefined,
         effectiveStudentId ? [effectiveStudentId] : []
       );
     } else {
       data = previewVoucherGeneration(newMonth, newScope, newClassId);
     }
     let selected: string[] = [];
     if (newScope === 'student') {
       selected = effectiveStudentId ? [effectiveStudentId] : [];
     } else {
       selected = data.previews
         .filter((p) => !p.isAlreadyGenerated && !p.isBlockedByPriorRule && !p.isBlockedBySkippedRule && !p.isBeforeFirstBillingMonth)
         .map((p) => p.student.id);
     }
     return { data, selected };
   };
   ```

2. **Pass Explicit `studentId` in `handleSingleStudentChange`**:
   ```tsx
   const handleSingleStudentChange = (studentId: string) => {
     setSelectedSingleStudentId(studentId);
     const { data, selected } = buildGeneratorPreview('student', scopeClassId, targetMonth, studentId);
     setPreviewsData(data);
     setSelectedGenStudentIds(selected);
   };
   ```

3. **Synchronize Search Input and Clear Handlers**:
   - When a student is clicked in the dropdown:
     ```tsx
     onClick={() => {
       handleSingleStudentChange(s.id);
       setSingleStudentSearchQuery(`${s.name} (${s.regNo})`);
       setIsSingleStudentComboOpen(false);
     }}
     ```
     Immediately generates the preview for `s.id` and populates the search query.
   - When the user clears the search query (clicking `X` button):
     ```tsx
     onClick={() => {
       setSingleStudentSearchQuery('');
       handleSingleStudentChange('');
       setIsSingleStudentComboOpen(false);
     }}
     ```
     Immediately clears the preview rows to empty.
   - When typing in the input:
     Ensure typing to search candidates opens the combobox without triggering inverted previews. If the input is completely emptied via backspace/delete, call `handleSingleStudentChange('')` so the preview rows clear immediately.

---

## 3. Verification & Testing Plan

1. **Selection Verification**:
   - Open Vouchers View -> Click "Generate Vouchers".
   - Switch "Scope" to "Single Student Only".
   - Verify initial state: Preview table is empty, showing a clear indicator to search and select a student.
   - Type in the search box to find a student and select them from the dropdown list.
   - Verify: The student's name and registration number remain in the search field, and their voucher calculation/preview row immediately renders.
2. **Clear / Reset Verification**:
   - Click the `X` icon inside the search input.
   - Verify: The input clears and the preview table immediately resets to empty with 0 selected students.
   - Re-select another student to confirm seamless re-selection.
3. **Compilation & Type Safety**:
   - Run `lint_applet` to verify TypeScript compile integrity with no regressions.
   - Run `compile_applet` to ensure successful build.
