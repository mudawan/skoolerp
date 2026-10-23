// Tables owned by the Bank Statement Collections Loader. Idempotent: safe on every start.
// The same SQL is shipped as db/migrations/2026-12-bank-statements.sql for people who run migrations by hand.

export const BANK_STATEMENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bank_statement_files (
  id VARCHAR(64) PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  file_hash CHAR(64) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128),
  size_bytes INTEGER NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_files_hash ON bank_statement_files (institution_id, file_hash);

CREATE TABLE IF NOT EXISTS bank_statement_uploads (
  id VARCHAR(64) PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  fee_month VARCHAR(7) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_id VARCHAR(64) REFERENCES bank_statement_files(id),
  adapter_id VARCHAR(64),
  adapter_version VARCHAR(32),
  bank_name VARCHAR(128),
  account_number VARCHAR(64),
  period_from VARCHAR(10),
  period_to VARCHAR(10),
  parse_status VARCHAR(16) NOT NULL CHECK (parse_status IN ('parsed','failed')),
  parse_error TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  exact_duplicate_of VARCHAR(64),
  total_credits INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by VARCHAR(64),
  uploaded_by_name VARCHAR(255),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_uploads_inst ON bank_statement_uploads (institution_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_statement_uploads_month ON bank_statement_uploads (institution_id, fee_month);

CREATE TABLE IF NOT EXISTS bank_statement_transactions (
  id VARCHAR(64) PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  upload_id VARCHAR(64) NOT NULL REFERENCES bank_statement_uploads(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  fingerprint CHAR(64) NOT NULL,
  txn_date VARCHAR(10) NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  reference VARCHAR(255),
  balance NUMERIC(16,2),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','assigned','applied','ignored','duplicate')),
  duplicate_of VARCHAR(64),
  student_id VARCHAR(64),
  assigned_by VARCHAR(64),
  assigned_by_name VARCHAR(255),
  assigned_at TIMESTAMPTZ,
  ignore_reason TEXT,
  ignored_by VARCHAR(64),
  ignored_at TIMESTAMPTZ,
  collection_id VARCHAR(64),
  payment_txn_id VARCHAR(64),
  voucher_id VARCHAR(64),
  applied_by VARCHAR(64),
  applied_by_name VARCHAR(255),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bst_assigned_has_student CHECK (status <> 'assigned' OR student_id IS NOT NULL),
  CONSTRAINT chk_bst_applied_has_links CHECK (status <> 'applied' OR (student_id IS NOT NULL AND collection_id IS NOT NULL))
);
-- One live row per bank transaction, system-wide for the institution. 'duplicate' rows only record that a
-- later upload contained the same transaction again, so they are outside the uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_txn_fingerprint
  ON bank_statement_transactions (institution_id, fingerprint) WHERE status <> 'duplicate';
CREATE INDEX IF NOT EXISTS idx_bank_statement_txn_upload ON bank_statement_transactions (upload_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_statement_txn_student ON bank_statement_transactions (institution_id, student_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_txn_collection ON bank_statement_transactions (institution_id, collection_id);

CREATE TABLE IF NOT EXISTS bank_statement_fragments (
  id BIGSERIAL PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL,
  fragment VARCHAR(60) NOT NULL,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('word','phrase','number','masked')),
  hits INTEGER NOT NULL DEFAULT 1,
  source_txn_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_fragment ON bank_statement_fragments (institution_id, student_id, fragment);
CREATE INDEX IF NOT EXISTS idx_bank_statement_fragment_lookup ON bank_statement_fragments (institution_id, fragment);
CREATE INDEX IF NOT EXISTS idx_bank_statement_fragment_trgm ON bank_statement_fragments USING GIN (fragment gin_trgm_ops);

-- Append-only history of every assignment decision.
CREATE TABLE IF NOT EXISTS bank_statement_events (
  id BIGSERIAL PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  upload_id VARCHAR(64),
  txn_id VARCHAR(64),
  action VARCHAR(24) NOT NULL,
  from_student_id VARCHAR(64),
  to_student_id VARCHAR(64),
  user_id VARCHAR(64),
  user_name VARCHAR(255),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_events_txn ON bank_statement_events (institution_id, txn_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_events_upload ON bank_statement_events (institution_id, upload_id, at DESC);
`;

export interface SchemaRunner {
  query(text: string): Promise<unknown>;
}

let ready = false;

export async function ensureBankStatementSchema(db: SchemaRunner): Promise<void> {
  if (ready) return;
  // pg_trgm is created by the main schema; repeating it is harmless and lets this run standalone.
  await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await db.query(BANK_STATEMENT_SCHEMA_SQL);
  ready = true;
}

/** Test helper: forget that the schema was created (a new test database needs it again). */
export function resetSchemaFlagForTests(): void {
  ready = false;
}
