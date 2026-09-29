# Scalable & Monotonic Fee Voucher Numbering Architecture (Revised)

Delivers strictly unique, monotonic, non-colliding fee voucher numbering across sessions, users, and workflows using an **O(1)** atomic sequence allocator and backend silent reissuance.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following requirements and user directives govern this revised architecture:

- **Confirmed Directive 1 (Silent Reissuance, No Rejections)**: If a backend endpoint detects a duplicate or colliding voucher number, it **must not reject** the request. Instead, it will automatically reissue the next monotonic voucher number from the sequence, commit the voucher, and return the updated voucher record to the client.
- **Confirmed Directive 2 (Monotonic Audit Permanence)**: When a fee voucher is deleted, its number is permanently retired. The sequence counter never rolls backwards or reuses deleted voucher numbers.
- **Confirmed Directive 3 (Zero Historical Voucher Scan / O(1) Scalability)**: Allocation will **not** loop through historical vouchers. The system will use an O(1) monotonic counter (advancing `last_value` by `N` in a single operation), ensuring identical instant performance whether generating vouchers in 2026 or 2036 with 50,000+ historical records.
- **Confirmed Directive 4 (Multi-User Cognizance)**: Atomic reservation on the central server sequence prevents duplicate numbers between multiple concurrent operators and across sessions.

---

## 1. Evaluation & Engineering Feedback

### 1. Eliminating Historical Scans (O(1) vs. O(N × M))
The user's critique is completely accurate: looping candidate numbers against all historical vouchers creates an $O(N \times M)$ bottleneck (e.g. 500 batch vouchers compared against 60,000 historical records = 30 million comparisons).

In standard database systems (e.g., PostgreSQL sequences, Oracle sequences), sequence generation is strictly **$O(1)$**:
- We maintain a single scalar integer: `last_issued_number` per tenant, prefix, and year.
- For a single voucher: `next = ++last_issued_number`.
- For a batch of $N$ vouchers: `start = last_issued_number + 1`, `last_issued_number += N`. All $N$ numbers `[start, ..., start + N - 1]` are allocated in a single atomic step without examining past records.

### 2. Multi-User & Multi-Session Cognizance
Because multiple operators may be logged in simultaneously or one operator may switch tabs/devices:
- Client-side local heap memory cannot be the sole source of truth.
- When committing vouchers (`/api/vouchers/generate` or `/api/vouchers/batch-update`), the central server atomically reserves the required sequence block using `UPDATE system_sequences SET last_value = last_value + $count RETURNING ...`.
- If the client generated optimistic/temporary numbers locally, the server verifies them in $O(1)$ against its atomic sequence; if any number is already taken or invalid, it **silently reissues** the next available numbers without rejecting.

---

## 2. Technical Architecture & System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   O(1) MONOTONIC VOUCHER NUMBER ALLOCATION                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Workflow (Batch Monthly, Single Admission, or Defaulter Carry-Forward)
                                     │
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Client Generation Layer                         │
  │                                                                         │
  │  • Assigns monotonic candidate numbers: FE<YYYY>-<PaddedCounter>        │
  │  • Counter maintained via persistent high-water mark                    │
  │  • O(1) increment: no historical array looping                          │
  └──────────────────────────────────┬──────────────────────────────────────┘
                                     │ (POST /api/vouchers/generate)
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                       Server Transactional Ingestion                    │
  │                                                                         │
  │  1. Check incoming voucher numbers in tenant transaction scope.         │
  │  2. If unique & valid:                                                  │
  │     Accept number, advance sequence high-water mark past it.            │
  │  3. If duplicate or missing (DIRECTIVE APPLIED):                        │
  │     DO NOT REJECT.                                                      │
  │     Atomically mint next monotonic sequence number(s).                  │
  │     Assign new number to voucher.                                       │
  │  4. Save to database & return created vouchers to client.               │
  │  5. Client state automatically reflects authoritative reissued numbers.  │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: O(1) Batch Block Reservation**
  - *Chosen Approach*: For batch generation of $K$ vouchers, the sequence table increments by $K$ in one database statement (`last_value = last_value + K`).
  - *Why*: Instantaneous allocation regardless of database size, zero CPU overhead in 2036.

- **Decision 2: Backend Silent Reissuance Policy**
  - *Chosen Approach*: When a duplicate voucher number is submitted, the server replaces it with a newly minted sequence number and responds with `{ success: true, vouchers: [...] }`.
  - *Why*: Guarantees user operations never fail with jarring 400 errors or duplicate key exceptions, while ensuring the database remains 100% collision-free.

- **Decision 3: Persistent Client Sequence Cache**
  - *Chosen Approach*: Synchronize the client's current high-water mark with browser storage (`skooler_seq_hwm_v1`) scoped to the active tenant and prefix/year, updating whenever the server returns state or new vouchers.
  - *Why*: Prevents new tabs, session timeouts, or page refreshes from restarting back at `000001`.

- **Decision 4: Corrected Regex Document Parser**
  - *Chosen Approach*: Document numbers are parsed via `/^([A-Za-z]+)(\d{4})-(\d+)$/`, reading the exact numeric digits after the hyphen (`FE2026-000042` -> prefix `FE`, year `2026`, number `42`).
  - *Why*: Fixes the truncation bug where numbers were previously parsed as `26`.

---

## 4. Implementation Steps

1. **Refactor `src/utils/sequence.ts`**:
   - Implement persistent high-water mark storage per tenant and prefix/year.
   - Implement strict regex parser (`parseDocumentNumber`).
   - Implement $O(1)$ batch allocation: `allocateDocumentNumbers(prefix, year, count, digits)`. No array scanning.
   - Ensure the high-water mark never rolls back upon voucher deletions.

2. **Update App Context Handlers in `src/context/AppContext.tsx`**:
   - In `applyServerState`: reconcile the high-water mark with the highest number observed from PostgreSQL.
   - In `commitVoucherGeneration`, `buildAdmissionVoucher`, and `carryForwardDefaulter`: allocate numbers using the $O(1)$ monotonic allocator.
   - When `apiGenerateVouchers` returns, update client state with any silently reissued voucher numbers returned by the server.

3. **Update Server Ingestion in `server.ts` & `server/db.ts`**:
   - In `/api/vouchers/generate`, check for existing `voucher_no` in the institution. If any voucher collides or is unassigned, **silently reissue** using `helpers.mintDocumentNumber` instead of rejecting.
   - Update `dbService.nextSequenceNumber` and add `dbService.nextSequenceBlock(count)` for atomic batch reservation in PostgreSQL and in-memory fallback.
   - Ensure `POST /api/sequences/next` supports batch count for multi-user coordination.

4. **Verification & Build**:
   - Validate with `compile_applet` and `lint_applet`.
   - Verify multi-session voucher generation, cross-workflow creations, and voucher deletion without number recycling or duplicate generation.
