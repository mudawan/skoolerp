# Transactional Database Action Locking & Atomic Batch Processing

Locks user actions and navigation during in-process database operations with a centered progress modal, and upgrades bulk carry-forward to a single atomic database batch transaction to eliminate race conditions and rollback flickers.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions were confirmed based on your selections:

- **Action Lock Presentation**: Centered progress modal with a visual progress bar, active counter (`Saving X of Y records`), and full background interaction lock until server persistence is verified.
- **Lock Scope**: Targeted to high-volume and sensitive financial workflows: Defaulter balance carry-forwards, monthly voucher generation billing, bulk CSV collections, and month-end fee book locking/unlocking.
- **Backend Batch Endpoint**: Implements a dedicated atomic batch endpoint (`/api/vouchers/carry-forward-batch`) on the server. Instead of firing 140+ individual transactional HTTP requests with separate locks, the entire batch runs inside a single atomic database transaction, returning updated vouchers instantly with zero interim partial states.

---

## 1. Overview & Core Concept

When a user carries forward balances for over a hundred defaulters, the previous implementation treated the UI update optimistically while launching dozens of asynchronous HTTP requests in the background without locking user interactions. If the user navigated to the Month End Checklist or Lock Fee Book tab while background writes were still processing, real-time sync listeners or periodic polling loaded partial database snapshots where some records had not yet finished saving. This produced a confusing temporary rollback (e.g. 2 pending defaulters reappearing and then vanishing).

This update introduces:
1. **Atomic Batch Server Processing**: A high-performance batch endpoint that executes all carry-forward operations in a single database transaction in a fraction of a second.
2. **Central Database Action Lock**: A global modal overlay that safely guards user navigation and action clicks while financial database operations or sync queues are actively in flight.
3. **Sync Snapshot Guard**: Suppresses remote snapshot overwrites during active local transactional commits until the full batch write is confirmed.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Initiating Bulk Defaulter Carry-Forward**:
   - The user selects defaulters (or clicks "Carry Forward All Defaulters") in the Month End Wizard or Defaulters View.
   - Upon clicking "Execute Carry Forward", the **Database Action Lock Modal** appears centered over the screen with a darkened translucent backdrop (`bg-slate-900/60 backdrop-blur-xs`).
   - A sleek progress bar smoothly animates with live status copy:
     - `Carrying forward 140 defaulters to November 2026...`
     - Tabular counter displaying `Processing records: 140 / 140`
     - Subtitle: `Writing atomic ledger updates to PostgreSQL. Please wait...`
   - Navigation links, sidebar tabs, and page buttons are completely non-interactive while the lock is active.
   - Once the server confirms the batch commit, the modal transitions to a brief checkmark confirmation (`✓ 140 defaulters carried forward successfully`) and gracefully closes, releasing the view.

2. **Month End Checklist & Lock Fee Book Consistency**:
   - When the user transitions from the Defaulters section to the Lock Fee Book tab, the local state and server database are 100% synchronized.
   - Zero "pending defaulter" ghost records or rollback flickers appear because the server completed all mutations before the user could navigate.
   - If the user clicks "Lock Month", the action lock modal activates briefly to persist the month lock and snapshot the ledger state safely before advancing.

### Visual Design & Modal Specifications

- **Container**: Compact, focused dialog (`max-w-md w-full`) styled with neutral dark slate styling (`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6`).
- **Progress Bar**: High-contrast animated progress track (`h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden`) with a smooth emerald/indigo gradient fill (`transition-all duration-300 ease-out`).
- **Tabular Figures**: Numeric counters use `font-mono tabular-nums` to eliminate layout jitter during high-speed count updates.
- **Zero Pill Discipline**: Status metadata rendered as clean text with typographic separators (`140 Vouchers · 0 Errors · Atomic Transaction`).

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Dedicated Atomic Batch Endpoint vs. Client Progress Loop
- **Chosen Approach**: Build `/api/vouchers/carry-forward-batch` in `server.ts` that takes an array of voucher IDs, locks the collection once, computes all balance forwards and arrears additions, recalculates chains, writes in one commit, and logs an aggregated audit entry.
- **Why**: Firing 140 individual POST requests causes HTTP connection saturation, serial lock contention in PostgreSQL/SQLite, and unpredictable completion times (up to 15 seconds). A single atomic endpoint finishes in under 300ms, guarantees all-or-nothing transactional integrity, and emits a single revision increment.
- **Alternatives Considered**: Keeping individual requests and running them through a client-side concurrency pool (e.g. 5 concurrent requests). While easier on the server, it still exposes interim partial states and is significantly slower.

