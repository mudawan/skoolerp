import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { PAYMENT_MODES, isPaymentMode } from '../src/utils/paymentMode';

export interface DbInstitution {
  id: string;
  name: string;
  code: string;
  registration_no?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  logo_url?: string;
  status: 'active' | 'suspended' | 'trial';
  suspended_at?: string | null;
  suspended_by?: string | null;
  suspend_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string;
  institution_id: string;
  username: string;
  email?: string;
  password_hash: string;
  full_name: string;
  role: string;
  permissions: string[];
  status: 'active' | 'invited' | 'deactivated';
  must_change_password?: boolean;
  temp_password_expires_at?: string | null;
  platform_locked?: boolean;
  created_by?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DbPlatformAdmin {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  status: string;
  last_login_at?: string;
  created_at: string;
}

export interface MonitorMetricRow {
  minute: string;
  method: string;
  route: string;
  count: number;
  errors4xx: number;
  errors5xx: number;
  totalMs: number;
  maxMs: number;
  buckets: number[];
}

export interface MonitorEvent {
  ts: string;
  kind: string;
  institutionId?: string;
  userId?: string;
  method?: string;
  route?: string;
  status?: number;
  code?: string;
  message?: string;
  requestId?: string;
  durationMs?: number;
  meta?: Record<string, any>;
}

export interface MonitorDbSample {
  ts: string;
  ok: boolean;
  latencyMs?: number;
  poolTotal?: number;
  poolIdle?: number;
  poolWaiting?: number;
  connections?: number;
  dbSizeBytes?: number;
  xactCommit?: number;
  xactRollback?: number;
  deadlocks?: number;
  blksHit?: number;
  blksRead?: number;
  error?: string;
}

export interface DbOperatorInvite {
  id: string;
  institution_id: string;
  invite_code: string;
  full_name: string;
  assigned_role: string;
  permissions: string[];
  expires_at: string;
  status: 'pending' | 'claimed' | 'expired';
  created_by: string;
  created_at: string;
}

export interface DatabaseState {
  users?: any[];
  classes?: any[];
  students?: any[];
  families?: any[];
  buses?: any[];
  stops?: any[];
  transportAssignments?: any[];
  templates?: any[];
  vouchers?: any[];
  collections?: any[];
  transactions?: any[];
  institute?: any;
  bankAccounts?: any[];
  auditLogs?: any[];
  studentAccountHistory?: any[];
  lockedMonths?: string[];
  lockedMonthDetails?: { month: string; notes?: string; lockedBy?: string; lockedByName?: string; lockedAt?: string }[];
  systemConfig?: any;
  institution?: DbInstitution;
}

export type DbEngineType = 'postgres';

export interface DbHealthDetails {
  healthy: boolean;
  engine: DbEngineType;
  latencyMs?: number;
  pool?: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  strictPostgres: boolean;
  error?: string;
}

/**
 * A fee voucher as read from/written to the relational `vouchers` +
 * `voucher_particulars` tables, in the same camelCase shape the client
 * already expects (matches src/types.ts's FeeVoucher).
 */
export interface VoucherRecord {
  id: string;
  voucherNo: string;
  studentId: string;
  month: string;
  classId?: string;
  issueDate?: string;
  dueDate?: string;
  particulars: Array<{ kind: string; label: string; amount: number }>;
  grossTotal: number;
  discountTotal: number;
  prevBalance: number;
  lateFeeRate: number;
  roundingMultiple?: number;
  netDue: number;
  amountPaid: number;
  status: string;
  voucherType?: string;
  carryForwardMonth?: string;
  carriedLateFine?: number;
  notes?: string;
  createdDate?: string;
}

/**
 * Describes the writes a runVoucherTransaction() mutator wants applied,
 * expressed as targeted rows rather than full collections — the whole point
 * being that only rows actually touched get written, never a full-collection
 * replace. See runVoucherTransaction() for why this exists.
 */
export interface VoucherTxWrites {
  /** id -> full voucher record to upsert (vouchers row + its voucher_particulars, replaced atomically). */
  voucherUpserts?: Record<string, VoucherRecord>;
  /** Voucher ids to delete entirely (cascades to their voucher_particulars). */
  deleteVoucherIds?: string[];
  /** New payment_transaction rows to insert. */
  newTransactions?: Array<{
    id: string;
    txnNo: string;
    collectionId: string;
    voucherId: string;
    studentId: string;
    month: string;
    amount: number;
    fineAdded?: number;
    paymentMode?: string;
    referenceNo?: string;
    notes?: string;
    date: string;
  }>;
  /** Transaction ids to delete (e.g. reversing a collection or force-deleting a voucher's payment history). */
  deleteTransactionIds?: string[];
  /** New collection receipt rows to insert. */
  newCollections?: Array<{
    id: string;
    collectionNo: string;
    date: string;
    totalAmount: number;
    transactionCount: number;
    notes?: string;
    isBulkImport?: boolean;
  }>;
  /** Collection totals to update in place (e.g. after removing some of its transactions). */
  collectionUpdates?: Record<string, { totalAmount: number; transactionCount: number }>;
  /** Collection ids to delete entirely (e.g. once their last transaction is removed). */
  deleteCollectionIds?: string[];
  /**
   * Extra statements that must commit or roll back together with the writes above (they run on the same
   * database client, after every write and the fine_since_payment refresh, immediately before COMMIT).
   * Used by add-on modules (e.g. bank-statement loading) that mark their own rows in the same transaction as
   * the payment. A throw here rolls the whole transaction back.
   */
  afterWrites?: (client: any) => Promise<void>;
}

/**
 * Describes one column of a "simple entity" table — a table with a flat
 * shape (institution_id + id + a handful of scalar columns + created_at/
 * updated_at) that fits the generic CRUD methods below. Entities with real
 * relational children (vouchers -> voucher_particulars) or that need
 * search/pagination (students, vouchers, transactions, audit_logs) have
 * their own bespoke methods instead — this generic path is only for the
 * structurally-simple, low-cardinality collections (classes, families,
 * buses, stops, transport assignments, fee templates, bank accounts).
 */
/**
 * A write that the database refused for a business reason the operator can act
 * on: the record changed since it was loaded (stale version), or it is still
 * referenced by other records. The API layer answers these with HTTP 409.
 */
/** What a student batch really changed; the basis of its one audit entry. */
export interface StudentBatchSummary {
  created: Array<{ name: string; regNo: string }>;
  updated: Array<{ name: string; regNo: string; fields: string[]; statusFrom?: string; statusTo?: string }>;
  deleted: Array<{ name: string; regNo: string }>;
}

export class ConflictError extends Error {
  public readonly code: 'STALE_VERSION' | 'IN_USE' | 'DUPLICATE';
  public readonly current?: any;
  constructor(code: 'STALE_VERSION' | 'IN_USE' | 'DUPLICATE', message: string, current?: any) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
    this.current = current;
  }
}

const STALE_MESSAGE =
  'This record was changed by someone else since you opened it. The latest version has been loaded; please redo your change if it is still needed.';

interface EntityFieldSpec {
  /** snake_case DB column name */
  column: string;
  /** Store an empty string as NULL (needed for columns that are foreign keys). */
  nullIfEmpty?: boolean;
  /** camelCase field name as used in API request/response bodies */
  field: string;
  type: 'string' | 'number' | 'boolean' | 'json';
}

export interface SimpleEntityConfig {
  table: string;
  fields: EntityFieldSpec[];
}

// Defense in depth: table names are always interpolated directly into SQL
// (there's no safe way to parameterize an identifier), which is fine as
// long as they only ever come from hardcoded config objects below — never
// from request input. This allowlist makes that assumption an enforced
// invariant rather than just a convention.
const ALLOWED_SIMPLE_ENTITY_TABLES = new Set([
  'classes',
  'families',
  'buses',
  'stops',
  'transport_assignments',
  'fee_templates',
  'bank_accounts',
]);

function assertAllowedSimpleTable(table: string) {
  if (!ALLOWED_SIMPLE_ENTITY_TABLES.has(table)) {
    throw new Error(`[DB] Refusing to operate on non-allowlisted table '${table}' via the generic entity helper.`);
  }
}

function serializeFieldValue(spec: EntityFieldSpec, value: any): any {
  if (spec.nullIfEmpty && (value === '' || value === undefined)) return null;
  if (spec.type === 'boolean') return !!value;
  if (spec.type === 'json') return JSON.stringify(value ?? null);
  if (spec.type === 'number') return value === undefined || value === null || value === '' ? 0 : Number(value);
  return value === undefined ? null : value;
}

function deserializeSimpleEntityRow(fields: EntityFieldSpec[], row: any): any {
  const out: any = { id: row.id, version: Number(row.version) || 1 };
  for (const spec of fields) {
    let v = row[spec.column];
    if (spec.type === 'boolean') v = v === true || v === 1 || v === '1';
    else if (spec.type === 'json') v = typeof v === 'string' ? (v ? JSON.parse(v) : null) : v ?? null;
    else if (spec.type === 'number') v = v === null || v === undefined ? 0 : Number(v);
    out[spec.field] = v;
  }
  return out;
}

// Config objects for every table the generic simple-entity CRUD methods
// operate on. Field lists match src/types.ts's client-facing shapes.
export const CLASS_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'classes',
  fields: [
    { column: 'name', field: 'name', type: 'string' },
    { column: 'monthly_fee', field: 'monthlyFee', type: 'number' },
    { column: 'sort_order', field: 'sortOrder', type: 'number' },
    { column: 'active', field: 'active', type: 'boolean' },
  ],
};

export const FAMILY_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'families',
  fields: [
    { column: 'family_no', field: 'familyNo', type: 'string' },
    { column: 'head_name', field: 'headName', type: 'string' },
    { column: 'contact_phone', field: 'contactPhone', type: 'string' },
    { column: 'father_national_id', field: 'fatherNationalId', type: 'string' },
    { column: 'address', field: 'address', type: 'string' },
    { column: 'notes', field: 'notes', type: 'string' },
  ],
};

export const BUS_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'buses',
  fields: [
    { column: 'bus_number', field: 'busNumber', type: 'string' },
    { column: 'model', field: 'model', type: 'string' },
    { column: 'reg_number', field: 'regNumber', type: 'string' },
    { column: 'driver_name', field: 'driverName', type: 'string' },
    { column: 'driver_phone', field: 'driverPhone', type: 'string' },
    { column: 'route_name', field: 'routeName', type: 'string' },
    { column: 'active', field: 'active', type: 'boolean' },
    { column: 'sort_order', field: 'sortOrder', type: 'number' },
  ],
};

export const STOP_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'stops',
  fields: [
    { column: 'name', field: 'name', type: 'string' },
    { column: 'area', field: 'area', type: 'string' },
    { column: 'landmark', field: 'landmark', type: 'string' },
    { column: 'monthly_fare', field: 'monthlyFare', type: 'number' },
    { column: 'sort_order', field: 'sortOrder', type: 'number' },
  ],
};

export const TRANSPORT_ASSIGNMENT_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'transport_assignments',
  fields: [
    { column: 'student_id', field: 'studentId', type: 'string' },
    { column: 'month', field: 'month', type: 'string' },
    { column: 'bus_id', field: 'busId', type: 'string', nullIfEmpty: true },
    { column: 'stop_id', field: 'stopId', type: 'string', nullIfEmpty: true },
    { column: 'trip_type', field: 'tripType', type: 'string' },
    { column: 'days_charged', field: 'daysCharged', type: 'number' },
    { column: 'discount', field: 'discount', type: 'number' },
    { column: 'active', field: 'active', type: 'boolean' },
  ],
};

export const FEE_TEMPLATE_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'fee_templates',
  fields: [
    { column: 'kind', field: 'kind', type: 'string' },
    { column: 'label', field: 'label', type: 'string' },
    { column: 'default_amount', field: 'defaultAmount', type: 'number' },
    { column: 'sort_order', field: 'sortOrder', type: 'number' },
    { column: 'class_id', field: 'classId', type: 'string', nullIfEmpty: true },
    { column: 'student_id', field: 'studentId', type: 'string', nullIfEmpty: true },
    { column: 'month', field: 'month', type: 'string' },
  ],
};

export const BANK_ACCOUNT_ENTITY_CONFIG: SimpleEntityConfig = {
  table: 'bank_accounts',
  fields: [
    { column: 'bank_name', field: 'bankName', type: 'string' },
    { column: 'title', field: 'title', type: 'string' },
    { column: 'account_number', field: 'accountNumber', type: 'string' },
    { column: 'branch_code', field: 'branchCode', type: 'string' },
    { column: 'instructions_ltr', field: 'instructionsLtr', type: 'string' },
    { column: 'instructions_rtl', field: 'instructionsRtl', type: 'string' },
    { column: 'instructions_line1', field: 'instructionsLine1', type: 'string' },
    { column: 'instructions_line2', field: 'instructionsLine2', type: 'string' },
    { column: 'logo_url', field: 'logoUrl', type: 'string' },
    { column: 'active', field: 'active', type: 'boolean' },
    { column: 'is_default', field: 'isDefault', type: 'boolean' },
  ],
};

/** Every tenant-scoped query must name its institution; there is no implicit default tenant. */
function requireTenantId(institutionId: string | undefined | null): string {
  if (!institutionId) {
    throw new Error('Institution id is required for this operation.');
  }
  return institutionId;
}

/**
 * Derived value kept on every voucher: the late fine charged since the
 * student's last payment. A voucher that has received any payment holds 0;
 * every later voucher holds the previous voucher's value plus its own Fine
 * particulars. The student's current figure is therefore the value on their
 * latest voucher. Recomputed here, in one place, whenever vouchers or payments
 * change ($1 = institution or NULL for all, $2 = student ids or NULL for all).
 */
const FINE_SINCE_PAYMENT_REFRESH_SQL = `
  WITH base AS (
    SELECT v.id, v.student_id, v.month,
           CASE WHEN v.amount_paid > 0 THEN 0
                ELSE COALESCE((SELECT SUM(p.amount) FROM voucher_particulars p WHERE p.voucher_id = v.id AND p.kind = 'Fine'), 0)
           END AS fine,
           v.amount_paid > 0 AS paid
    FROM vouchers v
    WHERE v.status <> 'Reversed'
      AND ($1::text IS NULL OR v.institution_id = $1)
      AND ($2::text[] IS NULL OR v.student_id = ANY($2))
  ), grouped AS (
    SELECT *, COUNT(*) FILTER (WHERE paid) OVER (PARTITION BY student_id ORDER BY month, id) AS grp FROM base
  ), calc AS (
    SELECT id, CASE WHEN paid THEN 0 ELSE SUM(fine) OVER (PARTITION BY student_id, grp ORDER BY month, id) END AS val
    FROM grouped
  )
  UPDATE vouchers v SET fine_since_payment = c.val
  FROM calc c
  WHERE v.id = c.id AND v.fine_since_payment IS DISTINCT FROM c.val
`;

class DatabaseService {
  private engine: DbEngineType = 'postgres';
  private pgPool: pg.Pool | null = null;
  private isInitialized = false;
  private revisions: Map<string, { revision: number; lastModified: string }> = new Map();
  private globalRevision: number = 1;

  constructor() {
    const host = process.env.POSTGRES_HOST || '127.0.0.1';
    const port = process.env.POSTGRES_PORT || '5432';
    const user = process.env.POSTGRES_USER || 'postgres';
    const password = process.env.POSTGRES_PASSWORD ? `:${process.env.POSTGRES_PASSWORD}` : '';
    const dbName = process.env.POSTGRES_DB || 'school_db';
    const defaultUrl = `postgres://${user}${password}@${host}:${port}/${dbName}`;
    const databaseUrl = process.env.DATABASE_URL || defaultUrl;

    try {
      this.pgPool = new pg.Pool({
        connectionString: databaseUrl.trim(),
        max: parseInt(process.env.DB_POOL_MAX || '15', 10),
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000,
      });

      this.pgPool.on('error', (err) => {
        console.error('[DB] Unexpected PostgreSQL pool client error:', err.message);
      });

      console.log('[DB] Configured PostgreSQL database engine (PostgreSQL is the single authoritative database).');
    } catch (err: any) {
      console.error('[DB FATAL] Failed to configure PostgreSQL connection pool:', err);
    }
  }

  public getEngine(): DbEngineType {
    return this.engine;
  }

  public isStrictMode(): boolean {
    return true;
  }

  public getPoolStats() {
    if (!this.pgPool) return null;
    return {
      totalCount: this.pgPool.totalCount,
      idleCount: this.pgPool.idleCount,
      waitingCount: this.pgPool.waitingCount,
    };
  }

  /**
   * Actively pings the database with latency measurement and connection verification
   */
  public async ping(): Promise<DbHealthDetails> {
    const start = Date.now();
    if (this.pgPool) {
      try {
        const client = await this.pgPool.connect();
        try {
          await client.query('SELECT 1 AS ping');
          const latencyMs = Date.now() - start;
          return {
            healthy: true,
            engine: 'postgres',
            latencyMs,
            pool: this.getPoolStats() || undefined,
            strictPostgres: true,
          };
        } finally {
          client.release();
        }
      } catch (err: any) {
        return {
          healthy: false,
          engine: 'postgres',
          latencyMs: Date.now() - start,
          pool: this.getPoolStats() || undefined,
          strictPostgres: true,
          error: err?.message || 'PostgreSQL connection failed',
        };
      }
    }

    return {
      healthy: false,
      engine: 'postgres',
      strictPostgres: true,
      error: 'PostgreSQL database pool not configured',
    };
  }

  public getRevisionInfo(institutionId: string): { revision: number; lastModified: string } {
    const info = this.revisions.get(institutionId) || {
      revision: this.globalRevision,
      lastModified: new Date().toISOString(),
    };
    return info;
  }

  public incrementRevision(institutionId: string) {
    this.globalRevision += 1;
    const current = this.revisions.get(institutionId) || { revision: 1, lastModified: new Date().toISOString() };
    const updated = {
      revision: current.revision + 1,
      lastModified: new Date().toISOString(),
    };
    this.revisions.set(institutionId, updated);
    return updated;
  }

  private rateLimitTableReady = false;

