# Bank Statement Collections Loader — handover

**Flow:** upload statement (PDF/CSV/XLSX) for a fee month → adapter parses → credits staged (fingerprint-deduplicated) → assign students (keyboard UI, suggestions) → "Review & apply" posts normal fee collections through the existing fee engine (`server/collections-core.ts` → `runVoucherTransaction`), atomically with the row status change.

**Code:** `server/bank-statements/*` (adapters, fingerprint, suggest, fragments, service, routes, schema), `src/plugins/bank-statements/*` (UI). Touch points in existing code: `server.ts` (route registration, `/api/collections/receive` now calls `receivePayments`), `server/db.ts` (`afterWrites` hook), `App.tsx`, `VerticalSidebar.tsx`, `AppContext.tsx` (`refreshFromServer`), `apiSync.ts` (`getApiHeaders`), `types.ts`.

**Adding a bank adapter:** implement `StatementAdapter` (`id`, `version`, `formats`, `detect()` returning confidence 0–1, `parse()`), register in `adapters/registry.ts`. Highest confidence wins (min 0.3). Bump `version` when parsing logic changes. Ambiguous debit/credit rows are skipped with a warning, never guessed. Needs a real sample statement from the bank to tune.

**Tests:** `npm run test:bank` (adapter + logic tests need nothing; integration needs `TEST_DATABASE_URL` pointing at a Postgres with `pg_trgm`). `npm run check` runs the guard tests.

**Migration:** `db/migrations/2026-12-bank-statements.sql` (also run on startup).

**Limitations:** statement files are stored in Postgres (BYTEA); only credits are staged; generic PDF adapter works on text PDFs, not scans (no OCR); suggestions are advisory only.