### Decision 2: Centralized Action Lock State in `AppContext`
- **Chosen Approach**: Introduce `actionLock: { active: boolean; title: string; current: number; total: number; message?: string } | null` into `AppContext`, exposed as `startActionLock()` and `updateActionLock()`.
- **Why**: Allows any view (Defaulters View, Month End Wizard, Voucher Generator, Collections) to engage the standardized locking UI without reinventing local spinners or disabling dozens of buttons individually.
- **Safety Guarantee**: Unlocks automatically in `finally` blocks, with an escape safety timeout (30 seconds) to prevent any possibility of a permanent frozen screen in the event of an unhandled network error.

---

## 4. Technical Architecture & Data Strategy

### System & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                                │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │ DefaultersView /      │             │ DatabaseActionLockModal    │  │
│  │ MonthEndWizardPanel   │             │ (Full-screen backdrop,     │  │
│  │ User clicks "Execute" │             │  progress bar & counter)   │  │
│  └──────────┬────────────┘             └─────────────▲──────────────┘  │
│             │                                        │                 │
│             │ 1. trigger bulkCarryForwardDefaulters()│                 │
│             ▼                                        │ 2. show lock    │
├─────────────┼────────────────────────────────────────┼─────────────────┤
│             │                                        │                 │
│  AppContext │                                        │                 │
│             ├────────────────────────────────────────┘                 │
│             │ 3. POST /api/vouchers/carry-forward-batch                │
│             │ 4. Suppress SSE remoteUpdate snapshots during lock       │
│             ▼                                                          │
│  apiSync.ts ───► fetch('/api/vouchers/carry-forward-batch')            │
├───────────────────────────────────────┬────────────────────────────────┤
│ SERVER (server.ts)                    │                                │
│                                       │                                │
│  app.post('/api/vouchers/carry-forward-batch')                         │
│    │                                                                   │
│    ▼                                                                   │
│  dbService.runVoucherTransaction(instId, { allVouchers: true })       │
│    │                                                                   │
│    ├── Find all source vouchers & calculate outstanding balances       │
│    ├── Fold previous balances / late fines into target vouchers        │
│    ├── Mark all sources as 'Carried' with targetMonth                  │
│    ├── Recalculate student voucher sequences atomically               │
│    └── Commit single transaction & increment revision once             │
│    │                                                                   │
│    ▼                                                                   │
│  Response: { success: true, updatedVouchers, count: 140 }             │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Plan

1. **Server Route (`server.ts`)**:
   - `POST /api/vouchers/carry-forward-batch`:
     - Accepts: `{ voucherIds: string[], targetMonth: string, addLateFine: boolean, customFineAmount?: number, perVoucherFines?: Record<string, number> }`
     - Validates input and user authorization (`requireAuth('defaulters.manage')`).
     - Executes within `dbService.runVoucherTransaction(institutionId, { allVouchers: true })`.
     - Returns `{ success: true, count, sourceVouchers, targetVouchers, updatedVouchers }`.
     - Emits single broadcast event `vouchers_bulk_carried`.

2. **Client Service (`src/services/apiSync.ts`)**:
   - Export `apiCarryForwardBatch(...)`.
   - Add temporary suppression flag in SSE message handler so incoming revisions don't overwrite local state while an action lock is actively processing.

3. **Application Context (`src/context/AppContext.tsx`)**:
   - Add `actionLockState` and controls:
     ```ts
     interface ActionLockState {
       active: boolean;
       title: string;
       current: number;
       total: number;
       message?: string;
     }
     ```
   - Refactor `bulkCarryForwardDefaulters` to be `async`:
     - Activates action lock: `startActionLock('Carrying Forward Defaulters', 0, ids.length)`.
     - Calls `apiCarryForwardBatch(...)`.
     - Updates local `vouchers` state with the verified server-returned vouchers.
     - Releases action lock.
   - Refactor Month End lock/unlock and voucher generation to utilize `startActionLock`.

4. **UI Modal Component (`src/components/DatabaseActionLockModal.tsx`)**:
   - Mounts at the root in `src/App.tsx`.
   - Renders a clean, accessible backdrop with progress animation, tabular counter, and descriptive status text.
   - Traps keyboard/tab focus and blocks pointer events to guarantee background actions cannot be triggered.