  private async ensureRateLimitTable(): Promise<void> {
    if (this.rateLimitTableReady || !this.pgPool) return;
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_time TIMESTAMPTZ NOT NULL
      )
    `);
    this.rateLimitTableReady = true;
  }

  /**
   * Atomically increments a rate-limit counter for `key` within a
   * `windowMs`-long rolling window, shared across every app instance that
   * points at this same database — unlike express-rate-limit's default
   * in-process MemoryStore, which keeps a separate counter per instance and
   * silently gives an attacker N free attempts across N replicas.
   */
  public async incrementRateLimitCounter(
    key: string,
    windowMs: number
  ): Promise<{ totalHits: number; resetTime: Date } | null> {
    await this.init();
    if (!this.pgPool) return null;
    await this.ensureRateLimitTable();

    const newResetTime = new Date(Date.now() + windowMs);
    const res = await this.pgPool.query(
      `INSERT INTO rate_limit_counters (key, count, reset_time)
       VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limit_counters.reset_time <= NOW() THEN 1 ELSE rate_limit_counters.count + 1 END,
         reset_time = CASE WHEN rate_limit_counters.reset_time <= NOW() THEN $2 ELSE rate_limit_counters.reset_time END
       RETURNING count, reset_time`,
      [key, newResetTime]
    );
    const row = res.rows[0];
    return { totalHits: Number(row.count), resetTime: new Date(row.reset_time) };
  }

  public async decrementRateLimitCounter(key: string): Promise<void> {
    if (!this.pgPool) return;
    await this.ensureRateLimitTable();
    await this.pgPool.query(
      `UPDATE rate_limit_counters SET count = GREATEST(0, count - 1) WHERE key = $1`,
      [key]
    );
  }

  public async resetRateLimitCounter(key: string): Promise<void> {
    if (!this.pgPool) return;
    await this.ensureRateLimitTable();
    await this.pgPool.query(`DELETE FROM rate_limit_counters WHERE key = $1`, [key]);
  }

  /**
   * Initializes schema with exponential retry backoff for PostgreSQL
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.pgPool) {
      throw new Error('PostgreSQL connection pool is not configured. Set DATABASE_URL (or POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB).');
    }

    const maxRetries = 3;
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[DB] Connecting to PostgreSQL (attempt ${attempt}/${maxRetries})...`);
        await this.initPostgresSchema();
        this.isInitialized = true;
        console.log('[DB] PostgreSQL multi-tenant schema verified & ready.');
        return;
      } catch (err: any) {
        lastErr = err;
        if (err?.schemaOutOfDate) {
          // Retrying cannot fix this; stop with the instructions.
          console.error(`[DB] ${err.message}`);
          process.exit(1);
        }
        console.error(`[DB] PostgreSQL connection attempt ${attempt} failed:`, err?.message || err);
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.log(`[DB] Retrying in ${backoffMs}ms...`);
          await new Promise((res) => setTimeout(res, backoffMs));
        }
      }
    }

    // Without the database nothing can be saved or shown, so the server must not start
    // half-alive (it would answer "degraded" while every screen failed). startServer()
    // reports this and exits with a non-zero code so the process manager restarts it.
    throw new Error(
      `PostgreSQL connection could not be established after ${maxRetries} attempts (${lastErr?.message || 'unknown error'}). PostgreSQL is required.`
    );
  }

  

  private async initPostgresSchema(): Promise<void> {
    if (!this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pg_trgm;

        CREATE TABLE IF NOT EXISTS institutions (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(32) UNIQUE NOT NULL,
          registration_no VARCHAR(128),
          address TEXT,
          phone VARCHAR(64),
          email VARCHAR(128),
          website VARCHAR(255),
          currency VARCHAR(16) DEFAULT 'USD',
          logo_url TEXT,
          status VARCHAR(32) DEFAULT 'active',
          suspended_at TIMESTAMPTZ,
          suspended_by VARCHAR(128),
          suspend_reason TEXT,
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          username VARCHAR(128) NOT NULL,
          email VARCHAR(255),
          password_hash TEXT NOT NULL,
          full_name VARCHAR(128) NOT NULL,
          role VARCHAR(32) NOT NULL,
          permissions JSONB DEFAULT '[]'::jsonb,
          preferences JSONB DEFAULT '{}'::jsonb,
          status VARCHAR(32) DEFAULT 'active',
          must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
          temp_password_expires_at TIMESTAMPTZ,
          platform_locked BOOLEAN NOT NULL DEFAULT FALSE,
          created_by VARCHAR(64),
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_institution_username ON users (institution_id, LOWER(username));

        CREATE TABLE IF NOT EXISTS operator_invites (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          invite_code VARCHAR(32) UNIQUE NOT NULL,
          full_name VARCHAR(128) NOT NULL,
          assigned_role VARCHAR(32) NOT NULL,
          permissions JSONB DEFAULT '[]'::jsonb,
          expires_at TIMESTAMPTZ NOT NULL,
          status VARCHAR(32) DEFAULT 'pending',
          created_by VARCHAR(64) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS system_sequences (
          institution_id VARCHAR(64) NOT NULL,
          prefix VARCHAR(16) NOT NULL,
          year VARCHAR(8) NOT NULL,
          last_value BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (institution_id, prefix, year)
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          session_token VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Platform (app-owner) identity. Deliberately separate from users/institutions:
        -- a platform admin belongs to no school, has its own sessions, and is never
        -- accepted by a school route (and the reverse).
        CREATE TABLE IF NOT EXISTS platform_admins (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(128) NOT NULL,
          password_hash TEXT NOT NULL,
          full_name VARCHAR(128) NOT NULL,
          role VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          last_login_at TIMESTAMPTZ,
          created_by VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_username ON platform_admins (LOWER(username));

        CREATE TABLE IF NOT EXISTS platform_sessions (
          session_token VARCHAR(128) PRIMARY KEY,
          admin_id VARCHAR(64) NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- What platform admins did. No foreign key to institutions: the record must
        -- outlive a deleted school.
        CREATE TABLE IF NOT EXISTS platform_audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          admin_id VARCHAR(64),
          admin_username VARCHAR(128),
          admin_role VARCHAR(32),
          action_type VARCHAR(64) NOT NULL,
          action_title VARCHAR(255),
          description TEXT,
          target_institution_id VARCHAR(64),
          target_user_id VARCHAR(64),
          metadata JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_platform_audit_time ON platform_audit_logs(timestamp DESC);

        -- Hourly picture of database size, biggest tables and orphan rows (see server/monitor.ts).
        CREATE TABLE IF NOT EXISTS platform_db_snapshots (
          ts TIMESTAMPTZ PRIMARY KEY,
          payload JSONB NOT NULL
        );

        -- Monitoring (read by the platform dashboards; written by server/monitor.ts).
        -- Nothing here holds request bodies or user-entered values.
        CREATE TABLE IF NOT EXISTS platform_api_metrics (
          instance VARCHAR(64) NOT NULL,
          minute TIMESTAMPTZ NOT NULL,
          method VARCHAR(8) NOT NULL,
          route VARCHAR(200) NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          errors_4xx INTEGER NOT NULL DEFAULT 0,
          errors_5xx INTEGER NOT NULL DEFAULT 0,
          total_ms BIGINT NOT NULL DEFAULT 0,
          max_ms INTEGER NOT NULL DEFAULT 0,
          buckets INTEGER[] NOT NULL,
          PRIMARY KEY (instance, minute, method, route)
        );
        CREATE INDEX IF NOT EXISTS idx_platform_api_metrics_minute ON platform_api_metrics(minute);

        CREATE TABLE IF NOT EXISTS platform_error_events (
          id BIGSERIAL PRIMARY KEY,
          ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          instance VARCHAR(64),
          kind VARCHAR(32) NOT NULL,
          institution_id VARCHAR(64),
          user_id VARCHAR(64),
          method VARCHAR(8),
          route VARCHAR(200),
          status INTEGER,
          code VARCHAR(64),
          message TEXT,
          request_id VARCHAR(32),
          duration_ms INTEGER,
          meta JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_platform_error_events_ts ON platform_error_events(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_platform_error_events_kind ON platform_error_events(kind, ts DESC);

        CREATE TABLE IF NOT EXISTS platform_db_samples (
          instance VARCHAR(64) NOT NULL,
          ts TIMESTAMPTZ NOT NULL,
          ok BOOLEAN NOT NULL,
          latency_ms INTEGER,
          pool_total INTEGER,
          pool_idle INTEGER,
          pool_waiting INTEGER,
          connections INTEGER,
          db_size_bytes BIGINT,
          xact_commit BIGINT,
          xact_rollback BIGINT,
          deadlocks BIGINT,
          blks_hit BIGINT,
          blks_read BIGINT,
          error TEXT,
          PRIMARY KEY (instance, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_platform_db_samples_ts ON platform_db_samples(ts);

        -- Per-entity tables (replacing the old generic entities JSON blob store)

        CREATE TABLE IF NOT EXISTS classes (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          monthly_fee NUMERIC NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS families (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          family_no VARCHAR(64),
          head_name VARCHAR(255) NOT NULL,
          contact_phone VARCHAR(64),
          father_national_id VARCHAR(64),
          address TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          student_no VARCHAR(64),
          reg_no VARCHAR(64),
          name VARCHAR(255) NOT NULL,
          admission_date VARCHAR(32),
          first_billing_month VARCHAR(16),
          class_id VARCHAR(64),
          monthly_discount NUMERIC NOT NULL DEFAULT 0,
          mobile_number VARCHAR(64),
          notes TEXT,
          photo_url TEXT,
          dob VARCHAR(32),
          gender VARCHAR(16),
          student_national_id VARCHAR(64),
          family_id VARCHAR(64),
          address TEXT,
          father_name VARCHAR(255),
          father_national_id VARCHAR(64),
          father_phone VARCHAR(64),
          father_occupation VARCHAR(255),
          mother_name VARCHAR(255),
          mother_national_id VARCHAR(64),
          mother_phone VARCHAR(64),
          documents JSONB NOT NULL DEFAULT '{}'::jsonb,
          status VARCHAR(32) NOT NULL DEFAULT 'Active',
          created_date VARCHAR(32),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id),
          CONSTRAINT fk_students_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS buses (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          bus_number VARCHAR(64),
          model VARCHAR(128),
          reg_number VARCHAR(64),
          driver_name VARCHAR(255),
          driver_phone VARCHAR(64),
          route_name VARCHAR(255),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS stops (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          name VARCHAR(255),
          area VARCHAR(255),
          landmark VARCHAR(255),
          monthly_fare NUMERIC NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS transport_assignments (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          student_id VARCHAR(64) NOT NULL,
          month VARCHAR(16) NOT NULL,
          bus_id VARCHAR(64),
          stop_id VARCHAR(64),
          trip_type VARCHAR(32),
          days_charged INTEGER NOT NULL DEFAULT 0,
          discount NUMERIC NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT fk_assignments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_assignments_bus FOREIGN KEY (bus_id) REFERENCES buses(id),
          CONSTRAINT fk_assignments_stop FOREIGN KEY (stop_id) REFERENCES stops(id)
        );

        CREATE TABLE IF NOT EXISTS fee_templates (
          id VARCHAR(128) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          kind VARCHAR(32) NOT NULL,
          label VARCHAR(255) NOT NULL,
          default_amount NUMERIC NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          class_id VARCHAR(64),
          student_id VARCHAR(64),
          month VARCHAR(16),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT fk_templates_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_templates_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vouchers (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          voucher_no VARCHAR(64),
          student_id VARCHAR(64) NOT NULL,
          month VARCHAR(16) NOT NULL,
          class_id VARCHAR(64),
          issue_date VARCHAR(32),
          due_date VARCHAR(32),
          gross_total NUMERIC NOT NULL DEFAULT 0,
          discount_total NUMERIC NOT NULL DEFAULT 0,
          prev_balance NUMERIC NOT NULL DEFAULT 0,
          late_fee_rate NUMERIC NOT NULL DEFAULT 0,
          rounding_multiple NUMERIC,
          net_due NUMERIC NOT NULL DEFAULT 0,
          amount_paid NUMERIC NOT NULL DEFAULT 0,
          status VARCHAR(32) NOT NULL DEFAULT 'Issued',
          voucher_type VARCHAR(32),
          carry_forward_month VARCHAR(16),
          carried_late_fine NUMERIC,
          fine_since_payment NUMERIC NOT NULL DEFAULT 0,
          notes TEXT,
          created_date VARCHAR(32),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT fk_vouchers_student FOREIGN KEY (student_id) REFERENCES students(id)
        );

        CREATE TABLE IF NOT EXISTS voucher_particulars (
          id VARCHAR(64) PRIMARY KEY,
          voucher_id VARCHAR(64) NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
          kind VARCHAR(32) NOT NULL,
          label VARCHAR(255) NOT NULL,
          amount NUMERIC NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS collections (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          collection_no VARCHAR(64),
          date VARCHAR(32),
          total_amount NUMERIC NOT NULL DEFAULT 0,
          transaction_count INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          is_bulk_import BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          txn_no VARCHAR(64),
          collection_id VARCHAR(64),
          voucher_id VARCHAR(64) NOT NULL,
          student_id VARCHAR(64) NOT NULL,
          month VARCHAR(16),
          amount NUMERIC NOT NULL,
          fine_added NUMERIC,
          payment_mode VARCHAR(32),
          reference_no VARCHAR(128),
          notes TEXT,
          date VARCHAR(32),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS bank_accounts (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          bank_name VARCHAR(255),
          title VARCHAR(255),
          account_number VARCHAR(64),
          branch_code VARCHAR(32),
          instructions_ltr TEXT,
          instructions_rtl TEXT,
          instructions_line1 TEXT,
          instructions_line2 TEXT,
          logo_url TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          operator_id VARCHAR(64),
          operator_username VARCHAR(128),
          operator_name VARCHAR(255),
          operator_role VARCHAR(32),
          action_type VARCHAR(64) NOT NULL,
          action_title VARCHAR(255),
          description TEXT,
          module VARCHAR(64),
          target_id VARCHAR(128),
          target_label VARCHAR(255),
          month VARCHAR(16),
          amount NUMERIC,
          previous_value TEXT,
          new_value TEXT,
          metadata JSONB
        );

        CREATE TABLE IF NOT EXISTS student_account_history (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          student_id VARCHAR(64) NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          date VARCHAR(32),
          category VARCHAR(32),
          action_title VARCHAR(255),
          description TEXT,
          previous_value TEXT,
          new_value TEXT,
          operator_name VARCHAR(255),
          operator_role VARCHAR(32),
          month VARCHAR(16),
          metadata JSONB
        );

        CREATE TABLE IF NOT EXISTS locked_months (
          institution_id VARCHAR(64) NOT NULL,
          month VARCHAR(16) NOT NULL,
          locked_at TIMESTAMPTZ DEFAULT NOW(),
          locked_by VARCHAR(128),
          locked_by_name VARCHAR(255),
          notes TEXT,
          PRIMARY KEY (institution_id, month)
        );

        CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(LOWER(code));
        CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
        CREATE INDEX IF NOT EXISTS idx_invites_code ON operator_invites(LOWER(invite_code));
        CREATE INDEX IF NOT EXISTS idx_sequences_lookup ON system_sequences(institution_id, prefix, year);
        CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON user_sessions(session_token, expires_at);

        CREATE INDEX IF NOT EXISTS idx_classes_institution ON classes(institution_id);
        CREATE INDEX IF NOT EXISTS idx_families_institution ON families(institution_id);
        CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_families_institution_family_no
          ON families(institution_id, family_no) WHERE family_no IS NOT NULL AND family_no <> '';
        CREATE INDEX IF NOT EXISTS idx_students_institution_class ON students(institution_id, class_id);
        CREATE INDEX IF NOT EXISTS idx_students_institution_family ON students(institution_id, family_id);
        CREATE INDEX IF NOT EXISTS idx_students_institution_status ON students(institution_id, status);
        CREATE INDEX IF NOT EXISTS idx_students_search_trgm ON students USING GIN (
          (coalesce(name,'') || ' ' || coalesce(reg_no,'') || ' ' || coalesce(father_name,'') || ' ' ||
           coalesce(father_phone,'') || ' ' || coalesce(mother_phone,'') || ' ' || coalesce(mobile_number,'') || ' ' ||
           coalesce(student_national_id,'') || ' ' || coalesce(father_national_id,'')) gin_trgm_ops
        );
        CREATE INDEX IF NOT EXISTS idx_buses_institution ON buses(institution_id);
        CREATE INDEX IF NOT EXISTS idx_stops_institution ON stops(institution_id);
        CREATE INDEX IF NOT EXISTS idx_transport_assignments_student ON transport_assignments(institution_id, student_id);
        CREATE INDEX IF NOT EXISTS idx_fee_templates_institution ON fee_templates(institution_id);
        CREATE INDEX IF NOT EXISTS idx_vouchers_institution_student ON vouchers(institution_id, student_id);
        CREATE INDEX IF NOT EXISTS idx_vouchers_institution_month ON vouchers(institution_id, month);
        CREATE INDEX IF NOT EXISTS idx_vouchers_institution_status ON vouchers(institution_id, status);
        CREATE INDEX IF NOT EXISTS idx_vouchers_institution_class ON vouchers(institution_id, class_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_student_month_active ON vouchers(institution_id, student_id, month) WHERE status != 'Reversed';
        CREATE INDEX IF NOT EXISTS idx_voucher_particulars_voucher ON voucher_particulars(voucher_id);
        CREATE INDEX IF NOT EXISTS idx_collections_institution_date ON collections(institution_id, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_institution_voucher ON transactions(institution_id, voucher_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_institution_student ON transactions(institution_id, student_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_institution_date ON transactions(institution_id, date);
        CREATE INDEX IF NOT EXISTS idx_bank_accounts_institution ON bank_accounts(institution_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_time ON audit_logs(institution_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_type_time ON audit_logs(institution_id, action_type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_student_account_history_student ON student_account_history(institution_id, student_id);
      `);

      await this.assertSchemaCurrent(client);
    } finally {
      client.release();
    }
  }


  /**
   * The schema above is the only definition. A database created before the row
   * versions, foreign keys and vouchers.fine_since_payment existed must be brought up
   * once with db/migrations/2026-10-integrity.sql; this check stops the server with a
   * clear message instead of failing later with a confusing SQL error.
   */
  private async assertSchemaCurrent(client: any): Promise<void> {
    const cols = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND ((column_name = 'version' AND table_name = ANY($1)) OR (table_name = 'vouchers' AND column_name = 'fine_since_payment'))`,
      [['classes', 'families', 'students', 'buses', 'stops', 'transport_assignments', 'fee_templates', 'bank_accounts']]
    );
    const fks = await client.query(`SELECT conname FROM pg_constraint WHERE conname LIKE 'fk\\_%'`);
    const missing: string[] = [];
    const files: string[] = [];
    if (cols.rowCount < 9) missing.push('version / fine_since_payment columns');
    if (fks.rowCount < 8) missing.push('foreign keys');
    if (missing.length > 0) files.push('db/migrations/2026-10-integrity.sql');
    const plat = await client.query(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND ((table_name = 'users' AND column_name IN ('must_change_password', 'temp_password_expires_at', 'platform_locked'))
           OR (table_name = 'institutions' AND column_name IN ('suspended_at', 'suspended_by', 'suspend_reason')))`
    );
    if (plat.rowCount < 6) {
      missing.push('platform support columns (users / institutions)');
      files.push('db/migrations/2026-11-platform.sql');
    }
    if (missing.length > 0) {
      const err: any = new Error(
        `Database schema is out of date (missing: ${missing.join(', ')}). Run ${files.join(' and ')} once, then start the server again.`
      );
      err.schemaOutOfDate = true;
      throw err;
    }
  }

  /** Counts of rows whose parent is missing, per relationship (read-only). */
  private async orphanCounts(client: { query: (sql: string, params?: any[]) => Promise<any> }, tenantId?: string): Promise<Record<string, number>> {
    const scope = tenantId ? ` AND x.institution_id = $1` : '';
    const params = tenantId ? [tenantId] : [];
    const q = (label: string, sql: string) => async (): Promise<[string, number]> => {
      const r = await client.query(sql, params);
      return [label, Number(r.rows[0]?.n) || 0];
    };
    // Sequential: this may run on a single client, which cannot overlap queries.
    const queries = [
      q('assignments_without_student', `SELECT COUNT(*) n FROM transport_assignments x WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = x.student_id)${scope}`),
      q('assignments_without_bus', `SELECT COUNT(*) n FROM transport_assignments x WHERE (x.bus_id IS NULL OR NOT EXISTS (SELECT 1 FROM buses b WHERE b.id = x.bus_id))${scope}`),
      q('assignments_without_stop', `SELECT COUNT(*) n FROM transport_assignments x WHERE (x.stop_id IS NULL OR NOT EXISTS (SELECT 1 FROM stops p WHERE p.id = x.stop_id))${scope}`),
      q('templates_without_student', `SELECT COUNT(*) n FROM fee_templates x WHERE x.student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = x.student_id)${scope}`),
      q('templates_without_class', `SELECT COUNT(*) n FROM fee_templates x WHERE x.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = x.class_id)${scope}`),
      q('students_without_class', `SELECT COUNT(*) n FROM students x WHERE x.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = x.class_id)${scope}`),
      q('students_without_family', `SELECT COUNT(*) n FROM students x WHERE x.family_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM families f WHERE f.id = x.family_id)${scope}`),
      q('vouchers_without_student', `SELECT COUNT(*) n FROM vouchers x WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = x.student_id)${scope}`),
      q('transactions_without_voucher', `SELECT COUNT(*) n FROM transactions x WHERE NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.id = x.voucher_id)${scope}`),
      // Not counted: a deleted student's account history is kept on purpose (there is no link that cascades), so it is not a defect.
    ];
    const rows: Array<[string, number]> = [];
    for (const run of queries) rows.push(await run());
    return Object.fromEntries(rows);
  }

  /** Read-only integrity report for one institution (used by tests and diagnostics). */
  public async getOrphanReport(institutionId: string): Promise<Record<string, number>> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) return {};
    return this.orphanCounts(this.pgPool, tenantId);
  }

  // --- Multi-Tenant Institution Operations ---

  public async createInstitution(
    institutionData: {
      name: string;
      code: string;
      registrationNo?: string;
      address?: string;
      phone?: string;
      email?: string;
      currency?: string;
      logoUrl?: string;
    },
    adminUser: {
      fullName: string;
      username: string;
      email?: string;
      passwordHash: string;
      permissions?: string[];
    }
  ): Promise<{ success: boolean; institution?: DbInstitution; admin?: DbUser; error?: string }> {
    await this.init();
    const instId = 'inst_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const userId = 'usr_adm_' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    const code = institutionData.code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await this.getInstitutionByCode(code);
    if (existing) {
      return { success: false, error: `Institution code '${code}' is already registered. Please choose another.` };
    }

    const institution: DbInstitution = {
      id: instId,
      name: institutionData.name.trim(),
      code,
      registration_no: institutionData.registrationNo?.trim() || '',
      address: institutionData.address?.trim() || '',
      phone: institutionData.phone?.trim() || '',
      email: institutionData.email?.trim() || '',
      currency: institutionData.currency || 'USD',
      logo_url: institutionData.logoUrl || '',
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    const admin: DbUser = {
      id: userId,
      institution_id: instId,
      username: adminUser.username.trim().toLowerCase(),
      email: adminUser.email?.trim() || '',
      password_hash: adminUser.passwordHash,
      full_name: adminUser.fullName.trim(),
      role: 'Admin',
      permissions: adminUser.permissions || [],
      status: 'active',
      created_by: 'system_onboarding',
      last_login_at: now,
      created_at: now,
      updated_at: now,
    };

    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO institutions (id, name, code, registration_no, address, phone, email, currency, logo_url, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            institution.id,
            institution.name,
            institution.code,
            institution.registration_no,
            institution.address,
            institution.phone,
            institution.email,
            institution.currency,
            institution.logo_url,
            institution.status,
            institution.created_at,
            institution.updated_at,
          ]
        );

        await client.query(
          `INSERT INTO users (id, institution_id, username, email, password_hash, full_name, role, permissions, status, created_by, last_login_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            admin.id,
            admin.institution_id,
            admin.username,
            admin.email,
            admin.password_hash,
            admin.full_name,
            admin.role,
            JSON.stringify(admin.permissions),
            admin.status,
            admin.created_by,
            admin.last_login_at,
            admin.created_at,
            admin.updated_at,
          ]
        );

        // Seed standard 9 default fee templates for the new institution
        const defaultFeeTemplates = [
          { kind: 'Tuition', label: 'Tuition Fee', defaultAmount: 0, sortOrder: 1 },
          { kind: 'Flex1', label: 'Admission Fee', defaultAmount: 0, sortOrder: 2 },
          { kind: 'Flex2', label: 'Registration Fee', defaultAmount: 0, sortOrder: 3 },
          { kind: 'Transport', label: 'Transport Fee', defaultAmount: 0, sortOrder: 4 },
          { kind: 'Fine', label: 'Fine', defaultAmount: 0, sortOrder: 5 },
          { kind: 'Flex3', label: 'Exam Fee', defaultAmount: 0, sortOrder: 6 },
          { kind: 'Flex4', label: 'Other', defaultAmount: 0, sortOrder: 7 },
          { kind: 'PreviousBalance', label: 'Previous Balance', defaultAmount: 0, sortOrder: 8 },
          { kind: 'Discount', label: 'Discount in Fee', defaultAmount: 0, sortOrder: 9 },
        ];
        for (const t of defaultFeeTemplates) {
          const tplId = `${institution.id}_tpl_${t.sortOrder}`;
          await client.query(
            `INSERT INTO fee_templates (id, institution_id, kind, label, default_amount, sort_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [tplId, institution.id, t.kind, t.label, t.defaultAmount, t.sortOrder, now, now]
          );
        }

        await client.query('COMMIT');
        return { success: true, institution, admin };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[DB] Failed to create institution in Postgres:', err);
        return { success: false, error: err?.message || 'Failed to create institution in database.' };
      } finally {
        client.release();
      }
    }

    return { success: false, error: 'No database engine available.' };
  }

  public async getInstitutionById(id: string): Promise<DbInstitution | null> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM institutions WHERE id = $1', [id]);
      return (res.rows[0] as DbInstitution) || null;
    }
    return null;
  }

  public async getInstitutionByCode(code: string): Promise<DbInstitution | null> {
    await this.init();
    const clean = code.trim().toLowerCase();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM institutions WHERE LOWER(code) = $1', [clean]);
      return (res.rows[0] as DbInstitution) || null;
    }
    return null;
  }

  public async listInstitutions(): Promise<DbInstitution[]> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM institutions ORDER BY created_at DESC');
      return res.rows as DbInstitution[];
    }
    return [];
  }

  // --- Multi-Tenant User Operations ---

  public async createUser(userData: {
    institutionId: string;
    username: string;
    email?: string;
    passwordHash: string;
    fullName: string;
    role: string;
    permissions: string[];
    createdBy?: string;
  }): Promise<{ success: boolean; user?: DbUser; error?: string }> {
    await this.init();
    const now = new Date().toISOString();
    const cleanUsername = userData.username.trim().toLowerCase();

    // Check duplicate username in this institution
    const existing = await this.getUserByUsername(cleanUsername, userData.institutionId);
    if (existing) {
      return { success: false, error: `Username '${cleanUsername}' is already taken in this institution.` };
    }

    const id = 'usr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const user: DbUser = {
      id,
      institution_id: userData.institutionId,
      username: cleanUsername,
      email: userData.email?.trim() || '',
      password_hash: userData.passwordHash,
      full_name: userData.fullName.trim(),
      role: userData.role,
      permissions: userData.permissions || [],
      status: 'active',
      created_by: userData.createdBy || '',
      created_at: now,
      updated_at: now,
    };

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO users (id, institution_id, username, email, password_hash, full_name, role, permissions, status, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            user.id,
            user.institution_id,
            user.username,
            user.email,
            user.password_hash,
            user.full_name,
            user.role,
            JSON.stringify(user.permissions),
            user.status,
            user.created_by,
            user.created_at,
            user.updated_at,
          ]
        );
        return { success: true, user };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to create user in database.' };
      }
    }

    return { success: false, error: 'Database unavailable' };
  }

  /** Per-user UI preferences (theme, sidebar) stored in PostgreSQL. */
  public async getUserPreferences(userId: string): Promise<Record<string, any>> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT preferences FROM users WHERE id = $1', [userId]);
      const prefs = res.rows[0]?.preferences;
      return prefs && typeof prefs === 'object' ? prefs : {};
    }
    return {};
  }

  /** Shallow-merges the given keys into the user's stored preferences and returns the result. */
  public async updateUserPreferences(userId: string, patch: Record<string, any>): Promise<Record<string, any>> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `UPDATE users
            SET preferences = COALESCE(preferences, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
          WHERE id = $1
        RETURNING preferences`,
        [userId, JSON.stringify(patch)]
      );
      return res.rows[0]?.preferences || {};
    }
    return {};
  }

  public async getUserByUsername(username: string, institutionId?: string): Promise<DbUser | null> {
    await this.init();
    const clean = username.trim().toLowerCase();

    if (this.engine === 'postgres' && this.pgPool) {
      const query = institutionId
        ? 'SELECT * FROM users WHERE LOWER(username) = $1 AND institution_id = $2'
        : 'SELECT * FROM users WHERE LOWER(username) = $1';
      const params = institutionId ? [clean, institutionId] : [clean];
      const res = await this.pgPool.query(query, params);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        ...row,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
      };
    }

    return null;
  }

  public async getUserById(id: string): Promise<DbUser | null> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        ...row,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
      };
    }
    return null;
  }

  public async listUsers(institutionId: string): Promise<DbUser[]> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM users WHERE institution_id = $1 ORDER BY created_at ASC',
        [institutionId]
      );
      return res.rows.map((row) => ({
        ...row,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
      }));
    }
    return [];
  }

  public async updateUser(id: string, updates: Partial<DbUser>): Promise<boolean> {
    await this.init();
    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const fields: string[] = ['updated_at = $2'];
      const values: any[] = [id, now];
      let idx = 3;

      if (updates.full_name !== undefined) {
        fields.push(`full_name = $${idx++}`);
        values.push(updates.full_name);
      }
      if (updates.username !== undefined) {
        fields.push(`username = $${idx++}`);
        values.push(updates.username);
      }
      if (updates.email !== undefined) {
        fields.push(`email = $${idx++}`);
        values.push(updates.email);
      }
      if (updates.role !== undefined) {
        fields.push(`role = $${idx++}`);
        values.push(updates.role);
      }
      if (updates.permissions !== undefined) {
        fields.push(`permissions = $${idx++}`);
        values.push(JSON.stringify(updates.permissions));
      }
      if (updates.password_hash !== undefined) {
        fields.push(`password_hash = $${idx++}`);
        values.push(updates.password_hash);
      }
      if (updates.status !== undefined) {
        fields.push(`status = $${idx++}`);
        values.push(updates.status);
      }
      if (updates.must_change_password !== undefined) {
        fields.push(`must_change_password = $${idx++}`);
        values.push(updates.must_change_password);
      }
      if (updates.temp_password_expires_at !== undefined) {
        fields.push(`temp_password_expires_at = $${idx++}`);
        values.push(updates.temp_password_expires_at);
      }
      if (updates.last_login_at !== undefined) {
        fields.push(`last_login_at = $${idx++}`);
        values.push(updates.last_login_at);
      }

      const res = await this.pgPool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $1`, values);
      return (res.rowCount || 0) > 0;
    }

    return false;
  }

  public async deleteUser(institutionId: string, id: string): Promise<boolean> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`DELETE FROM users WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      return (res.rowCount || 0) > 0;
    }
    return false;
  }

  // --- Operator Invites ---

  // Alphabet deliberately excludes visually-ambiguous characters (0/O, 1/I/L)
  // to reduce transcription errors when a human types the code in by hand.
  private static readonly INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /**
   * Generates a cryptographically random invite code, e.g. "INV-7K4QF-M2XHD".
   * 10 random characters from a 32-symbol alphabet ≈ 50 bits of entropy
   * (~1.1 * 10^15 possibilities) — versus the previous 6-digit
   * Math.random()-based code, which had only 900,000 possible values drawn
   * from a non-cryptographic PRNG. Combined with rate limiting on the
   * validation/registration endpoints and the existing 14-day expiry, this
   * makes brute-forcing a valid invite code computationally infeasible.
   */
  private generateInviteCode(): string {
    const alphabet = DatabaseService.INVITE_CODE_ALPHABET;
    let raw = '';
    for (let i = 0; i < 10; i++) {
      raw += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return `INV-${raw.slice(0, 5)}-${raw.slice(5)}`;
  }

  public async createInvite(data: {
    institutionId: string;
    fullName: string;
    assignedRole: string;
    permissions: string[];
    createdBy: string;
    inviteCode?: string;
  }): Promise<{ success: boolean; invite?: DbOperatorInvite; error?: string }> {
    await this.init();
    const id = 'inv_' + crypto.randomBytes(8).toString('hex');
    const code = (data.inviteCode || this.generateInviteCode()).toUpperCase();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days validity

    const invite: DbOperatorInvite = {
      id,
      institution_id: data.institutionId,
      invite_code: code,
      full_name: data.fullName.trim(),
      assigned_role: data.assignedRole,
      permissions: data.permissions || [],
      expires_at: expiresAt,
      status: 'pending',
      created_by: data.createdBy,
      created_at: now,
    };

    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO operator_invites (id, institution_id, invite_code, full_name, assigned_role, permissions, expires_at, status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          invite.id,
          invite.institution_id,
          invite.invite_code,
          invite.full_name,
          invite.assigned_role,
          JSON.stringify(invite.permissions),
          invite.expires_at,
          invite.status,
          invite.created_by,
          invite.created_at,
        ]
      );
      return { success: true, invite };
    }

    return { success: false, error: 'Database unavailable' };
  }

  public async getInviteByCode(code: string): Promise<DbOperatorInvite | null> {
    await this.init();
    const clean = code.trim().toUpperCase();

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM operator_invites WHERE UPPER(invite_code) = $1',
        [clean]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        ...row,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
      };
    }

    return null;
  }

  public async listInvites(institutionId: string): Promise<DbOperatorInvite[]> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM operator_invites WHERE institution_id = $1 ORDER BY created_at DESC',
        [institutionId]
      );
      return res.rows.map((row) => ({
        ...row,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
      }));
    }
    return [];
  }

  public async claimInvite(code: string): Promise<boolean> {
    await this.init();
    const clean = code.trim().toUpperCase();
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(
        "UPDATE operator_invites SET status = 'claimed' WHERE UPPER(invite_code) = $1",
        [clean]
      );
      return true;
    }
    return false;
  }

  // --- Session Management & Validation Operations ---

  public async createSession(
    token: string,
    userId: string,
    institutionId: string,
    durationMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
  ): Promise<{ token: string; expiresAt: string }> {
    await this.init();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs).toISOString();
    const createdAt = now.toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO user_sessions (session_token, user_id, institution_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [token, userId, institutionId, expiresAt, createdAt]
      );
      return { token, expiresAt };
    }

    return { token, expiresAt };
  }

  public async getSessionWithUser(token: string): Promise<{
    session: { session_token: string; user_id: string; institution_id: string; expires_at: string };
    user: DbUser;
    institution: DbInstitution | null;
  } | null> {
    await this.init();
    const nowIso = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT s.session_token, s.user_id, s.institution_id, s.expires_at,
                u.username, u.email, u.full_name, u.role, u.permissions, u.status, u.must_change_password, u.temp_password_expires_at, u.platform_locked, u.created_by, u.last_login_at, u.created_at, u.updated_at
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires_at > $2`,
        [token, nowIso]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const user: DbUser = {
        id: row.user_id,
        institution_id: row.institution_id,
        username: row.username,
        email: row.email,
        password_hash: '', // Exclude password hash from session payloads
        full_name: row.full_name,
        role: row.role,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
        status: row.status,
        must_change_password: !!row.must_change_password,
        temp_password_expires_at: row.temp_password_expires_at ? new Date(row.temp_password_expires_at).toISOString() : null,
        platform_locked: !!row.platform_locked,
        created_by: row.created_by,
        last_login_at: row.last_login_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const institution = await this.getInstitutionById(row.institution_id);
      return {
        session: {
          session_token: row.session_token,
          user_id: row.user_id,
          institution_id: row.institution_id,
          expires_at: row.expires_at,
        },
        user,
        institution,
      };
    }

    return null;
  }



  /** Heavier, hourly picture: sizes, row estimates and orphan counts. */
  public async collectDbSnapshot(): Promise<void> {
    await this.init();
    if (!this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      const size = await client.query(`SELECT pg_database_size(current_database()) AS bytes`);
      const tables = await client.query(
        `SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes, c.reltuples::bigint AS rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND n.nspname = current_schema()
         ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 20`
      );
      const orphans = await this.orphanCounts(client);
      const payload = {
        dbBytes: Number(size.rows[0]?.bytes) || 0,
        tables: tables.rows.map((t: any) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
        orphans,
      };
      await client.query(
        `INSERT INTO platform_db_snapshots (ts, payload) VALUES (date_trunc('minute', NOW()), $1) ON CONFLICT (ts) DO NOTHING`,
        [JSON.stringify(payload)]
      );
    } finally {
      client.release();
    }
  }

  // --- Monitoring storage (see server/monitor.ts) ---

  public async insertApiMetrics(instance: string, rows: MonitorMetricRow[]): Promise<void> {
    await this.init();
    if (!this.pgPool || rows.length === 0) return;
    for (const r of rows) {
      await this.pgPool.query(
        `INSERT INTO platform_api_metrics (instance, minute, method, route, count, errors_4xx, errors_5xx, total_ms, max_ms, buckets)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (instance, minute, method, route) DO UPDATE SET
           count = platform_api_metrics.count + EXCLUDED.count,
           errors_4xx = platform_api_metrics.errors_4xx + EXCLUDED.errors_4xx,
           errors_5xx = platform_api_metrics.errors_5xx + EXCLUDED.errors_5xx,
           total_ms = platform_api_metrics.total_ms + EXCLUDED.total_ms,
           max_ms = GREATEST(platform_api_metrics.max_ms, EXCLUDED.max_ms),
           buckets = ARRAY(SELECT a + b FROM unnest(platform_api_metrics.buckets, EXCLUDED.buckets) AS t(a, b))`,
        [instance, r.minute, r.method, r.route, r.count, r.errors4xx, r.errors5xx, r.totalMs, r.maxMs, r.buckets]
      );
    }
  }

  public async insertErrorEvents(instance: string, events: MonitorEvent[]): Promise<void> {
    await this.init();
    if (!this.pgPool || events.length === 0) return;
    const cols = 13;
    const params: any[] = [];
    const tuples = events.map((e, i) => {
      params.push(e.ts, instance, e.kind, e.institutionId || null, e.userId || null, e.method || null, e.route || null,
        e.status ?? null, e.code || null, e.message || null, e.requestId || null, e.durationMs ?? null, e.meta ? JSON.stringify(e.meta) : null);
      const b = i * cols;
      return `(${Array.from({ length: cols }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    await this.pgPool.query(
      `INSERT INTO platform_error_events (ts, instance, kind, institution_id, user_id, method, route, status, code, message, request_id, duration_ms, meta)
       VALUES ${tuples.join(',')}`,
      params
    );
  }

  public async insertDbSamples(instance: string, samples: MonitorDbSample[]): Promise<void> {
    await this.init();
    if (!this.pgPool || samples.length === 0) return;
    for (const s of samples) {
      await this.pgPool.query(
        `INSERT INTO platform_db_samples (instance, ts, ok, latency_ms, pool_total, pool_idle, pool_waiting, connections, db_size_bytes,
                                          xact_commit, xact_rollback, deadlocks, blks_hit, blks_read, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (instance, ts) DO NOTHING`,
        [instance, s.ts, s.ok, s.latencyMs ?? null, s.poolTotal ?? null, s.poolIdle ?? null, s.poolWaiting ?? null, s.connections ?? null,
         s.dbSizeBytes ?? null, s.xactCommit ?? null, s.xactRollback ?? null, s.deadlocks ?? null, s.blksHit ?? null, s.blksRead ?? null,
         s.error ? String(s.error).slice(0, 300) : null]
      );
    }
  }

  /** Counters and size for the current database, from the server's own statistics views. */
  public async collectDbStats(): Promise<Omit<MonitorDbSample, 'ts' | 'ok' | 'latencyMs' | 'error'>> {
    await this.init();
    if (!this.pgPool) throw new Error('PostgreSQL database pool not configured');
    const r = await this.pgPool.query(
      `SELECT numbackends, xact_commit, xact_rollback, deadlocks, blks_hit, blks_read, pg_database_size(current_database()) AS size
       FROM pg_stat_database WHERE datname = current_database()`
    );
    const row = r.rows[0] || {};
    const pool = this.getPoolStats();
    return {
      poolTotal: pool?.totalCount, poolIdle: pool?.idleCount, poolWaiting: pool?.waitingCount,
      connections: row.numbackends != null ? Number(row.numbackends) : undefined,
      dbSizeBytes: row.size != null ? Number(row.size) : undefined,
      xactCommit: row.xact_commit != null ? Number(row.xact_commit) : undefined,
      xactRollback: row.xact_rollback != null ? Number(row.xact_rollback) : undefined,
      deadlocks: row.deadlocks != null ? Number(row.deadlocks) : undefined,
      blksHit: row.blks_hit != null ? Number(row.blks_hit) : undefined,
      blksRead: row.blks_read != null ? Number(row.blks_read) : undefined,
    };
  }

  // --- Monitoring reads (platform dashboards) ---

  /** Edges (ms) of the latency histogram; must match LATENCY_BUCKETS_MS in server/monitor.ts. */
  private static readonly LAT_EDGES = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

  /** Percentile estimated from histogram counts: the upper edge of the bucket that holds it (the last bucket reports its lower edge). */
  private static histPercentile(hist: number[], p: number): number | null {
    const total = hist.reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const target = total * p;
    let run = 0;
    for (let i = 0; i < hist.length; i++) {
      run += hist[i];
      if (run >= target) return i < DatabaseService.LAT_EDGES.length ? DatabaseService.LAT_EDGES[i] : DatabaseService.LAT_EDGES[DatabaseService.LAT_EDGES.length - 1];
    }
    return null;
  }

  public async getApiHealth(windowMinutes: number, stepMinutes: number): Promise<any> {
    await this.init();
    if (!this.pgPool) throw new Error('No database engine available.');
    const stepSec = stepMinutes * 60;
    const histCols = Array.from({ length: 11 }, (_, i) => `COALESCE(SUM(buckets[${i + 1}]),0)::int`).join(', ');
    const since = `NOW() - make_interval(mins => $1)`;
    const series = await this.pgPool.query(
      `SELECT to_timestamp(floor(extract(epoch FROM minute) / ${stepSec}) * ${stepSec}) AS t,
              SUM(count)::int AS count, SUM(errors_4xx)::int AS e4, SUM(errors_5xx)::int AS e5,
              SUM(total_ms)::bigint AS total_ms, MAX(max_ms) AS max_ms, ARRAY[${histCols}] AS hist
       FROM platform_api_metrics WHERE minute >= ${since} GROUP BY 1 ORDER BY 1`,
      [windowMinutes]
    );
    const routes = await this.pgPool.query(
      `SELECT method, route, SUM(count)::int AS count, SUM(errors_4xx)::int AS e4, SUM(errors_5xx)::int AS e5,
              SUM(total_ms)::bigint AS total_ms, MAX(max_ms) AS max_ms, ARRAY[${histCols}] AS hist
       FROM platform_api_metrics WHERE minute >= ${since} GROUP BY method, route`,
      [windowMinutes]
    );
    const bucketRow = (r: any) => {
      const hist = (r.hist as number[]).map(Number);
      const count = Number(r.count) || 0;
      return {
        count, errors4xx: Number(r.e4) || 0, errors5xx: Number(r.e5) || 0,
        avgMs: count ? Math.round(Number(r.total_ms) / count) : null,
        p50Ms: DatabaseService.histPercentile(hist, 0.5), p95Ms: DatabaseService.histPercentile(hist, 0.95),
        maxMs: Number(r.max_ms) || 0, hist,
      };
    };
    const seriesOut = series.rows.map((r: any) => ({ t: new Date(r.t).toISOString(), ...bucketRow(r) }));
    const routesOut = routes.rows.map((r: any) => ({ method: r.method, route: r.route, ...bucketRow(r) }));
    const totalsHist = new Array(11).fill(0);
    let count = 0, e4 = 0, e5 = 0, totalMs = 0, maxMs = 0;
    for (const r of series.rows) {
      count += Number(r.count); e4 += Number(r.e4); e5 += Number(r.e5); totalMs += Number(r.total_ms); maxMs = Math.max(maxMs, Number(r.max_ms) || 0);
      (r.hist as number[]).forEach((v, i) => (totalsHist[i] += Number(v)));
    }
    return {
      windowMinutes, stepMinutes,
      totals: {
        count, errors4xx: e4, errors5xx: e5, avgMs: count ? Math.round(totalMs / count) : null,
        p50Ms: DatabaseService.histPercentile(totalsHist, 0.5), p95Ms: DatabaseService.histPercentile(totalsHist, 0.95), maxMs,
        requestsPerMinute: windowMinutes ? Math.round((count / windowMinutes) * 10) / 10 : 0,
        errorRate5xx: count ? e5 / count : 0, errorRate4xx: count ? e4 / count : 0,
      },
      series: seriesOut,
      routes: routesOut,
      latencyEdgesMs: DatabaseService.LAT_EDGES,
    };
  }

  /** Where this server connects to, without the password. */
  public getConnectionInfo(): { host?: string; port?: number; database?: string; user?: string; source: string } {
    const url = process.env.DATABASE_URL;
    try {
      if (url) {
        const u = new URL(url.trim());
        return { host: u.hostname, port: u.port ? Number(u.port) : 5432, database: u.pathname.replace(/^\//, ''), user: decodeURIComponent(u.username), source: 'DATABASE_URL' };
      }
    } catch {
      /* fall through to the pool's own settings */
    }
    // Same defaults as the connection setup above; never the password.
    return {
      host: process.env.POSTGRES_HOST || '127.0.0.1', port: Number(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'school_db', user: process.env.POSTGRES_USER || 'postgres', source: 'POSTGRES_* settings',
    };
  }

  public async getDatabaseHealth(windowMinutes: number, stepMinutes: number): Promise<any> {
    await this.init();
    if (!this.pgPool) throw new Error('No database engine available.');
    const stepSec = stepMinutes * 60;
    const rows = (
      await this.pgPool.query(
        `SELECT ts, ok, latency_ms, pool_total, pool_idle, pool_waiting, connections, db_size_bytes, xact_commit, xact_rollback, deadlocks, blks_hit, blks_read
         FROM platform_db_samples WHERE ts >= NOW() - make_interval(mins => $1) ORDER BY ts`,
        [windowMinutes]
      )
    ).rows;
    // Counters are cumulative; take differences between consecutive samples (a drop means the server restarted: skip that step).
    const buckets = new Map<number, any>();
    let prev: any = null;
    for (const r of rows) {
      const t = Math.floor(new Date(r.ts).getTime() / 1000 / stepSec) * stepSec * 1000;
      const b = buckets.get(t) || { t: new Date(t).toISOString(), samples: 0, failed: 0, latSum: 0, latN: 0, latMax: 0, poolInUseMax: 0, poolWaitingMax: 0, connectionsMax: 0, rollbacks: 0, commits: 0, deadlocks: 0, hit: 0, read: 0 };
      b.samples++;
      if (!r.ok) b.failed++;
      if (r.latency_ms != null) { b.latSum += r.latency_ms; b.latN++; b.latMax = Math.max(b.latMax, r.latency_ms); }
      if (r.pool_total != null) b.poolInUseMax = Math.max(b.poolInUseMax, r.pool_total - (r.pool_idle || 0));
      if (r.pool_waiting != null) b.poolWaitingMax = Math.max(b.poolWaitingMax, r.pool_waiting);
      if (r.connections != null) b.connectionsMax = Math.max(b.connectionsMax, r.connections);
      if (r.ok && r.xact_commit != null) {
        if (prev && Number(r.xact_commit) >= Number(prev.xact_commit)) {
          b.commits += Number(r.xact_commit) - Number(prev.xact_commit);
          b.rollbacks += Number(r.xact_rollback) - Number(prev.xact_rollback);
          b.deadlocks += Number(r.deadlocks) - Number(prev.deadlocks);
          b.hit += Number(r.blks_hit) - Number(prev.blks_hit);
          b.read += Number(r.blks_read) - Number(prev.blks_read);
        }
        prev = r;
      }
      buckets.set(t, b);
    }
    const series = [...buckets.values()].map((b) => ({
      t: b.t, samples: b.samples, failed: b.failed, latencyAvgMs: b.latN ? Math.round(b.latSum / b.latN) : null, latencyMaxMs: b.latN ? b.latMax : null,
      poolInUseMax: b.poolInUseMax, poolWaitingMax: b.poolWaitingMax, connectionsMax: b.connectionsMax,
      rollbacks: b.rollbacks, commits: b.commits, deadlocks: b.deadlocks,
      cacheHitRatio: b.hit + b.read > 0 ? b.hit / (b.hit + b.read) : null,
    }));
    const okRows = rows.filter((r: any) => r.ok).length;
    const sumRollbacks = series.reduce((a, b) => a + b.rollbacks, 0);
    const sumCommits = series.reduce((a, b) => a + b.commits, 0);
    const sumDeadlocks = series.reduce((a, b) => a + b.deadlocks, 0);
    const lat = rows.filter((r: any) => r.latency_ms != null).map((r: any) => Number(r.latency_ms)).sort((a: number, b: number) => a - b);

    // Live view (read now, not sampled). Only the kind of statement is shown, never its text.
    const live: any = {};
    try {
      const a = await this.pgPool.query(
        `SELECT state, COALESCE(wait_event_type,'') AS wait, split_part(regexp_replace(trim(query), '\\s+', ' ', 'g'), ' ', 1) AS verb,
                EXTRACT(EPOCH FROM (NOW() - query_start))::float AS secs
         FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`
      );
      const byState: Record<string, number> = {};
      for (const r of a.rows) byState[r.state || 'unknown'] = (byState[r.state || 'unknown'] || 0) + 1;
      live.connectionsByState = byState;
      live.longRunning = a.rows
        .filter((r: any) => r.state === 'active' && r.secs > 5)
        .sort((x: any, y: any) => y.secs - x.secs).slice(0, 10)
        .map((r: any) => ({ verb: String(r.verb || '').toUpperCase().slice(0, 12), seconds: Math.round(r.secs), wait: r.wait || null }));
      live.idleInTransaction = a.rows.filter((r: any) => r.state === 'idle in transaction' && r.secs > 30).length;
      live.lockWaiters = Number((await this.pgPool.query(`SELECT COUNT(*) n FROM pg_locks WHERE NOT granted`)).rows[0]?.n) || 0;
      const meta = await this.pgPool.query(
        `SELECT current_setting('server_version') AS version, current_setting('max_connections')::int AS max_connections,
                EXTRACT(EPOCH FROM (NOW() - pg_postmaster_start_time()))::bigint AS uptime_s, pg_database_size(current_database()) AS size`
      );
      live.version = meta.rows[0]?.version; live.maxConnections = meta.rows[0]?.max_connections;
      live.uptimeSeconds = Number(meta.rows[0]?.uptime_s) || 0; live.sizeBytes = Number(meta.rows[0]?.size) || 0;
      live.activeSessions = Number((await this.pgPool.query(`SELECT COUNT(*) n FROM user_sessions WHERE expires_at > NOW()`)).rows[0]?.n) || 0;
      live.schools = Number((await this.pgPool.query(`SELECT COUNT(*) n FROM institutions`)).rows[0]?.n) || 0;
    } catch (err: any) {
      live.error = 'The live statistics could not be read.';
    }
    const snap = (await this.pgPool.query(`SELECT ts, payload FROM platform_db_snapshots ORDER BY ts DESC LIMIT 1`)).rows[0];
    const sizeSeries = (await this.pgPool.query(`SELECT ts, (payload->>'dbBytes')::bigint AS bytes FROM platform_db_snapshots WHERE ts >= NOW() - INTERVAL '30 days' ORDER BY ts`)).rows
      .map((r: any) => ({ t: new Date(r.ts).toISOString(), bytes: Number(r.bytes) }));
    const pool = this.getPoolStats();
    return {
      windowMinutes, stepMinutes,
      connection: this.getConnectionInfo(),
      pool: pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : null,
      summary: {
        samples: rows.length, availability: rows.length ? okRows / rows.length : null,
        latencyP50Ms: lat.length ? lat[Math.floor(lat.length * 0.5)] : null, latencyP95Ms: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null,
        rollbackRatio: sumCommits + sumRollbacks > 0 ? sumRollbacks / (sumCommits + sumRollbacks) : null, deadlocks: sumDeadlocks,
      },
      series, live,
      snapshot: snap ? { at: new Date(snap.ts).toISOString(), ...snap.payload } : null,
      sizeSeries,
    };
  }

  public async getErrorOverview(
    windowMinutes: number,
    stepMinutes: number,
    f: { kind?: string; institutionId?: string; route?: string; requestId?: string; limit?: number }
  ): Promise<any> {
    await this.init();
    if (!this.pgPool) throw new Error('No database engine available.');
    const stepSec = stepMinutes * 60;
    const w = `ts >= NOW() - make_interval(mins => $1)`;
    const byKind = await this.pgPool.query(`SELECT kind, COUNT(*)::int AS n FROM platform_error_events WHERE ${w} GROUP BY kind ORDER BY n DESC`, [windowMinutes]);
    const series = await this.pgPool.query(
      `SELECT to_timestamp(floor(extract(epoch FROM ts) / ${stepSec}) * ${stepSec}) AS t, kind, COUNT(*)::int AS n
       FROM platform_error_events WHERE ${w} GROUP BY 1, 2 ORDER BY 1`,
      [windowMinutes]
    );
    const byRoute = await this.pgPool.query(
      `SELECT COALESCE(method,'') AS method, COALESCE(route,'') AS route, kind, COUNT(*)::int AS n
       FROM platform_error_events WHERE ${w} AND route IS NOT NULL GROUP BY 1,2,3 ORDER BY n DESC LIMIT 60`,
      [windowMinutes]
    );
    const bySchool = await this.pgPool.query(
      `SELECT e.institution_id AS id, COALESCE(i.name, '(deleted school)') AS name, COUNT(*)::int AS n
       FROM platform_error_events e LEFT JOIN institutions i ON i.id = e.institution_id
       WHERE e.${w} AND e.institution_id IS NOT NULL GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`,
      [windowMinutes]
    );
    const params: any[] = [windowMinutes];
    let where = `e.${w}`;
    if (f.kind) { params.push(f.kind); where += ` AND e.kind = $${params.length}`; }
    if (f.institutionId) { params.push(f.institutionId); where += ` AND e.institution_id = $${params.length}`; }
    if (f.route) { params.push(f.route); where += ` AND e.route = $${params.length}`; }
    if (f.requestId) { params.push(f.requestId); where += ` AND e.request_id = $${params.length}`; }
    params.push(Math.min(Math.max(f.limit || 100, 1), 500));
    const recent = await this.pgPool.query(
      `SELECT e.id, e.ts, e.kind, e.institution_id, COALESCE(i.name, NULL) AS school, e.method, e.route, e.status, e.code, e.message, e.request_id, e.duration_ms, e.meta
       FROM platform_error_events e LEFT JOIN institutions i ON i.id = e.institution_id
       WHERE ${where} ORDER BY e.ts DESC LIMIT $${params.length}`,
      params
    );
    return {
      windowMinutes, stepMinutes,
      byKind: byKind.rows,
      series: series.rows.map((r: any) => ({ t: new Date(r.t).toISOString(), kind: r.kind, n: r.n })),
      byRoute: byRoute.rows,
      bySchool: bySchool.rows,
      recent: recent.rows.map((r: any) => ({
        id: String(r.id), ts: new Date(r.ts).toISOString(), kind: r.kind, institutionId: r.institution_id, school: r.school, method: r.method, route: r.route,
        status: r.status, code: r.code, message: r.message, requestId: r.request_id, durationMs: r.duration_ms, meta: r.meta,
      })),
    };
  }

  public async purgeMonitoring(metricsDays: number, eventDays: number): Promise<{ metrics: number; samples: number; events: number }> {
    await this.init();
    if (!this.pgPool) return { metrics: 0, samples: 0, events: 0 };
    const m = await this.pgPool.query(`DELETE FROM platform_api_metrics WHERE minute < NOW() - make_interval(days => $1)`, [metricsDays]);
    const s = await this.pgPool.query(`DELETE FROM platform_db_samples WHERE ts < NOW() - make_interval(days => $1)`, [metricsDays]);
    const e = await this.pgPool.query(`DELETE FROM platform_error_events WHERE ts < NOW() - make_interval(days => $1)`, [eventDays]);
    await this.pgPool.query(`DELETE FROM platform_db_snapshots WHERE ts < NOW() - INTERVAL '180 days'`);
    return { metrics: m.rowCount || 0, samples: s.rowCount || 0, events: e.rowCount || 0 };
  }

  // --- Platform (app owner) identity ---

  private platformAdminRow(row: any): DbPlatformAdmin {
    return {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      full_name: row.full_name,
      role: row.role,
      status: row.status,
      last_login_at: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
    };
  }

  public async getPlatformAdminByUsername(username: string): Promise<DbPlatformAdmin | null> {
    await this.init();
    if (!this.pgPool) return null;
    const r = await this.pgPool.query(`SELECT * FROM platform_admins WHERE LOWER(username) = LOWER($1)`, [username]);
    return r.rows.length ? this.platformAdminRow(r.rows[0]) : null;
  }

  public async getPlatformAdminById(id: string): Promise<DbPlatformAdmin | null> {
    await this.init();
    if (!this.pgPool) return null;
    const r = await this.pgPool.query(`SELECT * FROM platform_admins WHERE id = $1`, [id]);
    return r.rows.length ? this.platformAdminRow(r.rows[0]) : null;
  }

  public async listPlatformAdmins(): Promise<DbPlatformAdmin[]> {
    await this.init();
    if (!this.pgPool) return [];
    const r = await this.pgPool.query(`SELECT * FROM platform_admins ORDER BY created_at`);
    return r.rows.map((x: any) => this.platformAdminRow(x));
  }

  public async createPlatformAdmin(a: {
    username: string;
    passwordHash: string;
    fullName: string;
    role: string;
    createdBy?: string;
  }): Promise<DbPlatformAdmin> {
    await this.init();
    if (!this.pgPool) throw new Error('No database engine available.');
    const id = `padm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    await this.pgPool.query(
      `INSERT INTO platform_admins (id, username, password_hash, full_name, role, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'active',$6)`,
      [id, a.username.trim().toLowerCase(), a.passwordHash, a.fullName.trim(), a.role, a.createdBy || null]
    );
    return (await this.getPlatformAdminById(id)) as DbPlatformAdmin;
  }

  public async updatePlatformAdmin(
    id: string,
    u: { fullName?: string; role?: string; status?: string; passwordHash?: string; lastLoginAt?: string }
  ): Promise<void> {
    await this.init();
    if (!this.pgPool) return;
    const sets: string[] = [];
    const vals: any[] = [];
    const add = (col: string, v: any) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (u.fullName !== undefined) add('full_name', u.fullName);
    if (u.role !== undefined) add('role', u.role);
    if (u.status !== undefined) add('status', u.status);
    if (u.passwordHash !== undefined) add('password_hash', u.passwordHash);
    if (u.lastLoginAt !== undefined) add('last_login_at', u.lastLoginAt);
    if (sets.length === 0) return;
    sets.push('updated_at = NOW()');
    vals.push(id);
    await this.pgPool.query(`UPDATE platform_admins SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  }

  public async countActivePlatformOwners(): Promise<number> {
    await this.init();
    if (!this.pgPool) return 0;
    const r = await this.pgPool.query(`SELECT COUNT(*) n FROM platform_admins WHERE role = 'owner' AND status = 'active'`);
    return Number(r.rows[0]?.n) || 0;
  }

  public async createPlatformSession(token: string, adminId: string, durationMs: number): Promise<void> {
    await this.init();
    if (!this.pgPool) throw new Error('No database engine available.');
    await this.pgPool.query(
      `INSERT INTO platform_sessions (session_token, admin_id, expires_at) VALUES ($1,$2,$3)`,
      [token, adminId, new Date(Date.now() + durationMs).toISOString()]
    );
  }

  /** The session's admin, only while the session is unexpired. The caller must still check the admin's status. */
  public async getPlatformSession(token: string): Promise<DbPlatformAdmin | null> {
    await this.init();
    if (!this.pgPool) return null;
    const r = await this.pgPool.query(
      `SELECT a.* FROM platform_sessions s JOIN platform_admins a ON a.id = s.admin_id
       WHERE s.session_token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    return r.rows.length ? this.platformAdminRow(r.rows[0]) : null;
  }

  public async deletePlatformSession(token: string): Promise<void> {
    await this.init();
    if (this.pgPool) await this.pgPool.query(`DELETE FROM platform_sessions WHERE session_token = $1`, [token]);
  }

  public async deletePlatformAdminSessions(adminId: string): Promise<void> {
    await this.init();
    if (this.pgPool) await this.pgPool.query(`DELETE FROM platform_sessions WHERE admin_id = $1`, [adminId]);
  }

  public async appendPlatformAudit(e: {
    adminId?: string;
    adminUsername?: string;
    adminRole?: string;
    actionType: string;
    actionTitle?: string;
    description?: string;
    targetInstitutionId?: string;
    targetUserId?: string;
    metadata?: Record<string, any>;
  }, client?: any): Promise<void> {
    await this.init();
    if (!this.pgPool) return;
    const id = `paud_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    await (client || this.pgPool).query(
      `INSERT INTO platform_audit_logs (id, admin_id, admin_username, admin_role, action_type, action_title, description, target_institution_id, target_user_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, e.adminId || null, e.adminUsername || null, e.adminRole || null, e.actionType, e.actionTitle || null, e.description || null,
       e.targetInstitutionId || null, e.targetUserId || null, e.metadata ? JSON.stringify(e.metadata) : null]
    );
  }

  public async listPlatformAudit(limit = 200): Promise<any[]> {
    await this.init();
    if (!this.pgPool) return [];
    const r = await this.pgPool.query(
      `SELECT a.*, i.name AS school_name FROM platform_audit_logs a LEFT JOIN institutions i ON i.id = a.target_institution_id
       ORDER BY a.timestamp DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 1000)]
    );
    return r.rows.map((x: any) => ({
      schoolName: x.school_name || null,
      id: x.id, timestamp: new Date(x.timestamp).toISOString(), adminId: x.admin_id, adminUsername: x.admin_username, adminRole: x.admin_role,
      actionType: x.action_type, actionTitle: x.action_title, description: x.description,
      targetInstitutionId: x.target_institution_id, targetUserId: x.target_user_id, metadata: x.metadata,
    }));
  }

  // ---- Platform support actions (app owner / support staff) ----
  // Each action runs in one transaction with its audit entries (the platform's and the school's own), so
  // an action is never half-recorded. Admin identity is passed in by the platform route, never read here.

  private async supportAudit(
    client: any,
    admin: { id: string; username: string; role: string },
    institutionId: string,
    e: { actionType: string; title: string; description: string; targetUserId?: string; targetLabel?: string; metadata?: Record<string, any> }
  ): Promise<void> {
    await this.appendPlatformAudit(
      { adminId: admin.id, adminUsername: admin.username, adminRole: admin.role, actionType: e.actionType, actionTitle: e.title, description: e.description,
        targetInstitutionId: institutionId, targetUserId: e.targetUserId, metadata: e.metadata },
      client
    );
    await this.appendAuditLog(institutionId, {
      operatorUsername: `platform:${admin.username}`, operatorName: 'Platform support', operatorRole: 'Platform',
      actionType: 'operator_security', actionTitle: e.title, module: 'Security', description: e.description,
      targetId: e.targetUserId, targetLabel: e.targetLabel,
    }, client);
  }

  public async countRecentPlatformActions(adminId: string, actionType: string, minutes: number): Promise<number> {
    await this.init();
    if (!this.pgPool) return 0;
    const r = await this.pgPool.query(
      `SELECT COUNT(*)::int AS n FROM platform_audit_logs WHERE admin_id = $1 AND action_type = $2 AND timestamp >= NOW() - make_interval(mins => $3)`,
      [adminId, actionType, minutes]
    );
    return r.rows[0].n;
  }

  public async listSchoolsForPlatform(): Promise<any[]> {
    await this.init();
    if (!this.pgPool) return [];
    const r = await this.pgPool.query(
      `SELECT i.id, i.name, i.code, i.status, i.suspended_at, i.suspended_by, i.suspend_reason, i.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.institution_id = i.id) AS users,
              (SELECT COUNT(*)::int FROM users u WHERE u.institution_id = i.id AND u.status = 'active') AS active_users,
              (SELECT MAX(u.last_login_at) FROM users u WHERE u.institution_id = i.id) AS last_login,
              (SELECT COUNT(*)::int FROM user_sessions s WHERE s.institution_id = i.id AND s.expires_at > NOW()) AS sessions,
              (SELECT COUNT(*)::int FROM platform_error_events e WHERE e.institution_id = i.id AND e.ts >= NOW() - INTERVAL '7 days'
                 AND e.kind IN ('server_error','conflict','rejected','aborted','client_network','unhandled_exception')) AS errors7d
       FROM institutions i ORDER BY i.name ASC`
    );
    return r.rows.map((x: any) => ({
      id: x.id, name: x.name, code: x.code, status: x.status,
      suspendedAt: x.suspended_at ? new Date(x.suspended_at).toISOString() : null, suspendedBy: x.suspended_by, suspendReason: x.suspend_reason,
      createdAt: x.created_at ? new Date(x.created_at).toISOString() : null,
      users: x.users, activeUsers: x.active_users, lastLogin: x.last_login ? new Date(x.last_login).toISOString() : null,
      sessions: x.sessions, errors7d: x.errors7d,
    }));
  }

  public async listSchoolUsersForPlatform(institutionId: string): Promise<any[] | null> {
    await this.init();
    if (!this.pgPool) return null;
    const inst = await this.pgPool.query(`SELECT 1 FROM institutions WHERE id = $1`, [institutionId]);
    if (inst.rowCount === 0) return null;
    const r = await this.pgPool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.status, u.last_login_at, u.must_change_password, u.temp_password_expires_at, u.platform_locked,
              (SELECT COUNT(*)::int FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS sessions
       FROM users u WHERE u.institution_id = $1 ORDER BY u.created_at ASC`,
      [institutionId]
    );
    return r.rows.map((x: any) => ({
      id: x.id, username: x.username, name: x.full_name, role: x.role, status: x.status,
      lastLogin: x.last_login_at ? new Date(x.last_login_at).toISOString() : null,
      mustChangePassword: !!x.must_change_password,
      tempPasswordExpiresAt: x.temp_password_expires_at ? new Date(x.temp_password_expires_at).toISOString() : null,
      platformLocked: !!x.platform_locked, sessions: x.sessions,
    }));
  }

  /** Sets a one-time password the user must replace at next login, ends their sessions. Null if the user is not in that school. */
  public async platformResetUserPassword(
    admin: { id: string; username: string; role: string }, institutionId: string, userId: string, passwordHash: string, expiresAt: Date
  ): Promise<{ username: string; sessionsEnded: number } | null> {
    await this.init();
    return this.withTx(async (c) => {
      const u = await c.query(`SELECT id, username, full_name FROM users WHERE id = $1 AND institution_id = $2 FOR UPDATE`, [userId, institutionId]);
      if (u.rowCount === 0) return null;
      await c.query(
        `UPDATE users SET password_hash = $1, must_change_password = TRUE, temp_password_expires_at = $2, updated_at = NOW() WHERE id = $3`,
        [passwordHash, expiresAt.toISOString(), userId]
      );
      const del = await c.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
      await this.supportAudit(c, admin, institutionId, {
        actionType: 'user_password_reset', title: 'Operator Password Reset by Platform Support',
        description: `A temporary password was issued for '${u.rows[0].username}'. It must be changed at next sign-in; all sessions were ended.`,
        targetUserId: userId, targetLabel: u.rows[0].full_name, metadata: { sessionsEnded: del.rowCount, expiresAt: expiresAt.toISOString() },
      });
      return { username: u.rows[0].username, sessionsEnded: del.rowCount || 0 };
    });
  }

  public async platformRevokeUserSessions(admin: { id: string; username: string; role: string }, institutionId: string, userId: string): Promise<{ sessionsEnded: number } | null> {
    await this.init();
    return this.withTx(async (c) => {
      const u = await c.query(`SELECT username, full_name FROM users WHERE id = $1 AND institution_id = $2`, [userId, institutionId]);
      if (u.rowCount === 0) return null;
      const del = await c.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
      await this.supportAudit(c, admin, institutionId, {
        actionType: 'user_sessions_revoked', title: 'Operator Signed Out by Platform Support',
        description: `All sessions for '${u.rows[0].username}' were ended (${del.rowCount}).`, targetUserId: userId, targetLabel: u.rows[0].full_name, metadata: { sessionsEnded: del.rowCount },
      });
      return { sessionsEnded: del.rowCount || 0 };
    });
  }

  public async platformRevokeSchoolSessions(admin: { id: string; username: string; role: string }, institutionId: string): Promise<{ sessionsEnded: number } | null> {
    await this.init();
    return this.withTx(async (c) => {
      const i = await c.query(`SELECT name FROM institutions WHERE id = $1`, [institutionId]);
      if (i.rowCount === 0) return null;
      const del = await c.query(`DELETE FROM user_sessions WHERE institution_id = $1`, [institutionId]);
      await this.supportAudit(c, admin, institutionId, {
        actionType: 'school_sessions_revoked', title: 'All Operators Signed Out by Platform Support',
        description: `All sessions of the school were ended (${del.rowCount}).`, metadata: { sessionsEnded: del.rowCount },
      });
      return { sessionsEnded: del.rowCount || 0 };
    });
  }

  /** Deactivate or reactivate one user. Refuses to deactivate the last active admin (code LAST_ADMIN). */
  public async platformSetUserActive(
    admin: { id: string; username: string; role: string }, institutionId: string, userId: string, active: boolean
  ): Promise<{ username: string; sessionsEnded: number } | null> {
    await this.init();
    return this.withTx(async (c) => {
      const u = await c.query(`SELECT id, username, full_name, role, permissions, status FROM users WHERE id = $1 AND institution_id = $2 FOR UPDATE`, [userId, institutionId]);
      if (u.rowCount === 0) return null;
      const row = u.rows[0];
      let ended = 0;
      if (!active) {
        const isAdmin = row.role === 'Admin' || (Array.isArray(row.permissions) && row.permissions.includes('*'));
        if (isAdmin && row.status === 'active') {
          const others = await c.query(
            `SELECT COUNT(*)::int AS n FROM users WHERE institution_id = $1 AND id <> $2 AND status = 'active' AND (role = 'Admin' OR permissions ? '*')`,
            [institutionId, userId]
          );
          if (others.rows[0].n === 0) { const e: any = new Error('This is the last active administrator of the school.'); e.code = 'LAST_ADMIN'; throw e; }
        }
        await c.query(`UPDATE users SET status = 'deactivated', platform_locked = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);
        ended = (await c.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId])).rowCount || 0;
      } else {
        await c.query(`UPDATE users SET status = 'active', platform_locked = FALSE, updated_at = NOW() WHERE id = $1`, [userId]);
      }
      await this.supportAudit(c, admin, institutionId, {
        actionType: active ? 'user_reactivated' : 'user_deactivated',
        title: active ? 'Operator Account Reactivated by Platform Support' : 'Operator Account Deactivated by Platform Support',
        description: `Account '${row.username}' was ${active ? 'reactivated' : 'deactivated'}.`, targetUserId: userId, targetLabel: row.full_name, metadata: { sessionsEnded: ended },
      });
      return { username: row.username, sessionsEnded: ended };
    });
  }

  public async platformSetSchoolSuspended(
    admin: { id: string; username: string; role: string }, institutionId: string, suspend: boolean, reason: string
  ): Promise<{ name: string; sessionsEnded: number } | null> {
    await this.init();
    return this.withTx(async (c) => {
      const i = await c.query(`SELECT id, name, status FROM institutions WHERE id = $1 FOR UPDATE`, [institutionId]);
      if (i.rowCount === 0) return null;
      let ended = 0;
      if (suspend) {
        await c.query(`UPDATE institutions SET status = 'suspended', suspended_at = NOW(), suspended_by = $1, suspend_reason = $2, updated_at = NOW() WHERE id = $3`, [admin.username, reason, institutionId]);
        ended = (await c.query(`DELETE FROM user_sessions WHERE institution_id = $1`, [institutionId])).rowCount || 0;
      } else {
        await c.query(`UPDATE institutions SET status = 'active', suspended_at = NULL, suspended_by = NULL, suspend_reason = NULL, updated_at = NOW() WHERE id = $1`, [institutionId]);
      }
      await this.supportAudit(c, admin, institutionId, {
        actionType: suspend ? 'school_suspended' : 'school_reactivated',
        title: suspend ? 'School Suspended by Platform' : 'School Reactivated by Platform',
        description: suspend ? `School access was suspended. Reason: ${reason}` : 'School access was restored.', metadata: { sessionsEnded: ended, reason: suspend ? reason : undefined },
      });
      return { name: i.rows[0].name, sessionsEnded: ended };
    });
  }

  /** School-side: the signed-in user sets a new password. Clears the forced-change flag, ends their other sessions. */
  public async changeOwnPassword(userId: string, passwordHash: string, keepToken: string): Promise<void> {
    await this.init();
    await this.withTx(async (c) => {
      await c.query(`UPDATE users SET password_hash = $1, must_change_password = FALSE, temp_password_expires_at = NULL, updated_at = NOW() WHERE id = $2`, [passwordHash, userId]);
      await c.query(`DELETE FROM user_sessions WHERE user_id = $1 AND session_token <> $2`, [userId, keepToken]);
    });
  }

  public async deleteSession(token: string): Promise<boolean> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
      return true;
    }
    return false;
  }

  public async deleteUserSessions(userId: string): Promise<boolean> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      return true;
    }
    return false;
  }

  /**
   * Atomically reserves a block of `count` monotonic sequence numbers.
   * Advances the sequence by count in a single O(1) statement and returns { start, end, count }.
   */
  public async nextSequenceBlock(
    institutionId: string,
    prefix: string,
    year: string,
    count: number = 1
  ): Promise<{ start: number; end: number; count: number }> {
    const safeCount = Math.max(1, count);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const now = new Date().toISOString();
    const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
    const cleanYear = (year || new Date().getFullYear().toString()).trim();

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (institution_id, prefix, year)
         DO UPDATE SET last_value = system_sequences.last_value + $4, updated_at = $5
         RETURNING last_value`,
        [tenantId, cleanPrefix, cleanYear, safeCount, now]
      );
      const end = Number(res.rows[0].last_value);
      const start = end - safeCount + 1;
      return { start, end, count: safeCount };
    }

    // The database is the single source of truth for document numbering.
    // There is deliberately no in-memory fallback: a process-local counter would
    // restart from 1 and could issue duplicate numbers.
    throw new Error('Document numbering requires an active PostgreSQL connection.');
  }

  /**
   * Atomically allocates the next family number (FAM<year>-NNNN) for an institution.
   * The sequence is first raised to the highest number already stored for that year, so
   * existing families can never be collided with, then advanced by one. A per-institution
   * advisory lock makes the read-then-advance step safe across concurrent requests.
   */
  public async allocateFamilyNumber(institutionId: string): Promise<string> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) {
      throw new Error('Family numbering requires an active PostgreSQL connection.');
    }
    const year = new Date().getFullYear().toString();
    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`family-no:${tenantId}`]);
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(((regexp_match(family_no, '^FAM' || $2 || '-(\\d+)$'))[1])::bigint), 0) AS m
           FROM families WHERE institution_id = $1`,
        [tenantId, year]
      );
      const existingMax = Number(maxRes.rows[0]?.m || 0);
      const seqRes = await client.query(
        `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
         VALUES ($1, 'FAM', $2, $3, $4)
         ON CONFLICT (institution_id, prefix, year)
         DO UPDATE SET last_value = GREATEST(system_sequences.last_value, $3 - 1) + 1, updated_at = $4
         RETURNING last_value`,
        [tenantId, year, existingMax + 1, new Date().toISOString()]
      );
      await client.query('COMMIT');
      return `FAM${year}-${String(Number(seqRes.rows[0].last_value)).padStart(4, '0')}`;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Formats an allocated block of document numbers, e.g. [FE2026-000041, FE2026-000042]
   */
  public async mintDocumentNumberBlock(
    institutionId: string,
    prefix: string,
    year: string,
    count: number = 1,
    digits: number = 6
  ): Promise<string[]> {
    if (count <= 0) return [];
    const block = await this.nextSequenceBlock(institutionId, prefix, year, count);
    const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
    const cleanYear = (year || new Date().getFullYear().toString()).trim();
    const result: string[] = new Array(block.count);
    for (let i = 0; i < block.count; i++) {
      const num = block.start + i;
      result[i] = `${cleanPrefix}${cleanYear}-${String(num).padStart(digits, '0')}`;
    }
    return result;
  }


  /**
   * Runs `mutator` with exclusive, transactional access to a set of voucher
   * rows (or the whole vouchers collection), then persists only the rows
   * `mutator` actually reports changing — via targeted row-level
   * INSERT/UPDATE statements — inside the SAME transaction. This exists to
   * fix a lost-update race present in the old approach: reading a whole
   * collection into memory, mutating a JS array, then calling
   * saveCollection() (a full DELETE + re-INSERT of the entire collection).
   * If two requests do that concurrently, whichever saveCollection() call
   * commits last silently wins and discards the other request's changes —
   * e.g. two cashiers collecting payment at the same time, or two admins
   * generating vouchers for different classes at the same time, can result
   * in one of the two operations vanishing even though the API returned
   * success for both.
   *
   * Locking scope:
   *  - `{ voucherIds: [...] }` locks (Postgres: SELECT ... FOR UPDATE) exactly those rows.
   *    Use this for payment collection and carry-forward, where the set of
   *    affected vouchers is known upfront and concurrent operations on
   *    *different* vouchers should not block each other.
   *  - `{ allVouchers: true }` locks every voucher row for the tenant. Use
   *    this for voucher generation, which must scan ALL existing vouchers
   *    to avoid generating duplicates for the same student+month.
   *
   * Safe across multiple app instances and operators via Postgres row-level locks.
   */
  private voucherRowToRecord(row: any, particulars: Array<{ kind: string; label: string; amount: number }>): VoucherRecord {
    return {
      id: row.id,
      voucherNo: row.voucher_no,
      studentId: row.student_id,
      month: row.month,
      classId: row.class_id || undefined,
      issueDate: row.issue_date || undefined,
      dueDate: row.due_date || undefined,
      particulars,
      grossTotal: Number(row.gross_total) || 0,
      discountTotal: Number(row.discount_total) || 0,
      prevBalance: Number(row.prev_balance) || 0,
      lateFeeRate: Number(row.late_fee_rate) || 0,
      roundingMultiple:
        row.rounding_multiple !== null && row.rounding_multiple !== undefined ? Number(row.rounding_multiple) : undefined,
      netDue: Number(row.net_due) || 0,
      amountPaid: Number(row.amount_paid) || 0,
      status: row.status,
      voucherType: row.voucher_type || undefined,
      carryForwardMonth: row.carry_forward_month || undefined,
      carriedLateFine:
        row.carried_late_fine !== null && row.carried_late_fine !== undefined ? Number(row.carried_late_fine) : undefined,
      notes: row.notes || undefined,
      createdDate: row.created_date || undefined,
    };
  }

  /**
   * A locked month is read-only: no voucher in it may be created, changed or
   * deleted, and no payment may be recorded against or removed from it. All
   * voucher/collection writes go through runVoucherTransaction, so this is the
   * single enforcement point. Vouchers sent back unchanged are ignored.
   */
  private async assertNoLockedMonthsTouched(
    client: any,
    tenantId: string,
    existing: Map<string, VoucherRecord>,
    writes: VoucherTxWrites
  ): Promise<void> {
    const touched = new Set<string>();

    const num = (x: any) => Number(x ?? 0);
    const changed = (a: VoucherRecord, b: any): boolean =>
      a.voucherNo !== b.voucherNo ||
      a.month !== b.month ||
      a.studentId !== b.studentId ||
      (a.dueDate || '') !== (b.dueDate || '') ||
      num(a.grossTotal) !== num(b.grossTotal) ||
      num(a.discountTotal) !== num(b.discountTotal) ||
      num(a.prevBalance) !== num(b.prevBalance) ||
      num(a.lateFeeRate) !== num(b.lateFeeRate) ||
      num(a.netDue) !== num(b.netDue) ||
      num(a.amountPaid) !== num(b.amountPaid) ||
      a.status !== b.status ||
      (a.carryForwardMonth || '') !== (b.carryForwardMonth || '') ||
      num(a.carriedLateFine) !== num(b.carriedLateFine) ||
      (a.notes || '') !== (b.notes || '') ||
      JSON.stringify((a.particulars || []).map((p: any) => [p.kind, p.label, num(p.amount)])) !==
        JSON.stringify((b.particulars || []).map((p: any) => [p.kind, p.label, num(p.amount)]));

    for (const [id, v] of Object.entries(writes.voucherUpserts || {})) {
      const prev = existing.get(id);
      if (!prev) {
        touched.add((v as any).month);
      } else if (changed(prev, v)) {
        touched.add(prev.month);
        touched.add((v as any).month);
      }
    }
    for (const id of writes.deleteVoucherIds || []) {
      const prev = existing.get(id);
      if (prev) touched.add(prev.month);
    }
    for (const t of writes.newTransactions || []) {
      if (t.month) touched.add(t.month);
      const prev = existing.get(t.voucherId);
      if (prev) touched.add(prev.month);
    }
    if ((writes.deleteTransactionIds || []).length > 0) {
      const r = await client.query(`SELECT DISTINCT month FROM transactions WHERE institution_id = $1 AND id = ANY($2)`, [
        tenantId,
        writes.deleteTransactionIds,
      ]);
      for (const row of r.rows) if (row.month) touched.add(row.month);
    }
    if ((writes.deleteCollectionIds || []).length > 0) {
      const r = await client.query(
        `SELECT DISTINCT month FROM transactions WHERE institution_id = $1 AND collection_id = ANY($2)`,
        [tenantId, writes.deleteCollectionIds]
      );
      for (const row of r.rows) if (row.month) touched.add(row.month);
    }

    touched.delete(undefined as any);
    if (touched.size === 0) return;
    const lockedRes = await client.query(
      `SELECT month FROM locked_months WHERE institution_id = $1 AND month = ANY($2) ORDER BY month FOR SHARE`,
      [tenantId, Array.from(touched)]
    );
    if (lockedRes.rows.length > 0) {
      const months = lockedRes.rows.map((r: any) => r.month).join(', ');
      const err: any = new Error(
        `This change would modify ${lockedRes.rows.length > 1 ? 'locked months' : 'a locked month'} (${months}). Vouchers and collections in a locked month cannot be changed — an Administrator must unlock ${lockedRes.rows.length > 1 ? 'them (newest first)' : 'it'} in the Month End Wizard, or the change should be reverted.`
      );
      err.httpStatus = 423;
      throw err;
    }
  }

  public async runVoucherTransaction<T>(
    institutionId: string,
    lockScope:
      | { voucherIds: string[] }
      | { allVouchers: true }
      // Generation: every voucher of the given months (duplicate check) plus any listed ids.
      | { months: string[]; voucherIds?: string[] }
      // Carry-forward: the listed vouchers plus those students' vouchers from the earliest listed voucher's month on.
      | { voucherIds: string[]; includeStudentTail: true },
    mutator: (
      lockedVouchers: Map<string, VoucherRecord>,
      helpers: {
        mintDocumentNumber: (prefix: string, year: string, digits?: number) => Promise<string>;
        mintDocumentNumberBlock: (prefix: string, year: string, count?: number, digits?: number) => Promise<string[]>;
        /** Non-reversed vouchers of a student other than `excludeId` (serialised per student). */
        countOtherActiveVouchers: (studentId: string, excludeId: string) => Promise<number>;
        /** True when the student has a later non-reversed voucher than this one (so it is no longer the payable voucher). */
        hasLaterActiveVoucher: (voucherId: string) => Promise<boolean>;
      }
    ) => Promise<{ writes: VoucherTxWrites; result: T }>
  ): Promise<T> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');

        let voucherRows: any[];
        if ('allVouchers' in lockScope) {
          const res = await client.query(`SELECT * FROM vouchers WHERE institution_id = $1 FOR UPDATE`, [tenantId]);
          voucherRows = res.rows;
        } else if ('months' in lockScope) {
          // Serialize concurrent generations of the same month, then lock only
          // that month's rows (plus any explicitly listed vouchers). Locked
          // months can never change, so they never need to be read or locked.
          const months = Array.from(new Set(lockScope.months)).sort();
          for (const m of months) {
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tenantId}:voucher-month:${m}`]);
          }
          const res = await client.query(
            `SELECT * FROM vouchers WHERE institution_id = $1 AND (month = ANY($2) OR id = ANY($3)) ORDER BY id FOR UPDATE`,
            [tenantId, months, lockScope.voucherIds || []]
          );
          voucherRows = res.rows;
        } else if ('includeStudentTail' in lockScope) {
          const src = await client.query(
            `SELECT id, student_id, month FROM vouchers WHERE institution_id = $1 AND id = ANY($2) ORDER BY id FOR UPDATE`,
            [tenantId, lockScope.voucherIds]
          );
          const studentIds = Array.from(new Set(src.rows.map((r: any) => r.student_id)));
          const minMonth = src.rows.reduce((m: string, r: any) => (m && m < r.month ? m : r.month), '');
          if (src.rows.length === 0) {
            voucherRows = [];
          } else {
            const res = await client.query(
              `SELECT * FROM vouchers WHERE institution_id = $1 AND student_id = ANY($2) AND month >= $3 ORDER BY id FOR UPDATE`,
              [tenantId, studentIds, minMonth]
            );
            voucherRows = res.rows;
          }
        } else if (lockScope.voucherIds.length > 0) {
          const res = await client.query(`SELECT * FROM vouchers WHERE institution_id = $1 AND id = ANY($2) FOR UPDATE`, [
            tenantId,
            lockScope.voucherIds,
          ]);
          voucherRows = res.rows;
        } else {
          voucherRows = [];
        }

        const voucherIds = voucherRows.map((r) => r.id);
        const particularsByVoucher = new Map<string, Array<{ kind: string; label: string; amount: number }>>();
        if (voucherIds.length > 0) {
          // Plain SELECT (no aggregation), so FOR UPDATE is valid here too —
          // locks the child rows for the same duration as their parents.
          const pRes = await client.query(
            `SELECT * FROM voucher_particulars WHERE voucher_id = ANY($1) ORDER BY voucher_id, sort_order FOR UPDATE`,
            [voucherIds]
          );
          for (const p of pRes.rows) {
            if (!particularsByVoucher.has(p.voucher_id)) particularsByVoucher.set(p.voucher_id, []);
            particularsByVoucher.get(p.voucher_id)!.push({ kind: p.kind, label: p.label, amount: Number(p.amount) });
          }
        }

        const locked = new Map<string, VoucherRecord>();
        for (const row of voucherRows) {
          locked.set(row.id, this.voucherRowToRecord(row, particularsByVoucher.get(row.id) || []));
        }

        const helpers = {
          mintDocumentNumberBlock: async (prefix: string, year: string, count: number = 1, digits: number = 6): Promise<string[]> => {
            if (count <= 0) return [];
            const cleanPrefix = (prefix || 'FE').trim().toUpperCase();
            const cleanYear = (year || new Date().getFullYear().toString()).trim();
            const seqRes = await client.query(
              `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (institution_id, prefix, year)
               DO UPDATE SET last_value = system_sequences.last_value + $4, updated_at = $5
               RETURNING last_value`,
              [tenantId, cleanPrefix, cleanYear, count, now]
            );
            const end = Number(seqRes.rows[0].last_value);
            const start = end - count + 1;
            const resList: string[] = new Array(count);
            for (let i = 0; i < count; i++) {
              resList[i] = `${cleanPrefix}${cleanYear}-${String(start + i).padStart(digits, '0')}`;
            }
            return resList;
          },
          mintDocumentNumber: async (prefix: string, year: string, digits: number = 6): Promise<string> => {
            const list = await helpers.mintDocumentNumberBlock(prefix, year, 1, digits);
            return list[0];
          },
          hasLaterActiveVoucher: async (voucherId: string): Promise<boolean> => {
            const r = await client.query(
              `SELECT 1 FROM vouchers v JOIN vouchers t
                 ON t.institution_id = v.institution_id AND t.student_id = v.student_id AND t.month > v.month AND t.status <> 'Reversed'
               WHERE v.institution_id = $1 AND v.id = $2 LIMIT 1`,
              [tenantId, voucherId]
            );
            return r.rows.length > 0;
          },
          countOtherActiveVouchers: async (studentId: string, excludeId: string): Promise<number> => {
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tenantId}:student-vouchers:${studentId}`]);
            const r = await client.query(
              `SELECT COUNT(*)::int AS n FROM vouchers WHERE institution_id = $1 AND student_id = $2 AND status <> 'Reversed' AND id <> $3`,
              [tenantId, studentId, excludeId]
            );
            return Number(r.rows[0].n);
          },
        };

        const { writes, result } = await mutator(locked, helpers);

        await this.assertNoLockedMonthsTouched(client, tenantId, locked, writes);

        for (const [id, v] of Object.entries(writes.voucherUpserts || {})) {
          await client.query(
            `INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, class_id, issue_date, due_date,
               gross_total, discount_total, prev_balance, late_fee_rate, rounding_multiple, net_due, amount_paid,
               status, voucher_type, carry_forward_month, carried_late_fine, notes, created_date, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
             ON CONFLICT (id) DO UPDATE SET
               voucher_no=$3, student_id=$4, month=$5, class_id=$6, issue_date=$7, due_date=$8,
               gross_total=$9, discount_total=$10, prev_balance=$11, late_fee_rate=$12, rounding_multiple=$13,
               net_due=$14, amount_paid=$15, status=$16, voucher_type=$17, carry_forward_month=$18,
               carried_late_fine=$19, notes=$20, created_date=$21, updated_at=$23`,
            [
              id,
              tenantId,
              v.voucherNo,
              v.studentId,
              v.month,
              v.classId || null,
              v.issueDate || null,
              v.dueDate || null,
              v.grossTotal,
              v.discountTotal,
              v.prevBalance,
              v.lateFeeRate,
              v.roundingMultiple ?? null,
              v.netDue,
              v.amountPaid,
              v.status,
              v.voucherType || null,
              v.carryForwardMonth || null,
              v.carriedLateFine ?? null,
              v.notes || null,
              v.createdDate || null,
              now,
              now,
            ]
          );
          await client.query(`DELETE FROM voucher_particulars WHERE voucher_id = $1`, [id]);
          let sortOrder = 0;
          for (const p of v.particulars || []) {
            await client.query(
              `INSERT INTO voucher_particulars (id, voucher_id, kind, label, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
              [`${id}_p${sortOrder}`, id, p.kind, p.label, p.amount, sortOrder]
            );
            sortOrder++;
          }
        }

        for (const t of writes.newTransactions || []) {
          if (!isPaymentMode(t.paymentMode)) {
            throw new Error(`Invalid payment mode "${String(t.paymentMode)}". Allowed: ${PAYMENT_MODES.join(', ')}.`);
          }
          await client.query(
            `INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, fine_added, payment_mode, reference_no, notes, date, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              t.id,
              tenantId,
              t.txnNo,
              t.collectionId,
              t.voucherId,
              t.studentId,
              t.month,
              t.amount,
              t.fineAdded ?? null,
              t.paymentMode || null,
              t.referenceNo || null,
              t.notes || null,
              t.date,
              now,
            ]
          );
        }

        for (const c of writes.newCollections || []) {
          await client.query(
            `INSERT INTO collections (id, institution_id, collection_no, date, total_amount, transaction_count, notes, is_bulk_import, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [c.id, tenantId, c.collectionNo, c.date, c.totalAmount, c.transactionCount, c.notes || null, !!c.isBulkImport, now]
          );
        }

        for (const id of writes.deleteTransactionIds || []) {
          await client.query(`DELETE FROM transactions WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        }
        for (const [id, upd] of Object.entries(writes.collectionUpdates || {})) {
          await client.query(
            `UPDATE collections SET total_amount = $1, transaction_count = $2 WHERE id = $3 AND institution_id = $4`,
            [upd.totalAmount, upd.transactionCount, id, tenantId]
          );
        }
        for (const id of writes.deleteCollectionIds || []) {
          await client.query(`DELETE FROM transactions WHERE collection_id = $1 AND institution_id = $2`, [id, tenantId]);
          await client.query(`DELETE FROM collections WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        }
        for (const id of writes.deleteVoucherIds || []) {
          await client.query(`DELETE FROM voucher_particulars WHERE voucher_id = $1`, [id]);
          await client.query(`DELETE FROM vouchers WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        }

        // Keep the derived fine_since_payment of every touched student correct,
        // whatever caused the change (payment, reversal, generation, carry
        // forward, deletion, reissue, restore).
        const touchedStudents = new Set<string>();
        for (const v of Object.values(writes.voucherUpserts || {})) touchedStudents.add((v as any).studentId);
        for (const t of writes.newTransactions || []) touchedStudents.add(t.studentId);
        for (const id of writes.deleteVoucherIds || []) {
          const l = locked.get(id);
          if (l) touchedStudents.add(l.studentId);
        }
        if (touchedStudents.size > 0) {
          await client.query(FINE_SINCE_PAYMENT_REFRESH_SQL, [tenantId, Array.from(touchedStudents)]);
        }

        if (writes.afterWrites) await writes.afterWrites(client);

        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    throw new Error('No database engine available for voucher transaction.');
  }

  /**
   * Fine charged since each student's last payment (the stored value on their
   * latest non-reversed voucher).
   */
  public async listFineSincePayment(institutionId: string): Promise<Record<string, number>> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT DISTINCT ON (student_id) student_id, fine_since_payment
         FROM vouchers WHERE institution_id = $1 AND status <> 'Reversed'
         ORDER BY student_id, month DESC, id DESC`,
        [tenantId]
      );
      const out: Record<string, number> = {};
      for (const row of res.rows) out[row.student_id] = Number(row.fine_since_payment) || 0;
      return out;
    }
    return {};
  }

  // --- Generic simple-entity CRUD (classes, families, buses, stops, transport_assignments, fee_templates, bank_accounts) ---

  public async listSimpleEntities(cfg: SimpleEntityConfig, institutionId: string, orderByColumn?: string): Promise<any[]> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const cols = ['id', 'version', ...cfg.fields.map((f) => f.column)].join(', ');
    const orderClause = orderByColumn ? ` ORDER BY ${orderByColumn}` : '';

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT ${cols} FROM ${cfg.table} WHERE institution_id = $1${orderClause}`, [
        tenantId,
      ]);
      return res.rows.map((r) => deserializeSimpleEntityRow(cfg.fields, r));
    }
    return [];
  }

  /** Which of the given references do not exist for this institution (empty values are ignored). */
  public async missingRefs(
    institutionId: string,
    refs: { classId?: string; familyId?: string; studentId?: string }
  ): Promise<Array<'class' | 'family' | 'student'>> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const missing: Array<'class' | 'family' | 'student'> = [];
    if (!(this.engine === 'postgres' && this.pgPool)) return missing;
    const check = async (table: string, id: string | undefined, label: 'class' | 'family' | 'student') => {
      if (!id) return;
      const r = await this.pgPool!.query(`SELECT 1 FROM ${table} WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      if (r.rows.length === 0) missing.push(label);
    };
    await check('classes', refs.classId, 'class');
    await check('families', refs.familyId, 'family');
    await check('students', refs.studentId, 'student');
    return missing;
  }

  /** True when another row of the table already has this value in the column (case-insensitive). */
  public async valueTaken(
    institutionId: string,
    table: 'classes' | 'stops' | 'buses',
    column: 'name' | 'bus_number',
    value: string,
    excludeId?: string
  ): Promise<boolean> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) return false;
    const allowed = { classes: 'name', stops: 'name', buses: 'bus_number' } as const;
    if (allowed[table] !== column) throw new Error('[DB] valueTaken: column not allowed for table.');
    const r = await this.pgPool.query(
      `SELECT 1 FROM ${table} WHERE institution_id = $1 AND LOWER(TRIM(${column})) = LOWER(TRIM($2)) AND id <> $3 LIMIT 1`,
      [tenantId, value, excludeId || '']
    );
    return r.rows.length > 0;
  }

  /** True when the student, bus and stop all exist for this institution (used to reject orphan transport assignments). */
  public async transportRefsExist(
    institutionId: string,
    refs: { studentId?: string; busId?: string; stopId?: string }
  ): Promise<{ student: boolean; bus: boolean; stop: boolean }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const out = { student: true, bus: true, stop: true };
    if (!(this.engine === 'postgres' && this.pgPool)) return out;
    const exists = async (table: string, id: string) =>
      (await this.pgPool!.query(`SELECT 1 FROM ${table} WHERE id = $1 AND institution_id = $2`, [id, tenantId])).rows.length > 0;
    if (refs.studentId !== undefined) out.student = !!refs.studentId && (await exists('students', refs.studentId));
    if (refs.busId !== undefined) out.bus = !!refs.busId && (await exists('buses', refs.busId));
    if (refs.stopId !== undefined) out.stop = !!refs.stopId && (await exists('stops', refs.stopId));
    return out;
  }

  public async getSimpleEntityById(cfg: SimpleEntityConfig, institutionId: string, id: string): Promise<any | null> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const cols = ['id', 'version', ...cfg.fields.map((f) => f.column)].join(', ');

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT ${cols} FROM ${cfg.table} WHERE id = $1 AND institution_id = $2`, [
        id,
        tenantId,
      ]);
      return res.rows.length ? deserializeSimpleEntityRow(cfg.fields, res.rows[0]) : null;
    }
    return null;
  }

  /** Runs `fn` in one database transaction; commits on success, rolls back and rethrows on any error. */
  public async withTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
    if (!(this.engine === 'postgres' && this.pgPool)) throw new Error('No database engine available.');
    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private async txReadOne(client: any, cfg: SimpleEntityConfig, tenantId: string, id: string): Promise<any | null> {
    const cols = ['id', 'version', ...cfg.fields.map((f) => f.column)].join(', ');
    const res = await client.query(`SELECT ${cols} FROM ${cfg.table} WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
    return res.rows.length ? deserializeSimpleEntityRow(cfg.fields, res.rows[0]) : null;
  }

  /** Only one bank account may be the default: clears the flag on every other account of the tenant. */
  private async clearOtherDefaultBankAccounts(client: any, tenantId: string, keepId: string): Promise<void> {
    await client.query(
      `UPDATE bank_accounts SET is_default = FALSE, version = version + 1, updated_at = NOW()
       WHERE institution_id = $1 AND id <> $2 AND is_default = TRUE`,
      [tenantId, keepId]
    );
  }

  private newEntityId(table: string): string {
    return `${table}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /** Inserts one row inside a transaction. Returns the id used. */
  private async txInsert(client: any, cfg: SimpleEntityConfig, tenantId: string, id: string, obj: any): Promise<string> {
    const now = new Date().toISOString();
    const values = cfg.fields.map((f) => serializeFieldValue(f, obj[f.field]));
    const cols = ['id', 'institution_id', ...cfg.fields.map((f) => f.column), 'created_at', 'updated_at'];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`, [
      id,
      tenantId,
      ...values,
      now,
      now,
    ]);
    if (cfg.table === 'bank_accounts' && obj.isDefault) await this.clearOtherDefaultBankAccounts(client, tenantId, id);
    return id;
  }

  /** Updates one row inside a transaction. False when the row does not exist; throws on a stale version. */
  private async txUpdate(
    client: any,
    cfg: SimpleEntityConfig,
    tenantId: string,
    id: string,
    updates: any,
    expectedVersion?: number
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const fieldsToUpdate = cfg.fields.filter((f) => Object.prototype.hasOwnProperty.call(updates, f.field));
    const hasExpected = expectedVersion !== undefined && expectedVersion !== null && Number.isFinite(Number(expectedVersion));

    if (fieldsToUpdate.length === 0) {
      const cur = await this.txReadOne(client, cfg, tenantId, id);
      if (cur && hasExpected && Number(cur.version) !== Number(expectedVersion)) {
        throw new ConflictError('STALE_VERSION', STALE_MESSAGE, cur);
      }
      return !!cur;
    }

    const values = fieldsToUpdate.map((f) => serializeFieldValue(f, updates[f.field]));
    const setClauses = fieldsToUpdate.map((f, i) => `${f.column} = $${i + 1}`);
    setClauses.push(`updated_at = $${fieldsToUpdate.length + 1}`, 'version = version + 1');
    const params: any[] = [...values, now, id, tenantId];
    let where = `id = $${fieldsToUpdate.length + 2} AND institution_id = $${fieldsToUpdate.length + 3}`;
    if (hasExpected) {
      params.push(Number(expectedVersion));
      where += ` AND version = $${fieldsToUpdate.length + 4}`;
    }
    const res = await client.query(`UPDATE ${cfg.table} SET ${setClauses.join(', ')} WHERE ${where}`, params);
    if ((res.rowCount || 0) === 0) {
      if (hasExpected) {
        const cur = await this.txReadOne(client, cfg, tenantId, id);
        if (cur) throw new ConflictError('STALE_VERSION', STALE_MESSAGE, cur);
      }
      return false;
    }
    if (cfg.table === 'bank_accounts' && updates.isDefault) await this.clearOtherDefaultBankAccounts(client, tenantId, id);
    return true;
  }

  /**
   * Deletes one row inside a transaction, with the version check and the referential
   * rules: a bus or stop still used by an active student's assignment, or a class that
   * still has students, cannot be deleted (ConflictError IN_USE); assignments of
   * inactive students are removed together with the bus or stop.
   */
  private async txDelete(
    client: any,
    cfg: SimpleEntityConfig,
    tenantId: string,
    id: string,
    expectedVersion?: number
  ): Promise<boolean> {
    const hasExpected = expectedVersion !== undefined && expectedVersion !== null && Number.isFinite(Number(expectedVersion));
    const row = await client.query(
      `SELECT version FROM ${cfg.table} WHERE id = $1 AND institution_id = $2 FOR UPDATE`,
      [id, tenantId]
    );
    if (row.rows.length === 0) return false;
    if (hasExpected && Number(row.rows[0].version) !== Number(expectedVersion)) {
      throw new ConflictError('STALE_VERSION', STALE_MESSAGE, await this.txReadOne(client, cfg, tenantId, id));
    }

    if (cfg.table === 'stops' || cfg.table === 'buses') {
      const col = cfg.table === 'stops' ? 'stop_id' : 'bus_id';
      const noun = cfg.table === 'stops' ? 'bus stop' : 'bus';
      const active = await client.query(
        `SELECT COUNT(*) AS n FROM transport_assignments a
         JOIN students s ON s.id = a.student_id
         WHERE a.${col} = $1 AND a.institution_id = $2 AND s.status = 'Active'`,
        [id, tenantId]
      );
      const n = Number(active.rows[0]?.n) || 0;
      if (n > 0) {
        throw new ConflictError('IN_USE', `Cannot delete ${noun}. ${n} active student transport assignments refer to this ${noun}.`);
      }
      await client.query(`DELETE FROM transport_assignments WHERE ${col} = $1 AND institution_id = $2`, [id, tenantId]);
    } else if (cfg.table === 'classes') {
      const used = await client.query(`SELECT COUNT(*) AS n FROM students WHERE class_id = $1 AND institution_id = $2`, [id, tenantId]);
      const n = Number(used.rows[0]?.n) || 0;
      if (n > 0) {
        throw new ConflictError(
          'IN_USE',
          `Cannot delete class. ${n} student record(s) still reference it (including inactive ones). Reassign them first.`
        );
      }
    }

    const res = await client.query(`DELETE FROM ${cfg.table} WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
    return (res.rowCount || 0) > 0;
  }

  public async createSimpleEntity(cfg: SimpleEntityConfig, institutionId: string, obj: any): Promise<any> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    let id: string = obj.id || this.newEntityId(cfg.table);

    if (!(this.engine === 'postgres' && this.pgPool)) throw new Error('No database engine available.');

    if (obj.id) {
      const existing = await this.pgPool.query(`SELECT id, institution_id FROM ${cfg.table} WHERE id = $1`, [obj.id]);
      if (existing.rows.length > 0) {
        if (existing.rows[0].institution_id === tenantId) {
          return this.updateSimpleEntity(cfg, tenantId, obj.id, obj, obj.expectedVersion);
        }
        // ID already taken by another tenant - generate unique ID for this tenant
        id = this.newEntityId(cfg.table);
      }
    }
    await this.withTx((client) => this.txInsert(client, cfg, tenantId, id, obj));
    return this.getSimpleEntityById(cfg, tenantId, id);
  }

  /**
   * Updates one row. When `expectedVersion` is given the update applies only if the
   * row still has that version; otherwise a ConflictError(STALE_VERSION) carrying the
   * current row is thrown (optimistic concurrency). Every applied update bumps `version`.
   */
  public async updateSimpleEntity(
    cfg: SimpleEntityConfig,
    institutionId: string,
    id: string,
    updates: any,
    expectedVersion?: number
  ): Promise<any | null> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const applied = await this.withTx((client) => this.txUpdate(client, cfg, tenantId, id, updates, expectedVersion));
    return applied ? this.getSimpleEntityById(cfg, tenantId, id) : null;
  }

  public async deleteSimpleEntity(
    cfg: SimpleEntityConfig,
    institutionId: string,
    id: string,
    expectedVersion?: number
  ): Promise<boolean> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) return false;
    return this.withTx((client) => this.txDelete(client, cfg, tenantId, id, expectedVersion));
  }

  /**
   * All-or-nothing batch: removes `deleteIds`, then inserts or updates `upserts`
   * (a row with an `id` that already exists for this tenant is updated, honouring its
   * `expectedVersion`; anything else is inserted), and appends optional account-history
   * entries, all in one transaction. Any failure rolls the whole batch back.
   * Returns the saved rows so the caller can adopt the server's values.
   */
  public async batchSimpleEntities(
    cfg: SimpleEntityConfig,
    institutionId: string,
    ops: {
      upserts?: any[];
      deleteIds?: string[];
      history?: Array<Record<string, any>>;
      /** Called inside the transaction after the writes, to enforce rules that span the whole batch. */
      afterWrites?: (client: any, tenantId: string) => Promise<void>;
    }
  ): Promise<{ items: any[]; deletedIds: string[] }> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) throw new Error('No database engine available.');

    return this.withTx(async (client) => {
      const deletedIds: string[] = [];
      for (const id of ops.deleteIds || []) {
        if (await this.txDelete(client, cfg, tenantId, id)) deletedIds.push(id);
      }
      const savedIds: string[] = [];
      for (const obj of ops.upserts || []) {
        let id: string = obj.id || this.newEntityId(cfg.table);
        if (obj.id) {
          const existing = await client.query(`SELECT institution_id FROM ${cfg.table} WHERE id = $1`, [obj.id]);
          if (existing.rows.length > 0) {
            if (existing.rows[0].institution_id !== tenantId) {
              id = this.newEntityId(cfg.table);
              await this.txInsert(client, cfg, tenantId, id, obj);
            } else {
              await this.txUpdate(client, cfg, tenantId, obj.id, obj, obj.expectedVersion);
            }
          } else {
            await this.txInsert(client, cfg, tenantId, id, obj);
          }
        } else {
          await this.txInsert(client, cfg, tenantId, id, obj);
        }
        savedIds.push(id);
      }
      for (const entry of ops.history || []) {
        await this.appendStudentAccountHistory(tenantId, entry, client);
      }
      if (ops.afterWrites) await ops.afterWrites(client, tenantId);
      const items: any[] = [];
      for (const id of savedIds) {
        const row = await this.txReadOne(client, cfg, tenantId, id);
        if (row) items.push(row);
      }
      return { items, deletedIds };
    });
  }


  // --- Students (bespoke: needs search/pagination/duplicate-detection, unlike the generic simple-entity tables) ---

  private studentRowToRecord(row: any): any {
    return {
      id: row.id,
      version: Number(row.version) || 1,
      studentNo: row.student_no || '',
      regNo: row.reg_no || '',
      name: row.name,
      admissionDate: row.admission_date || undefined,
      firstBillingMonth: row.first_billing_month || undefined,
      classId: row.class_id || '',
      monthlyDiscount: Number(row.monthly_discount) || 0,
      mobileNumber: row.mobile_number || undefined,
      notes: row.notes || undefined,
      photoUrl: row.photo_url || undefined,
      dob: row.dob || '',
      gender: row.gender || 'Male',
      studentNationalId: row.student_national_id || undefined,
      familyId: row.family_id || undefined,
      address: row.address || undefined,
      fatherName: row.father_name || '',
      fatherNationalId: row.father_national_id || '',
      fatherPhone: row.father_phone || '',
      fatherOccupation: row.father_occupation || undefined,
      motherName: row.mother_name || '',
      motherNationalId: row.mother_national_id || undefined,
      motherPhone: row.mother_phone || '',
      ...(typeof row.documents === 'string' ? JSON.parse(row.documents || '{}') : row.documents || {}),
      status: row.status,
      createdDate: row.created_date || '',
    };
  }

  private static readonly STUDENT_SEARCH_COLUMNS = [
    'name',
    'reg_no',
    'student_no',
    'father_name',
    'father_phone',
    'mother_phone',
    'mobile_number',
    'student_national_id',
    'father_national_id',
  ];

  /**
   * Server-side search/list for students, replacing the old pattern of
   * shipping every student to the browser and filtering client-side.
   * `q` matches the same set of fields the old client-side search covered
   * (name, reg/student no, guardian name, phone numbers, national ID/student ID).
   */
  public async searchStudents(
    institutionId: string,
    opts: {
      q?: string;
      classId?: string;
      familyId?: string;
      status?: string;
      ids?: string[];
      page?: number;
      pageSize?: number;
    }
  ): Promise<{ students: any[]; total: number }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const isPaged = typeof opts.pageSize === 'number' && opts.pageSize > 0;
    const page = isPaged ? Math.max(1, opts.page || 1) : 1;
    const pageSize = isPaged ? Math.max(1, opts.pageSize!) : 0;
    const offset = isPaged ? (page - 1) * pageSize : 0;

    if (this.engine === 'postgres' && this.pgPool) {
      const conditions: string[] = ['institution_id = $1'];
      const params: any[] = [tenantId];
      let p = 2;

      if (opts.ids && opts.ids.length > 0) {
        conditions.push(`id = ANY($${p++})`);
        params.push(opts.ids);
      }
      if (opts.classId) {
        conditions.push(`class_id = $${p++}`);
        params.push(opts.classId);
      }
      if (opts.familyId) {
        conditions.push(`family_id = $${p++}`);
        params.push(opts.familyId);
      }
      if (opts.status) {
        conditions.push(`status = $${p++}`);
        params.push(opts.status);
      }
      if (opts.q && opts.q.trim()) {
        const searchExpr = DatabaseService.STUDENT_SEARCH_COLUMNS.map((c) => `coalesce(${c},'')`).join(" || ' ' || ");
        conditions.push(`(${searchExpr}) ILIKE $${p++}`);
        params.push(`%${opts.q.trim()}%`);
      }

      const whereClause = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM students WHERE ${whereClause}`, params);
      const total = Number(countRes.rows[0].total) || 0;

      let query = `SELECT * FROM students WHERE ${whereClause} ORDER BY name ASC`;
      const dataParams = [...params];
      if (isPaged) {
        query += ` LIMIT $${p++} OFFSET $${p++}`;
        dataParams.push(pageSize, offset);
      }
      const res = await this.pgPool.query(query, dataParams);
      return { students: res.rows.map((r) => this.studentRowToRecord(r)), total };
    }

    return { students: [], total: 0 };
  }

  /**
   * Single grouped-aggregate query for the dashboard's per-class active
   * student counts. Replaces what used to be one searchStudents() COUNT
   * query per class (N+1 — one dashboard load issuing as many concurrent
   * queries as the institution has classes).
   */
  public async getActiveStudentCountsByClass(institutionId: string): Promise<Map<string, number>> {
    await this.init();
    const tenantId = requireTenantId(institutionId);

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT class_id, COUNT(*) AS total FROM students
         WHERE institution_id = $1 AND status = 'Active' AND class_id IS NOT NULL
         GROUP BY class_id`,
        [tenantId]
      );
      return new Map(res.rows.map((r: any) => [r.class_id as string, Number(r.total) || 0]));
    }

    return new Map();
  }

  public async getStudentById(institutionId: string, id: string): Promise<any | null> {
    const { students } = await this.searchStudents(institutionId, { ids: [id], pageSize: 1 });
    return students[0] || null;
  }

  /**
   * Checks whether an individual student's national ID number is already used by
   * another student in this institution. Father National ID is shared across siblings
   * and is not unique per student.
   */
  public async findDuplicateStudent(
    institutionId: string,
    fields: { studentNationalId?: string; fatherNationalId?: string },
    excludeId?: string
  ): Promise<{ field: 'studentNationalId'; existingStudentName: string } | null> {
    await this.init();
    const tenantId = requireTenantId(institutionId);

    const studentIdValue = fields.studentNationalId?.trim();
    if (!studentIdValue) return null;

    if (this.engine === 'postgres' && this.pgPool) {
      const params: any[] = [tenantId, studentIdValue];
      let clause = `institution_id = $1 AND student_national_id = $2`;
      if (excludeId) {
        params.push(excludeId);
        clause += ` AND id != $3`;
      }
      const res = await this.pgPool.query(`SELECT reg_no, name FROM students WHERE ${clause} LIMIT 1`, params);
      if (res.rows.length > 0) {
        const studentLabel = [res.rows[0].reg_no, res.rows[0].name].filter(Boolean).join(' ');
        return { field: 'studentNationalId', existingStudentName: studentLabel };
      }
    }
    return null;
  }

  public async createStudent(institutionId: string, obj: any, client?: any): Promise<any> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const id: string = obj.id || `student_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const documents = JSON.stringify({
      document1: obj.document1 || null,
      document2: obj.document2 || null,
      document3: obj.document3 || null,
    });

    const cols = [
      'id',
      'institution_id',
      'student_no',
      'reg_no',
      'name',
      'admission_date',
      'first_billing_month',
      'class_id',
      'monthly_discount',
      'mobile_number',
      'notes',
      'photo_url',
      'dob',
      'gender',
      'student_national_id',
      'family_id',
      'address',
      'father_name',
      'father_national_id',
      'father_phone',
      'father_occupation',
      'mother_name',
      'mother_national_id',
      'mother_phone',
      'documents',
      'status',
      'created_date',
      'created_at',
      'updated_at',
    ];
    const values = [
      id,
      tenantId,
      obj.studentNo || '',
      obj.regNo || '',
      obj.name,
      obj.admissionDate || null,
      obj.firstBillingMonth || null,
      obj.classId || null,
      Number(obj.monthlyDiscount) || 0,
      obj.mobileNumber || null,
      obj.notes || null,
      obj.photoUrl || null,
      obj.dob || null,
      obj.gender || 'Male',
      obj.studentNationalId || null,
      obj.familyId || null,
      obj.address || null,
      obj.fatherName || '',
      obj.fatherNationalId || '',
      obj.fatherPhone || '',
      obj.fatherOccupation || null,
      obj.motherName || '',
      obj.motherNationalId || null,
      obj.motherPhone || '',
      documents,
      obj.status || 'Active',
      obj.createdDate || now.split('T')[0],
      now,
      now,
    ];

    const runner = client || (this.engine === 'postgres' ? this.pgPool : null);
    if (runner) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await runner.query(`INSERT INTO students (${cols.join(', ')}) VALUES (${placeholders})`, values);
    } else {
      throw new Error('No database engine available.');
    }

    return client ? { id } : this.getStudentById(tenantId, id);
  }

  public async updateStudent(
    institutionId: string,
    id: string,
    updates: any,
    expectedVersion?: number,
    client?: any,
    onChange?: (changedFields: string[], before: any) => void
  ): Promise<any | null> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const now = new Date().toISOString();

    const fieldMap: Record<string, { column: string; type: 'string' | 'number'; nullIfEmpty?: boolean }> = {
      studentNo: { column: 'student_no', type: 'string' },
      regNo: { column: 'reg_no', type: 'string' },
      name: { column: 'name', type: 'string' },
      admissionDate: { column: 'admission_date', type: 'string' },
      firstBillingMonth: { column: 'first_billing_month', type: 'string' },
      classId: { column: 'class_id', type: 'string', nullIfEmpty: true },
      monthlyDiscount: { column: 'monthly_discount', type: 'number' },
      mobileNumber: { column: 'mobile_number', type: 'string' },
      notes: { column: 'notes', type: 'string' },
      photoUrl: { column: 'photo_url', type: 'string' },
      dob: { column: 'dob', type: 'string' },
      gender: { column: 'gender', type: 'string' },
      studentNationalId: { column: 'student_national_id', type: 'string' },
      familyId: { column: 'family_id', type: 'string', nullIfEmpty: true },
      address: { column: 'address', type: 'string' },
      fatherName: { column: 'father_name', type: 'string' },
      fatherNationalId: { column: 'father_national_id', type: 'string' },
      fatherPhone: { column: 'father_phone', type: 'string' },
      fatherOccupation: { column: 'father_occupation', type: 'string' },
      motherName: { column: 'mother_name', type: 'string' },
      motherNationalId: { column: 'mother_national_id', type: 'string' },
      motherPhone: { column: 'mother_phone', type: 'string' },
      status: { column: 'status', type: 'string' },
      createdDate: { column: 'created_date', type: 'string' },
    };

    const setCols: string[] = [];
    const values: any[] = [];
    for (const [field, spec] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        setCols.push(spec.column);
        values.push(
          spec.type === 'number' ? Number(updates[field]) || 0 : spec.nullIfEmpty ? updates[field] || null : updates[field] ?? null
        );
      }
    }
    if (updates.document1 !== undefined || updates.document2 !== undefined || updates.document3 !== undefined) {
      const existing = await this.getStudentById(tenantId, id);
      setCols.push('documents');
      values.push(
        JSON.stringify({
          document1: updates.document1 !== undefined ? updates.document1 : existing?.document1 || null,
          document2: updates.document2 !== undefined ? updates.document2 : existing?.document2 || null,
          document3: updates.document3 !== undefined ? updates.document3 : existing?.document3 || null,
        })
      );
    }

    if (onChange) {
      // Reported before the write so the caller can describe what really changed
      // (field names only, never values).
      const before = await this.getStudentById(tenantId, id);
      if (before) {
        const numeric = new Set(['monthlyDiscount']);
        const norm = (f: string, v: any) => (numeric.has(f) ? String(Number(v) || 0) : v == null ? '' : String(v));
        const names = [...Object.keys(fieldMap), 'document1', 'document2', 'document3'];
        onChange(
          names.filter((f) => Object.prototype.hasOwnProperty.call(updates, f) && norm(f, updates[f]) !== norm(f, before[f])),
          before
        );
      }
    }

    if (setCols.length === 0) {
      return this.getStudentById(tenantId, id);
    }

    const runner = client || (this.engine === 'postgres' ? this.pgPool : null);
    if (runner) {
      const setClauses = setCols.map((c, i) => `${c} = $${i + 1}`);
      setClauses.push(`updated_at = $${setCols.length + 1}`, 'version = version + 1');
      const params: any[] = [...values, now, id, tenantId];
      let where = `id = $${setCols.length + 2} AND institution_id = $${setCols.length + 3}`;
      const hasExpected = expectedVersion !== undefined && expectedVersion !== null && Number.isFinite(Number(expectedVersion));
      if (hasExpected) {
        params.push(Number(expectedVersion));
        where += ` AND version = $${setCols.length + 4}`;
      }
      const res = await runner.query(`UPDATE students SET ${setClauses.join(', ')} WHERE ${where}`, params);
      if ((res.rowCount || 0) === 0) {
        if (hasExpected) {
          const current = await this.getStudentById(tenantId, id);
          if (current) throw new ConflictError('STALE_VERSION', STALE_MESSAGE, current);
        }
        return null;
      }
    } else {
      return null;
    }

    return client ? { id } : this.getStudentById(tenantId, id);
  }

  /**
   * All-or-nothing student batch: deletes (each refused if the student has vouchers)
   * and creates/updates in one transaction. Assignments and fee templates of deleted
   * students go with them through the foreign keys.
   */
  public async batchStudents(
    institutionId: string,
    ops: {
      upserts?: any[];
      deleteIds?: string[];
      familyUpserts?: any[];
      history?: Array<Record<string, any>>;
      /** Called inside the transaction with what actually changed; may write the audit entry. */
      audit?: (summary: StudentBatchSummary, client: any) => Promise<void>;
    }
  ): Promise<{ students: any[]; deletedIds: string[]; families: any[] }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) throw new Error('No database engine available.');

    const { deletedIds, savedIds, familyIds } = await this.withTx(async (client) => {
      // Families first (a new student may point at a family created in the same batch).
      const famIds: string[] = [];
      for (const fam of ops.familyUpserts || []) {
        const id: string = fam.id || this.newEntityId('families');
        const existing = fam.id ? await client.query(`SELECT institution_id FROM families WHERE id = $1`, [fam.id]) : { rows: [] as any[] };
        if (existing.rows.length > 0 && existing.rows[0].institution_id === tenantId) {
          await this.txUpdate(client, FAMILY_ENTITY_CONFIG, tenantId, fam.id, fam, fam.expectedVersion);
          famIds.push(fam.id);
        } else {
          await this.txInsert(client, FAMILY_ENTITY_CONFIG, tenantId, existing.rows.length > 0 ? this.newEntityId('families') : id, fam);
          famIds.push(existing.rows.length > 0 ? '' : id);
        }
      }
      const summary: StudentBatchSummary = { created: [], updated: [], deleted: [] };
      const deleted: string[] = [];
      for (const id of ops.deleteIds || []) {
        const before = await client.query(`SELECT name, reg_no FROM students WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        const res = await client.query(
          `DELETE FROM students
           WHERE id = $1 AND institution_id = $2
             AND NOT EXISTS (SELECT 1 FROM vouchers WHERE student_id = $1 AND institution_id = $2)`,
          [id, tenantId]
        );
        if ((res.rowCount || 0) > 0) {
          deleted.push(id);
          summary.deleted.push({ name: before.rows[0]?.name || '', regNo: before.rows[0]?.reg_no || '' });
        } else {
          const still = await client.query(`SELECT name, reg_no FROM students WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
          if (still.rows.length > 0) {
            const label = [still.rows[0].reg_no, still.rows[0].name].filter(Boolean).join(' ');
            throw new ConflictError('IN_USE', `Cannot delete ${label || 'student'}: fee voucher record(s) exist. Delete the vouchers first.`);
          }
        }
      }
      const saved: string[] = [];
      for (const obj of ops.upserts || []) {
        const existing = obj.id
          ? await client.query(`SELECT institution_id FROM students WHERE id = $1`, [obj.id])
          : { rows: [] as any[] };
        if (existing.rows.length > 0 && existing.rows[0].institution_id === tenantId) {
          await this.updateStudent(tenantId, obj.id, obj, obj.expectedVersion, client, (fields, before) => {
            if (fields.length === 0) return; // a save that changes nothing is not an event
            summary.updated.push({
              name: obj.name ?? before.name,
              regNo: obj.regNo ?? before.regNo,
              fields,
              statusFrom: fields.includes('status') ? before.status : undefined,
              statusTo: fields.includes('status') ? obj.status : undefined,
            });
          });
          saved.push(obj.id);
        } else {
          const { id: _ignored, ...rest } = obj;
          const created = await this.createStudent(tenantId, existing.rows.length > 0 ? rest : obj, client);
          saved.push(created.id);
          summary.created.push({ name: obj.name, regNo: obj.regNo });
        }
      }
      if (ops.audit) await ops.audit(summary, client);
      for (const entry of ops.history || []) {
        await this.appendStudentAccountHistory(tenantId, entry, client);
      }
      return { deletedIds: deleted, savedIds: saved, familyIds: famIds.filter(Boolean) };
    });
    const { students } = savedIds.length > 0 ? await this.searchStudents(tenantId, { ids: savedIds }) : { students: [] as any[] };
    const families: any[] = [];
    for (const id of familyIds) {
      const f = await this.getSimpleEntityById(FAMILY_ENTITY_CONFIG, tenantId, id);
      if (f) families.push(f);
    }
    return { students, deletedIds, families };
  }

  public async deleteStudent(institutionId: string, id: string): Promise<boolean> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`DELETE FROM students WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      return (res.rowCount || 0) > 0;
    }
    return false;
  }

  /**
   * Deletes a student, but only if no voucher currently exists for them —
   * evaluated and enforced as a single atomic statement (DELETE ... WHERE
   * NOT EXISTS (...)) rather than a separate SELECT COUNT followed by a
   * separate DELETE. There is still no FK constraint from vouchers to
   * students (see class-level comment history), so a naive two-step
   * check-then-delete has a window in which a voucher can be created for
   * the student between the check and the delete, leaving an orphaned
   * voucher behind. Folding both into one statement removes that window:
   * the "no vouchers exist" condition and the deletion are evaluated
   * against the same database snapshot with no application-code gap in
   * between.
   */
  public async deleteStudentIfNoVouchers(
    institutionId: string,
    id: string,
    expectedVersion?: number
  ): Promise<{ deleted: boolean; blockedByVouchers: boolean }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `DELETE FROM students
         WHERE id = $1 AND institution_id = $2
           AND ($3::int IS NULL OR version = $3::int)
           AND NOT EXISTS (SELECT 1 FROM vouchers WHERE student_id = $1 AND institution_id = $2)`,
        [id, tenantId, expectedVersion !== undefined && Number.isFinite(Number(expectedVersion)) ? Number(expectedVersion) : null]
      );
      if ((res.rowCount || 0) > 0) {
        return { deleted: true, blockedByVouchers: false };
      }
      // Deleted nothing — find out whether that's because the student
      // doesn't exist, or because they have vouchers. This read happens
      // after the atomic delete attempt, so it only affects which error
      // message we return, not whether the deletion itself was safe.
      const existsRes = await this.pgPool.query(
        `SELECT version FROM students WHERE id = $1 AND institution_id = $2`,
        [id, tenantId]
      );
      if (existsRes.rows.length > 0 && expectedVersion !== undefined && Number.isFinite(Number(expectedVersion)) &&
          Number(existsRes.rows[0].version) !== Number(expectedVersion)) {
        throw new ConflictError('STALE_VERSION', STALE_MESSAGE, await this.getStudentById(tenantId, id));
      }
      return { deleted: false, blockedByVouchers: existsRes.rows.length > 0 };
    }

    return { deleted: false, blockedByVouchers: false };
  }


  // --- Vouchers (read side; writes go through runVoucherTransaction) ---

  /**
   * Start of the "working set" of billing history. Locked months can never
   * change, so everything older than the oldest unlocked month is closed history
   * that the client loads on demand. The window starts one voucher-month before
   * the oldest unlocked month (so the last closed month is available as context).
   * When nothing is unlocked the window starts past every month, leaving only the
   * always-included vouchers (see workingSetVoucherIdsSql).
   */
  public async getWorkingWindowStart(institutionId: string): Promise<string> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const [lockedRes, monthRes] = await Promise.all([
        this.pgPool.query(`SELECT month FROM locked_months WHERE institution_id = $1`, [tenantId]),
        this.pgPool.query(`SELECT DISTINCT month FROM vouchers WHERE institution_id = $1 ORDER BY month`, [tenantId]),
      ]);
      const locked = new Set<string>(lockedRes.rows.map((r: any) => r.month));
      const months: string[] = monthRes.rows.map((r: any) => r.month);
      const idx = months.findIndex((m) => !locked.has(m));
      if (idx === -1) return '9999-12';
      return idx > 0 ? months[idx - 1] : months[idx];
    }
    return '0000-01';
  }

  /**
   * SQL (usable inside `IN (...)`) selecting the vouchers the client always
   * holds: everything from the window start on, every student's latest voucher
   * (needed for Previous Balance / skipped-month checks), every voucher with an
   * open balance whatever its age, any voucher that received a payment dated
   * inside the window, and the carried-forward chain behind each open voucher
   * (so the age of a debt stays accurate).
   */
  private workingSetVoucherIdsSql(instP: string, wsP: string): string {
    return `
      WITH RECURSIVE seed_open AS (
        SELECT v.id, v.student_id, v.month FROM vouchers v
        WHERE v.institution_id = ${instP} AND v.status IN ('Issued', 'Partial') AND v.net_due - v.amount_paid > 0
      ), chain AS (
        SELECT id, student_id, month FROM seed_open
        UNION
        SELECT p.id, p.student_id, p.month FROM vouchers p
        JOIN chain c ON p.institution_id = ${instP} AND p.student_id = c.student_id
          AND p.status = 'Carried' AND p.carry_forward_month = c.month AND p.net_due - p.amount_paid > 0
      )
      SELECT id FROM chain
      UNION SELECT v.id FROM vouchers v WHERE v.institution_id = ${instP} AND v.month >= ${wsP}
      UNION SELECT t.voucher_id FROM transactions t WHERE t.institution_id = ${instP} AND t.date >= ${wsP} || '-01'
      UNION SELECT id FROM (
        SELECT DISTINCT ON (student_id) id FROM vouchers
        WHERE institution_id = ${instP} AND status <> 'Reversed'
        ORDER BY student_id, month DESC
      ) latest`;
  }

  public async listVouchers(
    institutionId: string,
    opts: {
      studentId?: string;
      classId?: string;
      month?: string;
      status?: string;
      page?: number;
      pageSize?: number;
      /** Only the working set (see getWorkingWindowStart). */
      window?: boolean;
      /** Closed-history paging by billing month: monthFrom <= month < monthBefore. */
      monthFrom?: string;
      monthBefore?: string;
    }
  ): Promise<{ vouchers: any[]; total: number; windowStart?: string }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const windowStart = opts.window ? await this.getWorkingWindowStart(institutionId) : undefined;
    const isPaged = typeof opts.pageSize === 'number' && opts.pageSize > 0;
    const page = isPaged ? Math.max(1, opts.page || 1) : 1;
    const pageSize = isPaged ? Math.max(1, opts.pageSize!) : 0;
    const offset = isPaged ? (page - 1) * pageSize : 0;

    const buildConditions = (placeholder: (i: number) => string) => {
      const conditions: string[] = [`v.institution_id = ${placeholder(1)}`];
      const params: any[] = [tenantId];
      let p = 2;
      if (opts.studentId) {
        conditions.push(`v.student_id = ${placeholder(p++)}`);
        params.push(opts.studentId);
      }
      if (opts.classId) {
        conditions.push(`v.class_id = ${placeholder(p++)}`);
        params.push(opts.classId);
      }
      if (opts.month) {
        conditions.push(`v.month = ${placeholder(p++)}`);
        params.push(opts.month);
      }
      if (opts.status) {
        conditions.push(`v.status = ${placeholder(p++)}`);
        params.push(opts.status);
      }
      if (opts.monthFrom) {
        conditions.push(`v.month >= ${placeholder(p++)}`);
        params.push(opts.monthFrom);
      }
      if (opts.monthBefore) {
        conditions.push(`v.month < ${placeholder(p++)}`);
        params.push(opts.monthBefore);
      }
      if (windowStart !== undefined) {
        const wsIdx = p++;
        conditions.push(`v.id IN (${this.workingSetVoucherIdsSql(placeholder(1), placeholder(wsIdx))})`);
        params.push(windowStart);
      }
      return { where: conditions.join(' AND '), params, nextIndex: p };
    };

    if (this.engine === 'postgres' && this.pgPool) {
      const { where, params, nextIndex } = buildConditions((i) => `$${i}`);
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM vouchers v WHERE ${where}`, params);
      const total = Number(countRes.rows[0].total) || 0;

      let query = `SELECT v.*, s.name AS student_name, s.reg_no AS student_reg_no
         FROM vouchers v
         LEFT JOIN students s ON s.id = v.student_id AND s.institution_id = v.institution_id
         WHERE ${where}
         ORDER BY v.month DESC, v.voucher_no DESC`;
      const dataParams = [...params];
      let pIdx = nextIndex;
      if (isPaged) {
        query += ` LIMIT $${pIdx++} OFFSET $${pIdx++}`;
        dataParams.push(pageSize, offset);
      }
      const res = await this.pgPool.query(query, dataParams);
      const voucherIds = res.rows.map((r) => r.id);
      let particularsByVoucher = new Map<string, any[]>();
      if (voucherIds.length > 0) {
        const pRes = await this.pgPool.query(
          `SELECT * FROM voucher_particulars WHERE voucher_id = ANY($1) ORDER BY voucher_id, sort_order`,
          [voucherIds]
        );
        for (const p of pRes.rows) {
          if (!particularsByVoucher.has(p.voucher_id)) particularsByVoucher.set(p.voucher_id, []);
          particularsByVoucher.get(p.voucher_id)!.push({ kind: p.kind, label: p.label, amount: Number(p.amount) });
        }
      }
      const vouchers = res.rows.map((r) => ({
        ...this.voucherRowToRecord(r, particularsByVoucher.get(r.id) || []),
        studentName: r.student_name || undefined,
        studentRegNo: r.student_reg_no || undefined,
      }));
      return { vouchers, total, windowStart };
    }

    return { vouchers: [], total: 0 };
  }

  // --- Collections & Transactions (read side; writes go through runVoucherTransaction) ---

  public async listCollections(
    institutionId: string,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
      studentId?: string;
      window?: boolean;
      monthFrom?: string;
      monthBefore?: string;
    }
  ): Promise<{ collections: any[]; total: number }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const windowStart = opts.window ? await this.getWorkingWindowStart(institutionId) : undefined;
    const isPaged = typeof opts.pageSize === 'number' && opts.pageSize > 0;
    const page = isPaged ? Math.max(1, opts.page || 1) : 1;
    const pageSize = isPaged ? Math.max(1, opts.pageSize!) : 0;
    const offset = isPaged ? (page - 1) * pageSize : 0;

    if (this.engine === 'postgres' && this.pgPool) {
      const conditions = ['institution_id = $1'];
      const params: any[] = [tenantId];
      let p = 2;
      if (opts.dateFrom) {
        conditions.push(`date >= $${p++}`);
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push(`date <= $${p++}`);
        params.push(opts.dateTo);
      }
      if (opts.studentId) {
        conditions.push(
          `id IN (SELECT t.collection_id FROM transactions t WHERE t.institution_id = $1 AND t.student_id = $${p++})`
        );
        params.push(opts.studentId);
      }
      if (opts.monthFrom || opts.monthBefore) {
        const parts: string[] = ['t.institution_id = $1'];
        if (opts.monthFrom) {
          parts.push(`t.month >= $${p++}`);
          params.push(opts.monthFrom);
        }
        if (opts.monthBefore) {
          parts.push(`t.month < $${p++}`);
          params.push(opts.monthBefore);
        }
        conditions.push(`id IN (SELECT t.collection_id FROM transactions t WHERE ${parts.join(' AND ')})`);
      }
      if (windowStart !== undefined) {
        const wsIdx = p++;
        conditions.push(
          `(id IN (SELECT t.collection_id FROM transactions t WHERE t.institution_id = $1 AND t.voucher_id IN (${this.workingSetVoucherIdsSql('$1', `$${wsIdx}`)}))` +
            ` OR date >= $${wsIdx} || '-01')`
        );
        params.push(windowStart);
      }
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM collections WHERE ${where}`, params);
      let query = `SELECT * FROM collections WHERE ${where} ORDER BY date DESC, collection_no DESC`;
      const dataParams = [...params];
      if (isPaged) {
        query += ` LIMIT $${p++} OFFSET $${p++}`;
        dataParams.push(pageSize, offset);
      }
      const res = await this.pgPool.query(query, dataParams);
      return { collections: res.rows.map((r) => this.collectionRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    return { collections: [], total: 0 };
  }

  private collectionRowToRecord(row: any): any {
    return {
      id: row.id,
      collectionNo: row.collection_no,
      date: row.date,
      totalAmount: Number(row.total_amount) || 0,
      transactionCount: Number(row.transaction_count) || 0,
      notes: row.notes || undefined,
      isBulkImport: !!row.is_bulk_import,
    };
  }

  private transactionRowToRecord(row: any): any {
    return {
      id: row.id,
      txnNo: row.txn_no,
      collectionId: row.collection_id,
      voucherId: row.voucher_id,
      studentId: row.student_id,
      month: row.month,
      amount: Number(row.amount) || 0,
      fineAdded: row.fine_added !== null && row.fine_added !== undefined ? Number(row.fine_added) : undefined,
      paymentMode: row.payment_mode || undefined,
      referenceNo: row.reference_no || undefined,
      notes: row.notes || undefined,
      date: row.date,
      studentName: row.student_name || undefined,
    };
  }

  public async listTransactions(
    institutionId: string,
    opts: {
      studentId?: string;
      voucherId?: string;
      collectionId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
      window?: boolean;
      monthFrom?: string;
      monthBefore?: string;
    }
  ): Promise<{ transactions: any[]; total: number }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const windowStart = opts.window ? await this.getWorkingWindowStart(institutionId) : undefined;
    const isPaged = typeof opts.pageSize === 'number' && opts.pageSize > 0;
    const page = isPaged ? Math.max(1, opts.page || 1) : 1;
    const pageSize = isPaged ? Math.max(1, opts.pageSize!) : 0;
    const offset = isPaged ? (page - 1) * pageSize : 0;

    if (this.engine === 'postgres' && this.pgPool) {
      const conditions = ['t.institution_id = $1'];
      const params: any[] = [tenantId];
      let p = 2;
      if (opts.studentId) {
        conditions.push(`t.student_id = $${p++}`);
        params.push(opts.studentId);
      }
      if (opts.voucherId) {
        conditions.push(`t.voucher_id = $${p++}`);
        params.push(opts.voucherId);
      }
      if (opts.collectionId) {
        conditions.push(`t.collection_id = $${p++}`);
        params.push(opts.collectionId);
      }
      if (opts.dateFrom) {
        conditions.push(`t.date >= $${p++}`);
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push(`t.date <= $${p++}`);
        params.push(opts.dateTo);
      }
      if (opts.monthFrom) {
        conditions.push(`t.month >= $${p++}`);
        params.push(opts.monthFrom);
      }
      if (opts.monthBefore) {
        conditions.push(`t.month < $${p++}`);
        params.push(opts.monthBefore);
      }
      if (windowStart !== undefined) {
        const wsIdx = p++;
        conditions.push(`t.voucher_id IN (${this.workingSetVoucherIdsSql('$1', `$${wsIdx}`)})`);
        params.push(windowStart);
      }
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM transactions t WHERE ${where}`, params);
      let query = `SELECT t.*, s.name AS student_name
         FROM transactions t
         LEFT JOIN students s ON s.id = t.student_id AND s.institution_id = t.institution_id
         WHERE ${where} ORDER BY t.date DESC, t.txn_no DESC`;
      const dataParams = [...params];
      if (isPaged) {
        query += ` LIMIT $${p++} OFFSET $${p++}`;
        dataParams.push(pageSize, offset);
      }
      const res = await this.pgPool.query(query, dataParams);
      return { transactions: res.rows.map((r) => this.transactionRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    return { transactions: [], total: 0 };
  }

  // --- Audit Logs (append-only; server-generated, never client-writable) ---

  private auditLogRowToRecord(row: any): any {
    return {
      id: row.id,
      timestamp: row.timestamp,
      operatorId: row.operator_id || undefined,
      operatorUsername: row.operator_username || undefined,
      operatorName: row.operator_name || undefined,
      operatorRole: row.operator_role || undefined,
      actionType: row.action_type,
      actionTitle: row.action_title || undefined,
      description: row.description || undefined,
      module: row.module || undefined,
      targetId: row.target_id || undefined,
      targetLabel: row.target_label || undefined,
      month: row.month || undefined,
      amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : undefined,
      previousValue: row.previous_value || undefined,
      newValue: row.new_value || undefined,
      metadata: typeof row.metadata === 'string' ? (row.metadata ? JSON.parse(row.metadata) : undefined) : row.metadata || undefined,
    };
  }

  /** Action types that retention purges never delete (small volume, high forensic value). */
  public static readonly AUDIT_RETENTION_EXEMPT_TYPES = ['operator_security', 'system_restore', 'system_cleanup'];

  private buildAuditWhere(
    tenantId: string,
    opts: {
      module?: string;
      actionType?: string | string[];
      operator?: string;
      month?: string;
      q?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): { where: string; params: any[]; next: number } {
    const conditions = ['institution_id = $1'];
    const params: any[] = [tenantId];
    let p = 2;
    if (opts.module) {
      conditions.push(`module = $${p++}`);
      params.push(opts.module);
    }
    const types = Array.isArray(opts.actionType) ? opts.actionType : opts.actionType ? [opts.actionType] : [];
    if (types.length === 1) {
      conditions.push(`action_type = $${p++}`);
      params.push(types[0]);
    } else if (types.length > 1) {
      conditions.push(`action_type = ANY($${p++}::text[])`);
      params.push(types);
    }
    if (opts.operator) {
      conditions.push(`(operator_username = $${p} OR operator_id = $${p})`);
      params.push(opts.operator);
      p++;
    }
    if (opts.month) {
      conditions.push(`month = $${p++}`);
      params.push(opts.month);
    }
    if (opts.dateFrom) {
      conditions.push(`timestamp >= $${p++}`);
      params.push(opts.dateFrom);
    }
    if (opts.dateTo) {
      conditions.push(`timestamp <= $${p++}`);
      params.push(opts.dateTo);
    }
    const q = (opts.q || '').trim();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      conditions.push(
        `(action_title ILIKE $${p} OR description ILIKE $${p} OR operator_name ILIKE $${p} OR operator_username ILIKE $${p} OR target_id ILIKE $${p} OR target_label ILIKE $${p} OR month ILIKE $${p})`
      );
      params.push(like);
      p++;
    }
    return { where: conditions.join(' AND '), params, next: p };
  }

  public async listAuditLogs(
    institutionId: string,
    opts: {
      module?: string;
      actionType?: string | string[];
      operator?: string;
      month?: string;
      q?: string;
      sort?: string;
      dir?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{ logs: any[]; total: number }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 50));
    const page = Math.max(1, opts.page || 1);
    const offset = (page - 1) * pageSize;

    if (this.engine === 'postgres' && this.pgPool) {
      const { where, params, next } = this.buildAuditWhere(tenantId, opts);
      const sortCols: Record<string, string> = {
        timestamp: 'timestamp',
        operator: 'operator_name',
        action: 'action_title',
        target: 'target_label',
        amount: 'amount',
      };
      const col = sortCols[opts.sort || 'timestamp'] || 'timestamp';
      const dir = opts.dir === 'asc' ? 'ASC' : 'DESC';
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM audit_logs WHERE ${where}`, params);
      const res = await this.pgPool.query(
        `SELECT * FROM audit_logs WHERE ${where} ORDER BY ${col} ${dir} NULLS LAST, id ${dir} LIMIT $${next} OFFSET $${next + 1}`,
        [...params, pageSize, offset]
      );
      return { logs: res.rows.map((r) => this.auditLogRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    return { logs: [], total: 0 };
  }

  /** Aggregates for the Audit Trail cards and filter dropdowns (one round trip, no row transfer). */
  public async getAuditLogSummary(
    institutionId: string,
    opts: { dateFrom?: string; dateTo?: string }
  ): Promise<{
    total: number;
    byType: Record<string, { count: number; amount: number }>;
    operators: { id: string; username: string; name: string }[];
    months: string[];
    modules: string[];
  }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const empty = { total: 0, byType: {}, operators: [], months: [], modules: [] };
    if (!(this.engine === 'postgres' && this.pgPool)) return empty;
    const { where, params } = this.buildAuditWhere(tenantId, { dateFrom: opts.dateFrom, dateTo: opts.dateTo });
    const [types, ops, months, modules] = await Promise.all([
      this.pgPool.query(
        `SELECT action_type, COUNT(*) AS c, COALESCE(SUM(amount),0) AS a FROM audit_logs WHERE ${where} GROUP BY action_type`,
        params
      ),
      this.pgPool.query(
        `SELECT operator_username, MIN(operator_id) AS operator_id, MIN(operator_name) AS operator_name FROM audit_logs WHERE ${where} AND operator_username IS NOT NULL GROUP BY operator_username ORDER BY operator_username`,
        params
      ),
      this.pgPool.query(
        `SELECT DISTINCT month FROM audit_logs WHERE ${where} AND month IS NOT NULL ORDER BY month DESC`,
        params
      ),
      this.pgPool.query(
        `SELECT DISTINCT module FROM audit_logs WHERE ${where} AND module IS NOT NULL ORDER BY module`,
        params
      ),
    ]);
    const byType: Record<string, { count: number; amount: number }> = {};
    let total = 0;
    for (const r of types.rows) {
      const count = Number(r.c) || 0;
      byType[r.action_type] = { count, amount: Number(r.a) || 0 };
      total += count;
    }
    return {
      total,
      byType,
      operators: ops.rows.map((r) => ({ id: r.operator_id, username: r.operator_username, name: r.operator_name })),
      months: months.rows.map((r) => r.month),
      modules: modules.rows.map((r) => r.module),
    };
  }

  /**
   * Deletes audit rows older than `before` (ISO string). Security / restore /
   * cleanup entries are exempt. With dryRun only the count is returned.
   */
  public async purgeAuditLogs(institutionId: string, before: string, dryRun = false): Promise<number> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (!(this.engine === 'postgres' && this.pgPool)) return 0;
    const exempt = DatabaseService.AUDIT_RETENTION_EXEMPT_TYPES;
    const where = `institution_id = $1 AND timestamp < $2 AND action_type <> ALL($3::text[])`;
    if (dryRun) {
      const r = await this.pgPool.query(`SELECT COUNT(*) AS c FROM audit_logs WHERE ${where}`, [tenantId, before, exempt]);
      return Number(r.rows[0].c) || 0;
    }
    const r = await this.pgPool.query(`DELETE FROM audit_logs WHERE ${where}`, [tenantId, before, exempt]);
    return r.rowCount || 0;
  }

  /** Applies each institution's retention setting (months; 0 = keep forever, default 6). */
  public async runAuditRetention(): Promise<{ institutionId: string; deleted: number; cutoff: string; months: number }[]> {
    try {
      await this.init();
    } catch {
      return [];
    }
    if (!(this.engine === 'postgres' && this.pgPool && this.isInitialized)) return [];
    const res = await this.pgPool.query('SELECT id, settings FROM institutions');
    const out: { institutionId: string; deleted: number; cutoff: string; months: number }[] = [];
    for (const row of res.rows) {
      const settings = typeof row.settings === 'string' ? JSON.parse(row.settings || '{}') : row.settings || {};
      const raw = Number(settings.auditRetentionMonths);
      const months = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 6;
      if (months === 0) continue;
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);
      const cutoff = cutoffDate.toISOString();
      const deleted = await this.purgeAuditLogs(row.id, cutoff);
      if (deleted > 0) out.push({ institutionId: row.id, deleted, cutoff, months });
    }
    return out;
  }

  /**
   * The ONLY way to write an audit log entry — always server-generated from
   * the action being audited, never accepted verbatim from a client
   * payload. See the security note on the old syncState() for why.
   */
  public async appendAuditLog(institutionId: string, entry: Record<string, any>, client?: any): Promise<any> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const id = entry.id || `audit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = entry.timestamp || new Date().toISOString();

    const cols = [
      'id',
      'institution_id',
      'timestamp',
      'operator_id',
      'operator_username',
      'operator_name',
      'operator_role',
      'action_type',
      'action_title',
      'description',
      'module',
      'target_id',
      'target_label',
      'month',
      'amount',
      'previous_value',
      'new_value',
      'metadata',
    ];
    const values = [
      id,
      tenantId,
      timestamp,
      entry.operatorId || null,
      entry.operatorUsername || null,
      entry.operatorName || null,
      entry.operatorRole || null,
      entry.actionType || 'unknown',
      entry.actionTitle || null,
      entry.description || null,
      entry.module || null,
      entry.targetId || null,
      entry.targetLabel || null,
      entry.month || null,
      entry.amount ?? null,
      entry.previousValue || null,
      entry.newValue || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ];

    // With a client the entry joins the caller's transaction, so it commits or
    // rolls back together with the change it describes.
    const runner = client || (this.engine === 'postgres' ? this.pgPool : null);
    if (runner) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await runner.query(`INSERT INTO audit_logs (${cols.join(', ')}) VALUES (${placeholders})`, values);
    }
    return { id, timestamp, ...entry };
  }

  // --- Student Account History (ledger adjustment notes) ---

  private studentHistoryRowToRecord(row: any): any {
    return {
      id: row.id,
      studentId: row.student_id,
      timestamp: row.timestamp,
      date: row.date,
      category: row.category || undefined,
      actionTitle: row.action_title || undefined,
      description: row.description || undefined,
      previousValue: row.previous_value || undefined,
      newValue: row.new_value || undefined,
      operatorName: row.operator_name || undefined,
      operatorRole: row.operator_role || undefined,
      month: row.month || undefined,
      metadata: typeof row.metadata === 'string' ? (row.metadata ? JSON.parse(row.metadata) : undefined) : row.metadata || undefined,
    };
  }

  public async listStudentAccountHistory(
    institutionId: string,
    opts: { studentId?: string; page?: number; pageSize?: number }
  ): Promise<{ entries: any[]; total: number }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const isPaged = typeof opts.pageSize === 'number' && opts.pageSize > 0;
    const page = isPaged ? Math.max(1, opts.page || 1) : 1;
    const pageSize = isPaged ? Math.max(1, opts.pageSize!) : 0;
    const offset = isPaged ? (page - 1) * pageSize : 0;

    if (this.engine === 'postgres' && this.pgPool) {
      const conditions = ['institution_id = $1'];
      const params: any[] = [tenantId];
      let p = 2;
      if (opts.studentId) {
        conditions.push(`student_id = $${p++}`);
        params.push(opts.studentId);
      }
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM student_account_history WHERE ${where}`, params);
      let query = `SELECT * FROM student_account_history WHERE ${where} ORDER BY timestamp DESC`;
      const dataParams = [...params];
      if (isPaged) {
        query += ` LIMIT $${p++} OFFSET $${p++}`;
        dataParams.push(pageSize, offset);
      }
      const res = await this.pgPool.query(query, dataParams);
      return { entries: res.rows.map((r) => this.studentHistoryRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    return { entries: [], total: 0 };
  }

  public async appendStudentAccountHistory(institutionId: string, entry: Record<string, any>, client?: any): Promise<any> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const id = entry.id || `hist_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = entry.timestamp || new Date().toISOString();

    const cols = [
      'id',
      'institution_id',
      'student_id',
      'timestamp',
      'date',
      'category',
      'action_title',
      'description',
      'previous_value',
      'new_value',
      'operator_name',
      'operator_role',
      'month',
      'metadata',
    ];
    const values = [
      id,
      tenantId,
      entry.studentId,
      timestamp,
      entry.date || timestamp.split('T')[0],
      entry.category || null,
      entry.actionTitle || null,
      entry.description || null,
      entry.previousValue || null,
      entry.newValue || null,
      entry.operatorName || null,
      entry.operatorRole || null,
      entry.month || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ];

    const runner = client || (this.engine === 'postgres' ? this.pgPool : null);
    if (runner) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await runner.query(`INSERT INTO student_account_history (${cols.join(', ')}) VALUES (${placeholders})`, values);
    }
    return { id, timestamp, ...entry };
  }

  // --- Locked Months ---

  public async listLockedMonths(institutionId: string): Promise<string[]> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT month FROM locked_months WHERE institution_id = $1 ORDER BY month`, [tenantId]);
      return res.rows.map((r) => r.month);
    }
    return [];
  }

  public async listLockedMonthDetails(
    institutionId: string
  ): Promise<{ month: string; notes: string; lockedBy: string; lockedByName: string; lockedAt: string }[]> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT month, notes, locked_by, locked_by_name, locked_at FROM locked_months WHERE institution_id = $1 ORDER BY month`,
        [tenantId]
      );
      return res.rows.map((r) => ({
        month: r.month,
        notes: r.notes || '',
        lockedBy: r.locked_by || '',
        lockedByName: r.locked_by_name || '',
        lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : '',
      }));
    }
    return [];
  }

  /** Returns false if the month was already locked. */
  public async lockMonth(
    institutionId: string,
    month: string,
    info: {
      notes?: string;
      lockedBy?: string;
      lockedByName?: string;
      lockedAt?: string;
      /** Backup restore re-applies locks as they were; skip the settlement check. */
      skipSettlementCheck?: boolean;
    } = {}
  ): Promise<{ created: boolean; openCount?: number; openSample?: string[] }> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const lockedAt = info.lockedAt || new Date().toISOString();
    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        if (!info.skipSettlementCheck) {
          // A month can only be sealed once nothing in it is still owed: every
          // voucher must be Paid, zero-due or Carried (its balance already moved
          // to a later voucher). Row-locking the month's vouchers first means a
          // payment recorded at this very moment either lands before the check
          // or waits and then meets the lock.
          const open = await client.query(
            `SELECT voucher_no, net_due, amount_paid FROM vouchers
             WHERE institution_id = $1 AND month = $2
               AND status IN ('Issued', 'Partial') AND net_due - amount_paid > 0
             ORDER BY voucher_no FOR UPDATE`,
            [tenantId, month]
          );
          if (open.rows.length > 0) {
            await client.query('ROLLBACK');
            return {
              created: false,
              openCount: open.rows.length,
              openSample: open.rows.slice(0, 5).map((r: any) => r.voucher_no),
            };
          }
        }
        const r = await client.query(
          `INSERT INTO locked_months (institution_id, month, locked_at, locked_by, locked_by_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (institution_id, month) DO NOTHING`,
          [tenantId, month, lockedAt, info.lockedBy || null, info.lockedByName || null, info.notes || null]
        );
        await client.query('COMMIT');
        return { created: (r.rowCount || 0) > 0 };
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
    }
    return { created: false };
  }

  /** Returns false if the month was not locked. */
  public async unlockMonth(institutionId: string, month: string): Promise<boolean> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    if (this.engine === 'postgres' && this.pgPool) {
      const r = await this.pgPool.query(`DELETE FROM locked_months WHERE institution_id = $1 AND month = $2`, [tenantId, month]);
      return (r.rowCount || 0) > 0;
    }
    return false;
  }

  // --- Institute profile & tenant-wide settings ---

  /**
   * Updates institution profile fields and/or the free-form `settings` JSON
   * blob (theme config, fee/late-fee policy defaults, etc.). A single
   * settings JSON column here is NOT the same anti-pattern as the old
   * generic `entities` table: this is one config object per tenant, read
   * and written as a whole, never searched/filtered/paginated by sub-field
   * — a real column-per-field schema wouldn't buy anything for this case
   * the way it does for students/vouchers.
   */
  public async updateInstituteProfile(
    institutionId: string,
    updates: {
      name?: string;
      registrationNo?: string;
      address?: string;
      phone?: string;
      email?: string;
      website?: string;
      currency?: string;
      logoUrl?: string;
      settings?: Record<string, any>;
    }
  ): Promise<DbInstitution | null> {
    await this.init();
    const tenantId = requireTenantId(institutionId);
    const now = new Date().toISOString();

    const fieldMap: Record<string, string> = {
      name: 'name',
      registrationNo: 'registration_no',
      address: 'address',
      phone: 'phone',
      email: 'email',
      website: 'website',
      currency: 'currency',
      logoUrl: 'logo_url',
    };

    const setCols: string[] = [];
    const values: any[] = [];
    for (const [field, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        setCols.push(column);
        values.push((updates as any)[field]);
      }
    }

    let mergedSettings: any = undefined;
    if (updates.settings) {
      const existing = await this.getInstitutionById(tenantId);
      const existingSettings =
        existing && (existing as any).settings
          ? typeof (existing as any).settings === 'string'
            ? JSON.parse((existing as any).settings)
            : (existing as any).settings
          : {};
      mergedSettings = { ...existingSettings, ...updates.settings };
      setCols.push('settings');
      values.push(this.engine === 'postgres' ? mergedSettings : JSON.stringify(mergedSettings));
    }

    if (setCols.length === 0) {
      return this.getInstitutionById(tenantId);
    }

    if (this.engine === 'postgres' && this.pgPool) {
      const setClauses = setCols.map((c, i) => `${c} = $${i + 1}`);
      setClauses.push(`updated_at = $${setCols.length + 1}`);
      await this.pgPool.query(`UPDATE institutions SET ${setClauses.join(', ')} WHERE id = $${setCols.length + 2}`, [
        ...values,
        now,
        tenantId,
      ]);
    }

    return this.getInstitutionById(tenantId);
  }

  // --- Backup export / restore ---

  public async exportInstitutionBackup(institutionId: string): Promise<Record<string, any>> {
    const tenantId = requireTenantId(institutionId);
    const institution = await this.getInstitutionById(tenantId);
    const [classes, families, buses, stops, transportAssignments, feeTemplates, bankAccounts] = await Promise.all([
      this.listSimpleEntities(CLASS_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(FAMILY_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(BUS_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(STOP_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(TRANSPORT_ASSIGNMENT_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(FEE_TEMPLATE_ENTITY_CONFIG, tenantId),
      this.listSimpleEntities(BANK_ACCOUNT_ENTITY_CONFIG, tenantId),
    ]);
    const { students } = await this.searchStudents(tenantId, {});
    const { vouchers } = await this.listVouchers(tenantId, {});
    const { collections } = await this.listCollections(tenantId, {});
    const { transactions } = await this.listTransactions(tenantId, {});
    const auditLogs: any[] = [];
    for (let pg = 1; ; pg++) {
      const { logs, total } = await this.listAuditLogs(tenantId, { page: pg, pageSize: 1000, sort: 'timestamp', dir: 'asc' });
      auditLogs.push(...logs);
      if (logs.length === 0 || auditLogs.length >= total) break;
    }
    const { entries: studentAccountHistory } = await this.listStudentAccountHistory(tenantId, {});
    const lockedMonths = await this.listLockedMonths(tenantId);
    const lockedMonthDetails = await this.listLockedMonthDetails(tenantId);

    return {
      exportedAt: new Date().toISOString(),
      institution,
      classes,
      families,
      students,
      buses,
      stops,
      transportAssignments,
      feeTemplates,
      vouchers,
      collections,
      transactions,
      bankAccounts,
      auditLogs,
      studentAccountHistory,
      lockedMonths,
      lockedMonthDetails,
    };
  }

  /**
   * Restores a tenant's data from a backup produced by exportInstitutionBackup().
   * NOTE: this is best-effort, not a single atomic transaction across every
   * table — each table is wiped and reloaded independently. That's an
   * acceptable trade-off for a rare, admin-initiated disaster-recovery
   * operation (not part of the day-to-day financial write path, which is
   * what runVoucherTransaction() exists to make properly atomic), but if a
   * later table fails partway through, earlier tables will already have
   * been replaced — the response reports exactly which step failed so nothing
   * fails silently.
   */
  public async restoreInstitutionBackup(institutionId: string, backup: any): Promise<{ success: boolean; error?: string }> {
    const tenantId = requireTenantId(institutionId);
    await this.init();

    try {
      // Wipe existing tenant rows across every entity table.
      const wipeTables = [
        'voucher_particulars', // must go before vouchers (FK)
        'vouchers',
        'transactions',
        'collections',
        'students',
        'classes',
        'families',
        'buses',
        'stops',
        'transport_assignments',
        'fee_templates',
        'bank_accounts',
        'audit_logs',
        'student_account_history',
        'locked_months',
      ];
      for (const table of wipeTables) {
        if (this.engine === 'postgres' && this.pgPool) {
          if (table === 'voucher_particulars') {
            await this.pgPool.query(
              `DELETE FROM voucher_particulars WHERE voucher_id IN (SELECT id FROM vouchers WHERE institution_id = $1)`,
              [tenantId]
            );
          } else {
            await this.pgPool.query(`DELETE FROM ${table} WHERE institution_id = $1`, [tenantId]);
          }
        }
      }

      // Reload in dependency order (foreign keys): parents first, then
      // students, then the rows that point at students.
      const reloadSimple = async (pairs: [SimpleEntityConfig, any[]][]) => {
        for (const [config, items] of pairs) {
          for (const item of items || []) {
            await this.createSimpleEntity(config, tenantId, item);
          }
        }
      };
      await reloadSimple([
        [CLASS_ENTITY_CONFIG, backup.classes],
        [FAMILY_ENTITY_CONFIG, backup.families],
        [BUS_ENTITY_CONFIG, backup.buses],
        [STOP_ENTITY_CONFIG, backup.stops],
        [BANK_ACCOUNT_ENTITY_CONFIG, backup.bankAccounts],
      ]);

      for (const student of backup.students || []) {
        await this.createStudent(tenantId, student);
      }

      await reloadSimple([
        [TRANSPORT_ASSIGNMENT_ENTITY_CONFIG, backup.transportAssignments],
        [FEE_TEMPLATE_ENTITY_CONFIG, backup.feeTemplates],
      ]);

      // Reload vouchers (with particulars) via the transactional helper so
      // nothing bypasses the normal write path.
      if (Array.isArray(backup.vouchers) && backup.vouchers.length > 0) {
        await this.runVoucherTransaction(tenantId, { allVouchers: true }, async () => {
          const voucherUpserts: Record<string, VoucherRecord> = {};
          for (const v of backup.vouchers) {
            voucherUpserts[v.id] = v;
          }
          return { writes: { voucherUpserts }, result: null };
        });
      }

      for (const c of backup.collections || []) {
        if (this.engine === 'postgres' && this.pgPool) {
          await this.pgPool.query(
            `INSERT INTO collections (id, institution_id, collection_no, date, total_amount, transaction_count, notes, is_bulk_import, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [c.id, tenantId, c.collectionNo, c.date, c.totalAmount, c.transactionCount, c.notes || null, !!c.isBulkImport, new Date().toISOString()]
          );
        }
      }

      for (const t of backup.transactions || []) {
        if (this.engine === 'postgres' && this.pgPool) {
          await this.pgPool.query(
            `INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, fine_added, payment_mode, reference_no, notes, date, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [t.id, tenantId, t.txnNo, t.collectionId, t.voucherId, t.studentId, t.month, t.amount, t.fineAdded ?? null, t.paymentMode || null, t.referenceNo || null, t.notes || null, t.date, new Date().toISOString()]
          );
        }
      }

      for (const entry of backup.auditLogs || []) {
        await this.appendAuditLog(tenantId, entry);
      }
      for (const entry of backup.studentAccountHistory || []) {
        await this.appendStudentAccountHistory(tenantId, entry);
      }
      const restoredDetails = new Map<string, any>();
      for (const d of backup.lockedMonthDetails || []) {
        if (d?.month) restoredDetails.set(d.month, d);
      }
      for (const month of backup.lockedMonths || []) {
        const d = restoredDetails.get(month);
        await this.lockMonth(
          tenantId,
          month,
          d
            ? { notes: d.notes, lockedBy: d.lockedBy, lockedByName: d.lockedByName, lockedAt: d.lockedAt || undefined, skipSettlementCheck: true }
            : { skipSettlementCheck: true }
        );
      }

      this.incrementRevision(tenantId);
      return { success: true };
    } catch (err: any) {
      console.error(`[DB] Backup restore failed for tenant ${tenantId}:`, err);
      return { success: false, error: err?.message || 'Backup restore failed' };
    }
  }

  /**
   * Permanently deletes an entire institution and every associated record
   * across all transactional, academic, security, and administrative tables.
   * This is irreversible and executed atomically.
   */
  public async deleteInstitution(institutionId: string): Promise<{ success: boolean; error?: string }> {
    const tenantId = requireTenantId(institutionId);
    await this.init();

    try {
      const wipeTables = [
        'voucher_particulars',
        'transactions',
        'collections',
        'vouchers',
        'transport_assignments',
        'stops',
        'buses',
        'student_account_history',
        'students',
        'classes',
        'families',
        'fee_templates',
        'bank_accounts',
        'locked_months',
        'audit_logs',
        'system_sequences',
        'operator_invites',
        'user_sessions',
        'users',
      ];

      if (this.engine === 'postgres' && this.pgPool) {
        const client = await this.pgPool.connect();
        try {
          await client.query('BEGIN');
          for (const table of wipeTables) {
            if (table === 'voucher_particulars') {
              await client.query(
                `DELETE FROM voucher_particulars WHERE voucher_id IN (SELECT id FROM vouchers WHERE institution_id = $1)`,
                [tenantId]
              );
            } else {
              await client.query(`DELETE FROM ${table} WHERE institution_id = $1`, [tenantId]);
            }
          }
          await client.query(`DELETE FROM institutions WHERE id = $1`, [tenantId]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      this.revisions.delete(tenantId);
      return { success: true };
    } catch (err: any) {
      console.error(`[DB] Failed to delete institution ${tenantId}:`, err);
      return { success: false, error: err?.message || 'Failed to delete institution and all data.' };
    }
  }

}

export const dbService = new DatabaseService();