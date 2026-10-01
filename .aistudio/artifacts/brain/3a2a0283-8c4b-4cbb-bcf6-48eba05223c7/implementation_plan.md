# Scalable & Monotonic Fee Voucher Numbering — Step-Wise Execution Plan

Break down the Scalable & Monotonic Fee Voucher Numbering Architecture into discrete, bite-sized activities to eliminate build failures, prevent token exhaustion, and guarantee 100% compilation safety in Docker.

---

## Directives & System Invariants

1. **Silent Reissuance (Zero Rejections)**: The backend never rejects duplicate voucher numbers; it silently reissues the next monotonic sequence number and returns the updated voucher record.
2. **Monotonic Audit Permanence**: Deletion never rolls back the sequence counter.
3. **O(1) Scalability**: Instant allocation via atomic block reservation; zero looping across historical records.
4. **Multi-User Consistency**: Atomic server reservation ensures concurrent operators never collide.
5. **Compilation Guardrail**: Run `lint_applet` and `compile_applet` after every single step before moving to the next.

---

## Activity Breakdown

### Activity 1: Core Sequence Engine & Strict Regex Parser (`src/utils/sequence.ts` & `src/services/apiSync.ts`)
- **Objectives**:
  - Implement `parseDocumentNumber(docNo)` using regex `/^([A-Za-z]+)(\d{4})-(\d+)$/` to accurately extract prefix, 4-digit year, and numeric counter without string truncation bugs.
  - Implement tenant-aware persistent client high-water mark storage (`skooler_seq_hwm_v1`) to prevent sequence reset on page refresh.
  - Implement $O(1)$ batch allocation function `allocateDocumentNumbers(prefix, year, count, digits)` that advances the sequence by `count` in a single step with zero historical scans.
  - Add non-rollback protection: deletions or missing vouchers never decrement the high-water mark.
  - Extend `src/services/apiSync.ts` to support batch sequence reservation (`apiNextDocumentBlock`).
- **Files Modified**:
  - `src/utils/sequence.ts`
  - `src/services/apiSync.ts`
- **Verification**:
  - Run `lint_applet` (`tsc --noEmit`) and `compile_applet` (`vite build && esbuild server.ts`).

---

### Activity 2: Central Database Atomic Allocator & Server Silent Reissuance (`server/db.ts` & `server.ts`)
- **Objectives**:
  - In `server/db.ts`: Add `nextSequenceBlock(institutionId, prefix, year, count)` for atomic block reservation in PostgreSQL (`UPDATE system_sequences SET last_value = last_value + $count ... RETURNING last_value`) and in-memory fallback.
  - In `server/db.ts`: Add `mintDocumentNumberBlock(institutionId, prefix, year, count, digits)`.
  - In `server.ts`: Update `POST /api/sequences/next` to accept `{ count?: number }` for batch reservation.
  - In `server.ts`: Update `/api/vouchers/generate`:
    - Detect any colliding `voucherNo` against existing tenant vouchers in $O(1)$ via Set lookup.
    - If a collision occurs or `voucherNo` is missing/temporary, **silently reissue** using `helpers.mintDocumentNumber` instead of failing.
    - Return the created vouchers array containing authoritative voucher numbers.
- **Files Modified**:
  - `server/db.ts`
  - `server.ts`
- **Verification**:
  - Run `lint_applet` and `compile_applet` to ensure esbuild server bundling and TypeScript types pass cleanly.

---

### Activity 3: Client State Integration (`src/context/AppContext.tsx`)
- **Objectives**:
  - In `applyServerState`: reconcile the high-water mark counter with the highest voucher/collection/transaction numbers loaded from PostgreSQL.
  - In `commitVoucherGeneration`: use `allocateDocumentNumbers('FE', yearStr, count)` for instantaneous $O(1)$ allocation of candidate numbers.
  - Handle backend response in `commitVoucherGeneration`: when `apiGenerateVouchers` returns, reconcile local voucher state with any reissued voucher numbers returned by the server.
  - Update `buildAdmissionVoucher` and `carryForwardDefaulter` to allocate voucher numbers through the monotonic allocator.
- **Files Modified**:
  - `src/context/AppContext.tsx`
- **Verification**:
  - Run `lint_applet` and `compile_applet`.

---

### Activity 4: End-to-End Validation & Docker Build Certification
- **Objectives**:
  - Run full clean compilation check.
  - Validate voucher generation workflows:
    - Monthly batch voucher generation (single and bulk classes).
    - Admission voucher generation.
    - Defaulter carry-forward voucher generation.
    - Voucher deletion (verify sequence counter does not roll back or reuse deleted numbers).
    - Simulated duplicate submission (verify backend silently reissues without rejecting).
- **Files Modified**:
  - Documentation / verification scripts if needed.
- **Verification**:
  - Run `compile_applet` to confirm the production bundle (`dist/server.cjs` and Vite assets) builds cleanly without error.
