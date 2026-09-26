# Implementation Plan: Dynamic Capacity & CSV B-Form Duplicate Validation

Remove arbitrary hardcoded server-side query ceilings (such as 500 or 10,000) so that institutions of any size load dynamically and completely, and flag duplicate B-Forms (such as ID 1553 matching ID 1181) during CSV preview.

---

## 1. Confirmation: Dashboard Card & Full Roster Counters

**Confirmed**: The **Dashboard "Enrolled Students" card** (`activeStudents.length`), along with all other roster counters across the application, will show the **actual, full count of students** (e.g., 542+) instead of the 500 it currently displays.

### Why it currently displays 500:
1. In `src/components/DashboardView.tsx`, the Enrolled Students card renders `{activeStudents.length.toLocaleString()} Students`.
2. `activeStudents` is computed directly from `students` loaded into `AppContext` via `fetchServerState() -> GET /api/students`.
3. In `server/db.ts` (`searchStudents`), line 1922 clamped all query results to `Math.min(500, pageSize)`.
4. As a result, the backend only returned 500 student objects to the browser.
5. This artificially reduced the count in:
   - **Dashboard**: "Enrolled Students" card (showed 500).
   - **Students View**: Header roster badge and total student count (showed 500).
   - **Students View Pagination**: Total records for "All records", 25, 50, 100 pages.
   - **Class Breakdown**: Student distribution and headcount per class.
   - **Transport & Fee Views**: Active student counts.

Lifting the server query clamp dynamically delivers all student records to the frontend state, which automatically updates the Dashboard card and all full roster counters to the true total.

---

## 2. Proposed Changes

### A. Dynamic, Unbounded Data Retrieval on Server (`server/db.ts` & `server.ts`)
- **Remove Arbitrary Clamping**:
  - In `server/db.ts` (`searchStudents`):
    - Remove the hardcoded `Math.min(500, ...)` clamp.
    - If `opts.pageSize` is provided, respect that requested value without an artificial ceiling.
    - If `opts.pageSize` is omitted or unpaged full-roster retrieval is requested, do not append a `LIMIT` clause so that all records for the institution are returned dynamically.
  - Review and align `listVouchers`, `listCollections`, `listTransactions`, `listAuditLogs`, and `listStudentAccountHistory` to remove arbitrary upper clamping bounds when fetching institution records.
- **Client Sync Cleanliness (`src/services/apiSync.ts`)**:
  - Update `fetchServerState()` in `src/services/apiSync.ts` to request full institution state without passing arbitrary query parameter limits (`?pageSize=5000`), allowing the server to stream the full dataset dynamically.

### B. CSV Preview B-Form Duplicate Detection (`src/components/StudentsView.tsx`)
- **No Inline Edit Revalidation**: Keep the table clean and straightforward without complex inline revalidation.
- **Pre-Import Duplicate Detection**:
  - During the initial CSV parsing loop in `src/components/StudentsView.tsx`:
    - Track seen B-Forms in `seenBFormInFile` (ignoring empty/unassigned B-Forms).
    - Check if a student's `bFormNo` already exists in the current system `students` or was already encountered in an earlier row of the same CSV file.
    - If duplicate: mark `isDuplicate = true` with a clear explanation identifying the conflict (e.g., `"B-Form 37203-7425695-5 duplicated in CSV (already in row for Abdul Ahad)"`).
    - Uncheck duplicate rows by default so they appear under the **Duplicates** and **Issues** filter tabs for user review prior to saving.

---

## 3. Verification & Scope

1. **Compilation Only**:
   - Run `compile_applet` and verify zero TypeScript, Vite bundler, or syntax errors.
   - Run `lint_applet` to verify clean code hygiene.
2. **No Data Testing by Agent**:
   - As directed, the agent will **not** seed, test, or modify live user data. All data verification and CSV upload testing will be conducted directly by the user.
