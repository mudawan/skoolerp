# Server-Authoritative Atomic Voucher Numbering Plan

Guarantee strictly unique, non-duplicating voucher numbers across all browser sessions, user workflows, and concurrent operations by minting voucher numbers through PostgreSQL atomic sequences on the server, while preserving historical numbers and reconciling sequence start values to avoid collisions.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified with the user:
> - **Existing Vouchers**: Keep existing voucher numbers unchanged without retroactively rewriting historical data.
> - **Number Minting Authority**: Mint new voucher numbers strictly on the server side using atomic PostgreSQL sequences (`system_sequences` table) rather than relying on ephemeral client-side memory or local caches.

- **Confirmed Decision 1**: Server-side transactional voucher generation (`/api/vouchers/generate`) will always mint atomic numbers using `helpers.mintDocumentNumber('FE', yearStr)` when saving, ignoring or replacing any non-unique client-suggested numbers.
- **Confirmed Decision 2**: Automatic sequence high-water-mark reconciliation upon server boot and collection hydration will ensure the next sequence value is strictly greater than the maximum voucher number currently in the database.
- **Confirmed Decision 3**: Client-side single voucher creation and carry-forward flows will fetch the atomic number from `/api/sequences/next` or generate via server transaction, eliminating in-memory counter resets between browser tabs and page reloads.

---

### 1. Overview & Root Cause Analysis

- **The Problem**: Voucher numbers (e.g. `FE2026-000001`) duplicated across browser sessions, tabs, and workflow runs.
- **Root Cause Identified**:
  1. **Client-Side Counter Reset**: The client maintained an in-memory map `memoryMap: Record<string, number> = {}` that reset to 0 whenever the page refreshed or opened in a new tab/session.
  2. **Failed Sequence Reconciliation**: On client mount, `reconcileSequence` ran against empty arrays because vouchers had not yet arrived from the server. Furthermore, the number parser had an offset bug: `parseInt(docNo.slice(prefix.length + 1), 10)` sliced `FE2026-000001` to `026-000001`, always returning `26` rather than `1`.
  3. **Server Route Accepted Client Number**: The `/api/vouchers/generate` endpoint accepted client-provided `item.voucherNo` if not starting with `TEMP_`, committing duplicate numbers produced by reset client counters.
- **The Solution**: Transition to 100% server-authoritative atomic sequences in PostgreSQL with automatic high-water-mark seeding.

---

### 2. User Experience & Workflow Integrity

#### Key User Flows
1. **Bulk Voucher Generation (`VouchersView.tsx`)**:
   - The user selects a billing month and classes to generate.
   - The preview table displays provisional indicators or temporary preview tags (`TEMP_FE2026-...` or student reference).
   - Upon confirming generation, the backend transaction assigns guaranteed atomic consecutive numbers from PostgreSQL (`system_sequences`).
   - The returned vouchers display unique IDs that will never collide even if generated from multiple browser tabs or independent sessions.
2. **Carry-Forward Creation**:
   - When carrying forward unpaid balances to a target month, the created voucher obtains its number from the atomic sequence.
3. **Session Switching & Refreshing**:
   - Refreshing the browser or opening the application in multiple workstations will never reset or re-issue previously used voucher numbers.

---

### 3. Key Product Decisions & Architecture

- **PostgreSQL Atomic Sequences**:
  - Uses `INSERT INTO system_sequences ... ON CONFLICT DO UPDATE SET last_value = system_sequences.last_value + 1 RETURNING last_value` inside transactions to prevent race conditions.
- **High-Water-Mark Reconciliation on Server Boot**:
  - The server inspects existing vouchers in PostgreSQL on startup or sequence initialization and sets `last_value = GREATEST(last_value, max_existing_number)`. This ensures that even with existing numbers, the sequence never issues an already existing number.
- **Client Fallback Hardening**:
  - Fix the client-side `parseDocumentNumber` helper to correctly extract the numerical suffix (e.g. from `FE2026-000042` -> `42`) and trigger client reconciliation whenever server state is hydrated.

---

### 4. Technical Implementation Steps

#### System Architecture & Flow

```
┌────────────────────────────────────────┐
│             Web Client                 │
│  - Sends generation request            │
│  - No longer mints hardcoded numbers   │
└───────────────────┬────────────────────┘
                    │ POST /api/vouchers/generate
                    ▼
┌────────────────────────────────────────┐
│       Server (server.ts / db.ts)       │
│  1. Run inside transactional lock      │
│  2. helpers.mintDocumentNumber('FE')   │
│  3. Atomic PostgreSQL increment        │
│     (system_sequences table)           │
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│         PostgreSQL Database            │
│  - Stores unique voucherNo             │
│  - Guaranteed monotonically unique     │
└────────────────────────────────────────┘
```

#### Files to be Modified:
1. **`server/db.ts`**:
   - Add high-water mark sequence reconciliation at startup to scan existing `fee_vouchers` and ensure `system_sequences` starts above any existing numbers.
2. **`server.ts`**:
   - In `/api/vouchers/generate`, always mint new voucher numbers via `helpers.mintDocumentNumber('FE', yearStr)` for new vouchers, ensuring server authority.
3. **`src/utils/sequence.ts` & `src/context/AppContext.tsx`**:
   - Fix `parseNum` string slicing so `FE2026-000042` correctly parses to `42`.
   - Call sequence reconciliation in `applyServerState` when vouchers arrive from the API.
   - Use `TEMP_` or fetch atomic numbers for client-initiated single creations so the server assigns the final number.
