// Document numbering (vouchers FE, collections COL, transactions TXN).
//
// The PostgreSQL `system_sequences` table is the single source of truth. Numbers
// are minted atomically by the server inside the same transaction that writes
// the document. The client never allocates, caches or reconciles numbers.
//
// While a create request is in flight the client shows a pending placeholder
// (`TEMP_…`); the server response then replaces it with the real number.

const PENDING_PREFIX = 'TEMP_';

/** Placeholder shown until the server assigns the real document number. */
export function pendingDocumentNumber(): string {
  return `${PENDING_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
