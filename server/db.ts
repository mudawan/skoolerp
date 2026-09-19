import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

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
  created_by?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
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
  systemConfig?: any;
  institution?: DbInstitution;
}

export type DbEngineType = 'postgres' | 'sqlite';

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
interface EntityFieldSpec {
  /** snake_case DB column name */
  column: string;
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

function serializeFieldValue(engine: DbEngineType, spec: EntityFieldSpec, value: any): any {
  if (spec.type === 'boolean') {
    if (engine === 'sqlite') return value ? 1 : 0;
    return !!value;
  }
  if (spec.type === 'json') return JSON.stringify(value ?? null);
  if (spec.type === 'number') return value === undefined || value === null || value === '' ? 0 : Number(value);
  return value === undefined ? null : value;
}

function deserializeSimpleEntityRow(fields: EntityFieldSpec[], row: any): any {
  const out: any = { id: row.id };
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
    { column: 'bus_id', field: 'busId', type: 'string' },
    { column: 'stop_id', field: 'stopId', type: 'string' },
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
    { column: 'class_id', field: 'classId', type: 'string' },
    { column: 'student_id', field: 'studentId', type: 'string' },
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

class DatabaseService {
  private engine: DbEngineType = 'sqlite';
  private sqliteDb: DatabaseSync | null = null;
  private pgPool: pg.Pool | null = null;
  private isInitialized = false;
  private isStrictPostgres = false;
  private revisions: Map<string, { revision: number; lastModified: string }> = new Map();
  private globalRevision: number = 1;

  // node:sqlite's DatabaseSync is a single, synchronous, process-shared
  // connection. Two overlapping `BEGIN [IMMEDIATE] TRANSACTION` calls on it
  // (which can happen because our handlers are async and can interleave at
  // await boundaries even in a single Node.js process) throw a "cannot start
  // a transaction within a transaction" error rather than blocking. This
  // queue serializes every SQLite write-transaction in this process
  // (saveCollection, sequence generation, runVoucherTransaction) so they
  // always run one at a time, in submission order, instead of racing.
  // NOTE: this only serializes within a single process. It is not a
  // substitute for the real, cross-process-safe row-level locking used on
  // the Postgres path (see runVoucherTransaction) — SQLite is the
  // development-only fallback engine (production requires
  // REQUIRE_POSTGRES=true), so process-level serialization is sufficient
  // for it.
  private sqliteWriteQueue: Promise<any> = Promise.resolve();
  private withSqliteWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.sqliteWriteQueue.then(fn, fn);
    this.sqliteWriteQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    const requirePostgresEnv = process.env.REQUIRE_POSTGRES === 'true' || process.env.STRICT_POSTGRES === 'true';
    this.isStrictPostgres = requirePostgresEnv;

    if (databaseUrl && databaseUrl.trim().startsWith('postgres')) {
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

        this.engine = 'postgres';
        console.log('[DB] Configured PostgreSQL database engine from DATABASE_URL with connection pool.');
      } catch (err: any) {
        if (this.isStrictPostgres) {
          console.error('[DB FATAL] Failed to initialize PostgreSQL pool in strict mode:', err);
          throw new Error(`[DB STRICT] PostgreSQL configuration failure: ${err?.message || err}`);
        }
        console.warn('[DB] Failed to initialize PostgreSQL pool, falling back to embedded SQLite:', err);
        this.engine = 'sqlite';
      }
    } else {
      if (this.isStrictPostgres) {
        console.error('[DB FATAL] DATABASE_URL missing or invalid while STRICT_POSTGRES / REQUIRE_POSTGRES is enabled.');
        throw new Error('[DB STRICT] PostgreSQL is required by configuration, but DATABASE_URL is not provided.');
      }
      this.engine = 'sqlite';
      console.log('[DB] No DATABASE_URL provided. Initializing local embedded SQLite database for development.');
    }
  }

  public getEngine(): DbEngineType {
    return this.engine;
  }

  public isStrictMode(): boolean {
    return this.isStrictPostgres;
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
    if (this.engine === 'postgres' && this.pgPool) {
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
            strictPostgres: this.isStrictPostgres,
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
          strictPostgres: this.isStrictPostgres,
          error: err?.message || 'PostgreSQL connection failed',
        };
      }
    }

    // SQLite ping verification
    try {
      if (this.sqliteDb) {
        this.sqliteDb.prepare('SELECT 1 AS ping').get();
        return {
          healthy: true,
          engine: 'sqlite',
          latencyMs: Date.now() - start,
          strictPostgres: this.isStrictPostgres,
        };
      }
      return {
        healthy: false,
        engine: 'sqlite',
        strictPostgres: this.isStrictPostgres,
        error: 'SQLite database not initialized',
      };
    } catch (err: any) {
      return {
        healthy: false,
        engine: 'sqlite',
        strictPostgres: this.isStrictPostgres,
        error: err?.message || 'SQLite query failed',
      };
    }
  }

  public getRevisionInfo(institutionId = 'default'): { revision: number; lastModified: string } {
    const info = this.revisions.get(institutionId) || {
      revision: this.globalRevision,
      lastModified: new Date().toISOString(),
    };
    return info;
  }

  public incrementRevision(institutionId = 'default') {
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
   *
   * Only meaningful on Postgres, since a SQLite deployment is inherently
   * single-instance (one file on one disk) — MemoryStore is already
   * correct there. Returns null on SQLite so the caller can fall back.
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

    if (this.engine === 'postgres' && this.pgPool) {
      const maxRetries = 4;
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
          console.error(`[DB] PostgreSQL connection attempt ${attempt} failed:`, err?.message || err);
          if (attempt < maxRetries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[DB] Retrying in ${backoffMs}ms...`);
            await new Promise((res) => setTimeout(res, backoffMs));
          }
        }
      }

      if (this.isStrictPostgres) {
        console.error('[DB FATAL] Could not connect to PostgreSQL after multiple retries in strict mode.');
        throw new Error(`[DB STRICT] Fatal PostgreSQL connection failure: ${lastErr?.message || lastErr}`);
      }

      console.warn('[DB] Falling back to embedded SQLite after failed PostgreSQL connection attempts.');
      this.engine = 'sqlite';
    }

    this.initSqliteSchema();
    this.isInitialized = true;
    console.log('[DB] Embedded SQLite multi-tenant database verified & ready.');
  }

  private initSqliteSchema(): void {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'school_management.db');
    this.sqliteDb = new DatabaseSync(dbPath);

    // If a legacy pre-multi-tenant SQLite database exists without institution_id, reset it cleanly
    try {
      const userColumns = (this.sqliteDb.prepare("PRAGMA table_info(users)").all() as any[]).map((c: any) => c.name);
      if (userColumns.length > 0 && !userColumns.includes('institution_id')) {
        console.log('[DB] Migrating legacy single-tenant SQLite database to multi-tenant structure...');
        this.sqliteDb.exec(`
          DROP TABLE IF EXISTS users;
          DROP TABLE IF EXISTS entities;
          DROP TABLE IF EXISTS system_metadata;
          DROP TABLE IF EXISTS institutions;
          DROP TABLE IF EXISTS operator_invites;
        `);
      }
      // Older dev databases from before the per-entity schema redesign: drop
      // the generic blob tables so the app doesn't try to read stale data
      // through the old code path. Pre-launch app, no production data to
      // preserve — see the per-entity tables created below for the
      // replacement schema.
      const instColumns = (this.sqliteDb.prepare("PRAGMA table_info(institutions)").all() as any[]).map((c: any) => c.name);
      if (instColumns.length > 0 && !instColumns.includes('settings')) {
        console.log('[DB] Migrating to per-entity schema (dropping legacy generic entities/system_metadata tables)...');
        this.sqliteDb.exec(`
          DROP TABLE IF EXISTS entities;
          DROP TABLE IF EXISTS system_metadata;
        `);
      }
    } catch {
      // Table doesn't exist yet, proceed
    }

    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        registration_no TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        currency TEXT DEFAULT 'PKR',
        logo_url TEXT,
        status TEXT DEFAULT 'active',
        settings TEXT DEFAULT '{}',
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        created_by TEXT,
        last_login_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        UNIQUE(institution_id, username)
      );

      CREATE TABLE IF NOT EXISTS operator_invites (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        assigned_role TEXT NOT NULL,
        permissions TEXT DEFAULT '[]',
        expires_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_by TEXT NOT NULL,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS system_sequences (
        institution_id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        year TEXT NOT NULL,
        last_value INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT,
        PRIMARY KEY (institution_id, prefix, year)
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        institution_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Per-entity tables (replacing the old generic entities JSON blob store)

      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        name TEXT NOT NULL,
        monthly_fee REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS families (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        family_no TEXT,
        head_name TEXT NOT NULL,
        contact_phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        student_no TEXT,
        reg_no TEXT,
        name TEXT NOT NULL,
        admission_date TEXT,
        first_billing_month TEXT,
        class_id TEXT,
        monthly_discount REAL NOT NULL DEFAULT 0,
        mobile_number TEXT,
        notes TEXT,
        photo_url TEXT,
        dob TEXT,
        gender TEXT,
        b_form_no TEXT,
        family_id TEXT,
        address TEXT,
        father_name TEXT,
        father_cnic TEXT,
        father_phone TEXT,
        father_occupation TEXT,
        mother_name TEXT,
        mother_cnic TEXT,
        mother_phone TEXT,
        documents TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'Active',
        created_date TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS buses (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        bus_number TEXT,
        model TEXT,
        reg_number TEXT,
        driver_name TEXT,
        driver_phone TEXT,
        route_name TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS stops (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        name TEXT,
        area TEXT,
        landmark TEXT,
        monthly_fare REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS transport_assignments (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        month TEXT NOT NULL,
        bus_id TEXT,
        stop_id TEXT,
        trip_type TEXT,
        days_charged INTEGER NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS fee_templates (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        default_amount REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        class_id TEXT,
        student_id TEXT,
        month TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        voucher_no TEXT,
        student_id TEXT NOT NULL,
        month TEXT NOT NULL,
        class_id TEXT,
        issue_date TEXT,
        due_date TEXT,
        gross_total REAL NOT NULL DEFAULT 0,
        discount_total REAL NOT NULL DEFAULT 0,
        prev_balance REAL NOT NULL DEFAULT 0,
        late_fee_rate REAL NOT NULL DEFAULT 0,
        rounding_multiple REAL,
        net_due REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Issued',
        voucher_type TEXT,
        carry_forward_month TEXT,
        carried_late_fine REAL,
        notes TEXT,
        created_date TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS voucher_particulars (
        id TEXT PRIMARY KEY,
        voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        amount REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        collection_no TEXT,
        date TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        is_bulk_import INTEGER NOT NULL DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        txn_no TEXT,
        collection_id TEXT,
        voucher_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        month TEXT,
        amount REAL NOT NULL,
        fine_added REAL,
        payment_mode TEXT,
        reference_no TEXT,
        notes TEXT,
        date TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        bank_name TEXT,
        title TEXT,
        account_number TEXT,
        branch_code TEXT,
        instructions_ltr TEXT,
        instructions_rtl TEXT,
        instructions_line1 TEXT,
        instructions_line2 TEXT,
        logo_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        operator_id TEXT,
        operator_username TEXT,
        operator_name TEXT,
        operator_role TEXT,
        action_type TEXT NOT NULL,
        action_title TEXT,
        description TEXT,
        module TEXT,
        target_id TEXT,
        target_label TEXT,
        month TEXT,
        amount REAL,
        previous_value TEXT,
        new_value TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS student_account_history (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        timestamp TEXT,
        date TEXT,
        category TEXT,
        action_title TEXT,
        description TEXT,
        previous_value TEXT,
        new_value TEXT,
        operator_name TEXT,
        operator_role TEXT,
        month TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS locked_months (
        institution_id TEXT NOT NULL,
        month TEXT NOT NULL,
        locked_at TEXT,
        PRIMARY KEY (institution_id, month)
      );

      CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(code);
      CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
      CREATE INDEX IF NOT EXISTS idx_invites_code ON operator_invites(invite_code);
      CREATE INDEX IF NOT EXISTS idx_sequences_lookup ON system_sequences(institution_id, prefix, year);
      CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON user_sessions(session_token, expires_at);

      CREATE INDEX IF NOT EXISTS idx_classes_institution ON classes(institution_id);
      CREATE INDEX IF NOT EXISTS idx_families_institution ON families(institution_id);
      CREATE INDEX IF NOT EXISTS idx_students_institution ON students(institution_id);
      CREATE INDEX IF NOT EXISTS idx_students_institution_class ON students(institution_id, class_id);
      CREATE INDEX IF NOT EXISTS idx_students_institution_family ON students(institution_id, family_id);
      CREATE INDEX IF NOT EXISTS idx_students_institution_status ON students(institution_id, status);
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
      CREATE INDEX IF NOT EXISTS idx_student_account_history_student ON student_account_history(institution_id, student_id);
    `);
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
          currency VARCHAR(16) DEFAULT 'PKR',
          logo_url TEXT,
          status VARCHAR(32) DEFAULT 'active',
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
          status VARCHAR(32) DEFAULT 'active',
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

        -- Per-entity tables (replacing the old generic entities JSON blob store)

        CREATE TABLE IF NOT EXISTS classes (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          monthly_fee NUMERIC NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS families (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          family_no VARCHAR(64),
          head_name VARCHAR(255) NOT NULL,
          contact_phone VARCHAR(64),
          address TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
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
          b_form_no VARCHAR(64),
          family_id VARCHAR(64),
          address TEXT,
          father_name VARCHAR(255),
          father_cnic VARCHAR(64),
          father_phone VARCHAR(64),
          father_occupation VARCHAR(255),
          mother_name VARCHAR(255),
          mother_cnic VARCHAR(64),
          mother_phone VARCHAR(64),
          documents JSONB NOT NULL DEFAULT '{}'::jsonb,
          status VARCHAR(32) NOT NULL DEFAULT 'Active',
          created_date VARCHAR(32),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
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
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS fee_templates (
          id VARCHAR(64) PRIMARY KEY,
          institution_id VARCHAR(64) NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          kind VARCHAR(32) NOT NULL,
          label VARCHAR(255) NOT NULL,
          default_amount NUMERIC NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          class_id VARCHAR(64),
          student_id VARCHAR(64),
          month VARCHAR(16),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
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
          notes TEXT,
          created_date VARCHAR(32),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
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
        CREATE INDEX IF NOT EXISTS idx_students_institution_class ON students(institution_id, class_id);
        CREATE INDEX IF NOT EXISTS idx_students_institution_family ON students(institution_id, family_id);
        CREATE INDEX IF NOT EXISTS idx_students_institution_status ON students(institution_id, status);
        CREATE INDEX IF NOT EXISTS idx_students_search_trgm ON students USING GIN (
          (coalesce(name,'') || ' ' || coalesce(reg_no,'') || ' ' || coalesce(father_name,'') || ' ' ||
           coalesce(father_phone,'') || ' ' || coalesce(mother_phone,'') || ' ' || coalesce(mobile_number,'') || ' ' ||
           coalesce(b_form_no,'') || ' ' || coalesce(father_cnic,'')) gin_trgm_ops
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
        CREATE INDEX IF NOT EXISTS idx_student_account_history_student ON student_account_history(institution_id, student_id);
      `);
    } finally {
      client.release();
    }
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
      currency: institutionData.currency || 'PKR',
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

    if (this.sqliteDb) {
      try {
        this.sqliteDb.exec('BEGIN TRANSACTION;');
        const instStmt = this.sqliteDb.prepare(`
          INSERT INTO institutions (id, name, code, registration_no, address, phone, email, currency, logo_url, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        instStmt.run(
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
          institution.updated_at
        );

        const userStmt = this.sqliteDb.prepare(`
          INSERT INTO users (id, institution_id, username, email, password_hash, full_name, role, permissions, status, created_by, last_login_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        userStmt.run(
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
          admin.updated_at
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
        const tplStmt = this.sqliteDb.prepare(`
          INSERT INTO fee_templates (id, institution_id, kind, label, default_amount, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of defaultFeeTemplates) {
          const tplId = `${institution.id}_tpl_${t.sortOrder}`;
          tplStmt.run(tplId, institution.id, t.kind, t.label, t.defaultAmount, t.sortOrder, now, now);
        }

        this.sqliteDb.exec('COMMIT;');
        return { success: true, institution, admin };
      } catch (err: any) {
        try {
          this.sqliteDb.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        console.error('[DB] Failed to create institution in SQLite:', err);
        return { success: false, error: err?.message || 'Failed to create institution.' };
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM institutions WHERE id = ?');
      const row = stmt.get(id) as unknown as DbInstitution | undefined;
      return row || null;
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM institutions WHERE LOWER(code) = ?');
      const row = stmt.get(clean) as unknown as DbInstitution | undefined;
      return row || null;
    }
    return null;
  }

  public async listInstitutions(): Promise<DbInstitution[]> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM institutions ORDER BY created_at DESC');
      return res.rows as DbInstitution[];
    }
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM institutions ORDER BY created_at DESC');
      return (stmt.all() as unknown as DbInstitution[]) || [];
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

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO users (id, institution_id, username, email, password_hash, full_name, role, permissions, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
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
          user.updated_at
        );
        return { success: true, user };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to create user.' };
      }
    }

    return { success: false, error: 'Database unavailable' };
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

    if (this.sqliteDb) {
      const query = institutionId
        ? 'SELECT * FROM users WHERE LOWER(username) = ? AND institution_id = ?'
        : 'SELECT * FROM users WHERE LOWER(username) = ?';
      const params = institutionId ? [clean, institutionId] : [clean];
      const stmt = this.sqliteDb.prepare(query);
      const row = (institutionId ? stmt.get(clean, institutionId) : stmt.get(clean)) as any;
      if (!row) return null;
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?');
      const row = stmt.get(id) as any;
      if (!row) return null;
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM users WHERE institution_id = ? ORDER BY created_at ASC');
      const rows = (stmt.all(institutionId) as any[]) || [];
      return rows.map((row) => ({
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
      if (updates.last_login_at !== undefined) {
        fields.push(`last_login_at = $${idx++}`);
        values.push(updates.last_login_at);
      }

      const res = await this.pgPool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $1`, values);
      return (res.rowCount || 0) > 0;
    }

    if (this.sqliteDb) {
      const fields: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (updates.full_name !== undefined) {
        fields.push('full_name = ?');
        values.push(updates.full_name);
      }
      if (updates.username !== undefined) {
        fields.push('username = ?');
        values.push(updates.username);
      }
      if (updates.email !== undefined) {
        fields.push('email = ?');
        values.push(updates.email);
      }
      if (updates.role !== undefined) {
        fields.push('role = ?');
        values.push(updates.role);
      }
      if (updates.permissions !== undefined) {
        fields.push('permissions = ?');
        values.push(JSON.stringify(updates.permissions));
      }
      if (updates.password_hash !== undefined) {
        fields.push('password_hash = ?');
        values.push(updates.password_hash);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.last_login_at !== undefined) {
        fields.push('last_login_at = ?');
        values.push(updates.last_login_at);
      }

      values.push(id);
      const stmt = this.sqliteDb.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);
      return result.changes > 0;
    }

    return false;
  }

  public async deleteUser(institutionId: string, id: string): Promise<boolean> {
    await this.init();
    const tenantId = institutionId || 'default';
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`DELETE FROM users WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      return (res.rowCount || 0) > 0;
    }
    if (this.sqliteDb) {
      const result = this.sqliteDb.prepare(`DELETE FROM users WHERE id = ? AND institution_id = ?`).run(id, tenantId);
      return result.changes > 0;
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

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO operator_invites (id, institution_id, invite_code, full_name, assigned_role, permissions, expires_at, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        invite.id,
        invite.institution_id,
        invite.invite_code,
        invite.full_name,
        invite.assigned_role,
        JSON.stringify(invite.permissions),
        invite.expires_at,
        invite.status,
        invite.created_by,
        invite.created_at
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

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('SELECT * FROM operator_invites WHERE UPPER(invite_code) = ?');
      const row = stmt.get(clean) as any;
      if (!row) return null;
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(
        'SELECT * FROM operator_invites WHERE institution_id = ? ORDER BY created_at DESC'
      );
      const rows = (stmt.all(institutionId) as any[]) || [];
      return rows.map((row) => ({
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(
        "UPDATE operator_invites SET status = 'claimed' WHERE UPPER(invite_code) = ?"
      );
      stmt.run(clean);
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

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(
        `INSERT INTO user_sessions (session_token, user_id, institution_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      stmt.run(token, userId, institutionId, expiresAt, createdAt);
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
                u.username, u.email, u.full_name, u.role, u.permissions, u.status, u.created_by, u.last_login_at, u.created_at, u.updated_at
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

    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(
        `SELECT s.session_token, s.user_id, s.institution_id, s.expires_at,
                u.username, u.email, u.full_name, u.role, u.permissions, u.status, u.created_by, u.last_login_at, u.created_at, u.updated_at
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = ? AND s.expires_at > ?`
      );
      const row = stmt.get(token, nowIso) as any;
      if (!row) return null;
      const user: DbUser = {
        id: row.user_id,
        institution_id: row.institution_id,
        username: row.username,
        email: row.email,
        password_hash: '',
        full_name: row.full_name,
        role: row.role,
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions || [],
        status: row.status,
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

  public async deleteSession(token: string): Promise<boolean> {
    await this.init();
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
      return true;
    }
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('DELETE FROM user_sessions WHERE session_token = ?');
      stmt.run(token);
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
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare('DELETE FROM user_sessions WHERE user_id = ?');
      stmt.run(userId);
      return true;
    }
    return false;
  }

  /**
   * Generates the next monotonic sequence number for a document prefix and year.
   * Guarantees atomic, collision-free numbers even under high concurrent load.
   */
  public async nextSequenceNumber(
    institutionId: string,
    prefix: string,
    year: string
  ): Promise<number> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    const cleanPrefix = prefix.trim().toUpperCase();
    const cleanYear = year.trim();

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
         VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT (institution_id, prefix, year)
         DO UPDATE SET last_value = system_sequences.last_value + 1, updated_at = $4
         RETURNING last_value`,
        [tenantId, cleanPrefix, cleanYear, now]
      );
      return Number(res.rows[0].last_value);
    }

    if (this.sqliteDb) {
      return this.withSqliteWriteLock(() => {
        try {
          this.sqliteDb!.exec('BEGIN IMMEDIATE TRANSACTION;');
          const nextVal = this.nextSequenceNumberSqliteCore(tenantId, cleanPrefix, cleanYear, now);
          this.sqliteDb!.exec('COMMIT;');
          return nextVal;
        } catch (err) {
          try {
            this.sqliteDb!.exec('ROLLBACK;');
          } catch {
            // ignore
          }
          console.error('[DB] SQLite sequence generation error:', err);
          throw err;
        }
      });
    }

    return 1;
  }

  /**
   * Core SELECT+UPSERT logic for minting a sequence number on SQLite, with
   * NO transaction wrapping of its own. Callers must already hold the
   * SQLite write lock (via withSqliteWriteLock) and an open transaction
   * (BEGIN [IMMEDIATE]) before calling this — used both by the standalone
   * nextSequenceNumber() and by runVoucherTransaction(), which needs to mint
   * document numbers from *inside* its own already-open transaction without
   * nesting a second BEGIN on the same connection (SQLite does not support
   * nested transactions and would throw).
   */
  private nextSequenceNumberSqliteCore(tenantId: string, cleanPrefix: string, cleanYear: string, now: string): number {
    const selectStmt = this.sqliteDb!.prepare(
      'SELECT last_value FROM system_sequences WHERE institution_id = ? AND prefix = ? AND year = ?'
    );
    const existing = selectStmt.get(tenantId, cleanPrefix, cleanYear) as { last_value: number } | undefined;
    const nextVal = (existing?.last_value || 0) + 1;

    const upsertStmt = this.sqliteDb!.prepare(`
      INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(institution_id, prefix, year) DO UPDATE SET last_value = excluded.last_value, updated_at = excluded.updated_at
    `);
    upsertStmt.run(tenantId, cleanPrefix, cleanYear, nextVal, now);
    return nextVal;
  }

  /**
   * Formats a complete document number, e.g. FE2026-000042
   */
  public async nextDocumentNumber(
    institutionId: string,
    prefix: string,
    year: string,
    digits: number = 6
  ): Promise<string> {
    const num = await this.nextSequenceNumber(institutionId, prefix, year);
    return `${prefix.toUpperCase()}${year}-${String(num).padStart(digits, '0')}`;
  }

  /**
   * Reconciles sequence counters by adopting max existing values
   */
  public async reconcileSequence(
    institutionId: string,
    prefix: string,
    year: string,
    highestObservedNumber: number
  ): Promise<void> {
    if (highestObservedNumber <= 0) return;
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    const cleanPrefix = prefix.trim().toUpperCase();
    const cleanYear = year.trim();

    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (institution_id, prefix, year)
         DO UPDATE SET last_value = GREATEST(system_sequences.last_value, $4), updated_at = $5`,
        [tenantId, cleanPrefix, cleanYear, highestObservedNumber, now]
      );
      return;
    }

    if (this.sqliteDb) {
      await this.withSqliteWriteLock(() => {
        try {
          this.sqliteDb!.exec('BEGIN IMMEDIATE TRANSACTION;');
          const selectStmt = this.sqliteDb!.prepare(
            'SELECT last_value FROM system_sequences WHERE institution_id = ? AND prefix = ? AND year = ?'
          );
          const existing = selectStmt.get(tenantId, cleanPrefix, cleanYear) as { last_value: number } | undefined;
          const cur = existing?.last_value || 0;
          if (highestObservedNumber > cur) {
            const upsertStmt = this.sqliteDb!.prepare(`
              INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(institution_id, prefix, year) DO UPDATE SET last_value = excluded.last_value, updated_at = excluded.updated_at
            `);
            upsertStmt.run(tenantId, cleanPrefix, cleanYear, highestObservedNumber, now);
          }
          this.sqliteDb!.exec('COMMIT;');
        } catch (err) {
          try {
            this.sqliteDb!.exec('ROLLBACK;');
          } catch {
            // ignore
          }
        }
      });
    }
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
   *  - `{ voucherIds: [...] }` locks (Postgres: SELECT ... FOR UPDATE;
   *    SQLite: whole-DB write lock via BEGIN IMMEDIATE) exactly those rows.
   *    Use this for payment collection and carry-forward, where the set of
   *    affected vouchers is known upfront and concurrent operations on
   *    *different* vouchers should not block each other (on Postgres).
   *  - `{ allVouchers: true }` locks every voucher row for the tenant. Use
   *    this for voucher generation, which must scan ALL existing vouchers
   *    to avoid generating duplicates for the same student+month — a set of
   *    specific IDs isn't known upfront, so the whole collection must be
   *    locked to make the "check for duplicates, then insert" sequence
   *    atomic against a concurrent generation run.
   *
   * On Postgres this is safe across multiple app instances/processes (the
   * lock is enforced by the database). On SQLite (development-only; see
   * withSqliteWriteLock) it is safe within a single process.
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

  public async runVoucherTransaction<T>(
    institutionId: string,
    lockScope: { voucherIds: string[] } | { allVouchers: true },
    mutator: (
      lockedVouchers: Map<string, VoucherRecord>,
      helpers: { mintDocumentNumber: (prefix: string, year: string, digits?: number) => Promise<string> }
    ) => Promise<{ writes: VoucherTxWrites; result: T }>
  ): Promise<T> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');

        let voucherRows: any[];
        if ('allVouchers' in lockScope) {
          const res = await client.query(`SELECT * FROM vouchers WHERE institution_id = $1 FOR UPDATE`, [tenantId]);
          voucherRows = res.rows;
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
          mintDocumentNumber: async (prefix: string, year: string, digits: number = 6): Promise<string> => {
            const cleanPrefix = prefix.trim().toUpperCase();
            const cleanYear = year.trim();
            const seqRes = await client.query(
              `INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
               VALUES ($1, $2, $3, 1, $4)
               ON CONFLICT (institution_id, prefix, year)
               DO UPDATE SET last_value = system_sequences.last_value + 1, updated_at = $4
               RETURNING last_value`,
              [tenantId, cleanPrefix, cleanYear, now]
            );
            const num = Number(seqRes.rows[0].last_value);
            return `${cleanPrefix}${cleanYear}-${String(num).padStart(digits, '0')}`;
          },
        };

        const { writes, result } = await mutator(locked, helpers);

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
          await client.query(`DELETE FROM collections WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        }
        for (const id of writes.deleteVoucherIds || []) {
          await client.query(`DELETE FROM voucher_particulars WHERE voucher_id = $1`, [id]);
          await client.query(`DELETE FROM vouchers WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
        }

        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (this.sqliteDb) {
      return this.withSqliteWriteLock(async () => {
        try {
          this.sqliteDb!.exec('BEGIN IMMEDIATE TRANSACTION;');

          let voucherRows: any[];
          if ('allVouchers' in lockScope) {
            voucherRows = this.sqliteDb!.prepare(`SELECT * FROM vouchers WHERE institution_id = ?`).all(tenantId) as any[];
          } else if (lockScope.voucherIds.length > 0) {
            const placeholders = lockScope.voucherIds.map(() => '?').join(',');
            voucherRows = this.sqliteDb!
              .prepare(`SELECT * FROM vouchers WHERE institution_id = ? AND id IN (${placeholders})`)
              .all(tenantId, ...lockScope.voucherIds) as any[];
          } else {
            voucherRows = [];
          }

          const particularsByVoucher = new Map<string, Array<{ kind: string; label: string; amount: number }>>();
          for (const row of voucherRows) {
            const pRows = this.sqliteDb!
              .prepare(`SELECT * FROM voucher_particulars WHERE voucher_id = ? ORDER BY sort_order`)
              .all(row.id) as any[];
            particularsByVoucher.set(
              row.id,
              pRows.map((p) => ({ kind: p.kind, label: p.label, amount: Number(p.amount) }))
            );
          }

          const locked = new Map<string, VoucherRecord>();
          for (const row of voucherRows) {
            locked.set(row.id, this.voucherRowToRecord(row, particularsByVoucher.get(row.id) || []));
          }

          const helpers = {
            mintDocumentNumber: async (prefix: string, year: string, digits: number = 6): Promise<string> => {
              const cleanPrefix = prefix.trim().toUpperCase();
              const cleanYear = year.trim();
              const num = this.nextSequenceNumberSqliteCore(tenantId, cleanPrefix, cleanYear, now);
              return `${cleanPrefix}${cleanYear}-${String(num).padStart(digits, '0')}`;
            },
          };

          const { writes, result } = await mutator(locked, helpers);

          const upsertVoucherStmt = this.sqliteDb!.prepare(`
            INSERT INTO vouchers (id, institution_id, voucher_no, student_id, month, class_id, issue_date, due_date,
              gross_total, discount_total, prev_balance, late_fee_rate, rounding_multiple, net_due, amount_paid,
              status, voucher_type, carry_forward_month, carried_late_fine, notes, created_date, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              voucher_no=excluded.voucher_no, student_id=excluded.student_id, month=excluded.month, class_id=excluded.class_id,
              issue_date=excluded.issue_date, due_date=excluded.due_date, gross_total=excluded.gross_total,
              discount_total=excluded.discount_total, prev_balance=excluded.prev_balance, late_fee_rate=excluded.late_fee_rate,
              rounding_multiple=excluded.rounding_multiple, net_due=excluded.net_due, amount_paid=excluded.amount_paid,
              status=excluded.status, voucher_type=excluded.voucher_type, carry_forward_month=excluded.carry_forward_month,
              carried_late_fine=excluded.carried_late_fine, notes=excluded.notes, created_date=excluded.created_date,
              updated_at=excluded.updated_at
          `);
          const deleteParticularsStmt = this.sqliteDb!.prepare(`DELETE FROM voucher_particulars WHERE voucher_id = ?`);
          const insertParticularStmt = this.sqliteDb!.prepare(
            `INSERT INTO voucher_particulars (id, voucher_id, kind, label, amount, sort_order) VALUES (?,?,?,?,?,?)`
          );

          for (const [id, v] of Object.entries(writes.voucherUpserts || {})) {
            upsertVoucherStmt.run(
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
              now
            );
            deleteParticularsStmt.run(id);
            let sortOrder = 0;
            for (const p of v.particulars || []) {
              insertParticularStmt.run(`${id}_p${sortOrder}`, id, p.kind, p.label, p.amount, sortOrder);
              sortOrder++;
            }
          }

          const insertTxnStmt = this.sqliteDb!.prepare(`
            INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, fine_added, payment_mode, reference_no, notes, date, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `);
          for (const t of writes.newTransactions || []) {
            insertTxnStmt.run(
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
              now
            );
          }

          const insertColStmt = this.sqliteDb!.prepare(`
            INSERT INTO collections (id, institution_id, collection_no, date, total_amount, transaction_count, notes, is_bulk_import, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
          `);
          for (const c of writes.newCollections || []) {
            insertColStmt.run(
              c.id,
              tenantId,
              c.collectionNo,
              c.date,
              c.totalAmount,
              c.transactionCount,
              c.notes || null,
              c.isBulkImport ? 1 : 0,
              now
            );
          }

          const deleteTxnStmt = this.sqliteDb!.prepare(`DELETE FROM transactions WHERE id = ? AND institution_id = ?`);
          for (const id of writes.deleteTransactionIds || []) {
            deleteTxnStmt.run(id, tenantId);
          }

          const updateColStmt = this.sqliteDb!.prepare(
            `UPDATE collections SET total_amount = ?, transaction_count = ? WHERE id = ? AND institution_id = ?`
          );
          for (const [id, upd] of Object.entries(writes.collectionUpdates || {})) {
            updateColStmt.run(upd.totalAmount, upd.transactionCount, id, tenantId);
          }

          const deleteColStmt = this.sqliteDb!.prepare(`DELETE FROM collections WHERE id = ? AND institution_id = ?`);
          for (const id of writes.deleteCollectionIds || []) {
            deleteColStmt.run(id, tenantId);
          }

          const deleteParticularsForVoucherStmt = this.sqliteDb!.prepare(`DELETE FROM voucher_particulars WHERE voucher_id = ?`);
          const deleteVoucherStmt = this.sqliteDb!.prepare(`DELETE FROM vouchers WHERE id = ? AND institution_id = ?`);
          for (const id of writes.deleteVoucherIds || []) {
            deleteParticularsForVoucherStmt.run(id);
            deleteVoucherStmt.run(id, tenantId);
          }

          this.sqliteDb!.exec('COMMIT;');
          return result;
        } catch (err) {
          try {
            this.sqliteDb!.exec('ROLLBACK;');
          } catch {
            // ignore
          }
          console.error('[DB] SQLite voucher transaction error:', err);
          throw err;
        }
      });
    }

    throw new Error('No database engine available for voucher transaction.');
  }

  // --- Generic simple-entity CRUD (classes, families, buses, stops, transport_assignments, fee_templates, bank_accounts) ---

  public async listSimpleEntities(cfg: SimpleEntityConfig, institutionId: string, orderByColumn?: string): Promise<any[]> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = institutionId || 'default';
    const cols = ['id', ...cfg.fields.map((f) => f.column)].join(', ');
    const orderClause = orderByColumn ? ` ORDER BY ${orderByColumn}` : '';

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT ${cols} FROM ${cfg.table} WHERE institution_id = $1${orderClause}`, [
        tenantId,
      ]);
      return res.rows.map((r) => deserializeSimpleEntityRow(cfg.fields, r));
    }
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`SELECT ${cols} FROM ${cfg.table} WHERE institution_id = ?${orderClause}`);
      const rows = stmt.all(tenantId) as any[];
      return rows.map((r) => deserializeSimpleEntityRow(cfg.fields, r));
    }
    return [];
  }

  public async getSimpleEntityById(cfg: SimpleEntityConfig, institutionId: string, id: string): Promise<any | null> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = institutionId || 'default';
    const cols = ['id', ...cfg.fields.map((f) => f.column)].join(', ');

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT ${cols} FROM ${cfg.table} WHERE id = $1 AND institution_id = $2`, [
        id,
        tenantId,
      ]);
      return res.rows.length ? deserializeSimpleEntityRow(cfg.fields, res.rows[0]) : null;
    }
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`SELECT ${cols} FROM ${cfg.table} WHERE id = ? AND institution_id = ?`);
      const row = stmt.get(id, tenantId) as any;
      return row ? deserializeSimpleEntityRow(cfg.fields, row) : null;
    }
    return null;
  }

  public async createSimpleEntity(cfg: SimpleEntityConfig, institutionId: string, obj: any): Promise<any> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = institutionId || 'default';
    let id: string = obj.id || `${cfg.table}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      if (obj.id) {
        const existing = await this.pgPool.query(`SELECT id, institution_id FROM ${cfg.table} WHERE id = $1`, [obj.id]);
        if (existing.rows.length > 0) {
          if (existing.rows[0].institution_id === tenantId) {
            return this.updateSimpleEntity(cfg, tenantId, obj.id, obj);
          } else {
            // ID already taken by another tenant - generate unique ID for this tenant
            id = `${cfg.table}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
          }
        }
      }
      const values = cfg.fields.map((f) => serializeFieldValue(this.engine, f, obj[f.field]));
      const cols = ['id', 'institution_id', ...cfg.fields.map((f) => f.column), 'created_at', 'updated_at'];
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await this.pgPool.query(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`, [
        id,
        tenantId,
        ...values,
        now,
        now,
      ]);
    } else if (this.sqliteDb) {
      if (obj.id) {
        const existing = this.sqliteDb.prepare(`SELECT id, institution_id FROM ${cfg.table} WHERE id = ?`).get(obj.id) as any;
        if (existing) {
          if (existing.institution_id === tenantId) {
            return this.updateSimpleEntity(cfg, tenantId, obj.id, obj);
          } else {
            // ID already taken by another tenant - generate unique ID for this tenant
            id = `${cfg.table}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
          }
        }
      }
      const values = cfg.fields.map((f) => serializeFieldValue(this.engine, f, obj[f.field]));
      const cols = ['id', 'institution_id', ...cfg.fields.map((f) => f.column), 'created_at', 'updated_at'];
      const placeholders = cols.map(() => '?').join(', ');
      const stmt = this.sqliteDb.prepare(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`);
      stmt.run(id, tenantId, ...values, now, now);
    } else {
      throw new Error('No database engine available.');
    }

    return this.getSimpleEntityById(cfg, tenantId, id);
  }

  public async updateSimpleEntity(cfg: SimpleEntityConfig, institutionId: string, id: string, updates: any): Promise<any | null> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    const fieldsToUpdate = cfg.fields.filter((f) => Object.prototype.hasOwnProperty.call(updates, f.field));

    if (fieldsToUpdate.length === 0) {
      return this.getSimpleEntityById(cfg, tenantId, id);
    }

    const values = fieldsToUpdate.map((f) => serializeFieldValue(this.engine, f, updates[f.field]));

    if (this.engine === 'postgres' && this.pgPool) {
      const setClauses = fieldsToUpdate.map((f, i) => `${f.column} = $${i + 1}`);
      setClauses.push(`updated_at = $${fieldsToUpdate.length + 1}`);
      const res = await this.pgPool.query(
        `UPDATE ${cfg.table} SET ${setClauses.join(', ')} WHERE id = $${fieldsToUpdate.length + 2} AND institution_id = $${
          fieldsToUpdate.length + 3
        }`,
        [...values, now, id, tenantId]
      );
      if ((res.rowCount || 0) === 0) return null;
      return this.getSimpleEntityById(cfg, tenantId, id);
    }
    if (this.sqliteDb) {
      const setClauses = fieldsToUpdate.map((f) => `${f.column} = ?`);
      setClauses.push('updated_at = ?');
      const stmt = this.sqliteDb.prepare(`UPDATE ${cfg.table} SET ${setClauses.join(', ')} WHERE id = ? AND institution_id = ?`);
      const result = stmt.run(...values, now, id, tenantId);
      if (result.changes === 0) return null;
      return this.getSimpleEntityById(cfg, tenantId, id);
    }
    return null;
  }

  public async deleteSimpleEntity(cfg: SimpleEntityConfig, institutionId: string, id: string): Promise<boolean> {
    assertAllowedSimpleTable(cfg.table);
    await this.init();
    const tenantId = institutionId || 'default';

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`DELETE FROM ${cfg.table} WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      return (res.rowCount || 0) > 0;
    }
    if (this.sqliteDb) {
      const stmt = this.sqliteDb.prepare(`DELETE FROM ${cfg.table} WHERE id = ? AND institution_id = ?`);
      const result = stmt.run(id, tenantId);
      return result.changes > 0;
    }
    return false;
  }


  // --- Students (bespoke: needs search/pagination/duplicate-detection, unlike the generic simple-entity tables) ---

  private studentRowToRecord(row: any): any {
    return {
      id: row.id,
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
      bFormNo: row.b_form_no || undefined,
      familyId: row.family_id || undefined,
      address: row.address || undefined,
      fatherName: row.father_name || '',
      fatherCnic: row.father_cnic || '',
      fatherPhone: row.father_phone || '',
      fatherOccupation: row.father_occupation || undefined,
      motherName: row.mother_name || '',
      motherCnic: row.mother_cnic || undefined,
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
    'b_form_no',
    'father_cnic',
  ];

  /**
   * Server-side search/list for students, replacing the old pattern of
   * shipping every student to the browser and filtering client-side.
   * `q` matches the same set of fields the old client-side search covered
   * (name, reg/student no, guardian name, phone numbers, CNIC/B-form).
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
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(500, Math.max(1, opts.pageSize || 50));
    const offset = (page - 1) * pageSize;

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

      const dataParams = [...params, pageSize, offset];
      const res = await this.pgPool.query(
        `SELECT * FROM students WHERE ${whereClause} ORDER BY name ASC LIMIT $${p++} OFFSET $${p++}`,
        dataParams
      );
      return { students: res.rows.map((r) => this.studentRowToRecord(r)), total };
    }

    if (this.sqliteDb) {
      const conditions: string[] = ['institution_id = ?'];
      const params: any[] = [tenantId];

      if (opts.ids && opts.ids.length > 0) {
        conditions.push(`id IN (${opts.ids.map(() => '?').join(',')})`);
        params.push(...opts.ids);
      }
      if (opts.classId) {
        conditions.push('class_id = ?');
        params.push(opts.classId);
      }
      if (opts.familyId) {
        conditions.push('family_id = ?');
        params.push(opts.familyId);
      }
      if (opts.status) {
        conditions.push('status = ?');
        params.push(opts.status);
      }
      if (opts.q && opts.q.trim()) {
        const searchExpr = DatabaseService.STUDENT_SEARCH_COLUMNS.map((c) => `coalesce(${c},'')`).join(" || ' ' || ");
        conditions.push(`(${searchExpr}) LIKE ?`);
        params.push(`%${opts.q.trim()}%`);
      }

      const whereClause = conditions.join(' AND ');
      const countStmt = this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM students WHERE ${whereClause}`);
      const total = Number((countStmt.get(...params) as any).total) || 0;

      const dataStmt = this.sqliteDb.prepare(`SELECT * FROM students WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`);
      const rows = dataStmt.all(...params, pageSize, offset) as any[];
      return { students: rows.map((r) => this.studentRowToRecord(r)), total };
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
    const tenantId = institutionId || 'default';

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `SELECT class_id, COUNT(*) AS total FROM students
         WHERE institution_id = $1 AND status = 'Active' AND class_id IS NOT NULL
         GROUP BY class_id`,
        [tenantId]
      );
      return new Map(res.rows.map((r: any) => [r.class_id as string, Number(r.total) || 0]));
    }

    if (this.sqliteDb) {
      const rows = this.sqliteDb
        .prepare(
          `SELECT class_id, COUNT(*) AS total FROM students
           WHERE institution_id = ? AND status = 'Active' AND class_id IS NOT NULL
           GROUP BY class_id`
        )
        .all(tenantId) as any[];
      return new Map(rows.map((r) => [r.class_id as string, Number(r.total) || 0]));
    }

    return new Map();
  }

  public async getStudentById(institutionId: string, id: string): Promise<any | null> {
    const { students } = await this.searchStudents(institutionId, { ids: [id], pageSize: 1 });
    return students[0] || null;
  }

  /**
   * Checks whether a B-Form number or Father CNIC is already used by
   * another student in this institution — a real, indexed, server-side
   * uniqueness check replacing the old client-side full-roster scan.
   */
  public async findDuplicateStudent(
    institutionId: string,
    fields: { bFormNo?: string; fatherCnic?: string },
    excludeId?: string
  ): Promise<{ field: 'bFormNo' | 'fatherCnic'; existingStudentName: string } | null> {
    await this.init();
    const tenantId = institutionId || 'default';

    const checks: Array<{ field: 'bFormNo' | 'fatherCnic'; column: string; value?: string }> = [
      { field: 'bFormNo', column: 'b_form_no', value: fields.bFormNo?.trim() },
      { field: 'fatherCnic', column: 'father_cnic', value: fields.fatherCnic?.trim() },
    ];

    for (const check of checks) {
      if (!check.value) continue;

      if (this.engine === 'postgres' && this.pgPool) {
        const params: any[] = [tenantId, check.value];
        let clause = `institution_id = $1 AND ${check.column} = $2`;
        if (excludeId) {
          params.push(excludeId);
          clause += ` AND id != $3`;
        }
        const res = await this.pgPool.query(`SELECT name FROM students WHERE ${clause} LIMIT 1`, params);
        if (res.rows.length > 0) {
          return { field: check.field, existingStudentName: res.rows[0].name };
        }
      } else if (this.sqliteDb) {
        const params: any[] = [tenantId, check.value];
        let clause = `institution_id = ? AND ${check.column} = ?`;
        if (excludeId) {
          params.push(excludeId);
          clause += ` AND id != ?`;
        }
        const row = this.sqliteDb.prepare(`SELECT name FROM students WHERE ${clause} LIMIT 1`).get(...params) as
          | { name: string }
          | undefined;
        if (row) {
          return { field: check.field, existingStudentName: row.name };
        }
      }
    }
    return null;
  }

  public async createStudent(institutionId: string, obj: any): Promise<any> {
    await this.init();
    const tenantId = institutionId || 'default';
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
      'b_form_no',
      'family_id',
      'address',
      'father_name',
      'father_cnic',
      'father_phone',
      'father_occupation',
      'mother_name',
      'mother_cnic',
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
      obj.bFormNo || null,
      obj.familyId || null,
      obj.address || null,
      obj.fatherName || '',
      obj.fatherCnic || '',
      obj.fatherPhone || '',
      obj.fatherOccupation || null,
      obj.motherName || '',
      obj.motherCnic || null,
      obj.motherPhone || '',
      documents,
      obj.status || 'Active',
      obj.createdDate || now.split('T')[0],
      now,
      now,
    ];

    if (this.engine === 'postgres' && this.pgPool) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await this.pgPool.query(`INSERT INTO students (${cols.join(', ')}) VALUES (${placeholders})`, values);
    } else if (this.sqliteDb) {
      const placeholders = cols.map(() => '?').join(', ');
      this.sqliteDb.prepare(`INSERT INTO students (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
    } else {
      throw new Error('No database engine available.');
    }

    return this.getStudentById(tenantId, id);
  }

  public async updateStudent(institutionId: string, id: string, updates: any): Promise<any | null> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();

    const fieldMap: Record<string, { column: string; type: 'string' | 'number' }> = {
      studentNo: { column: 'student_no', type: 'string' },
      regNo: { column: 'reg_no', type: 'string' },
      name: { column: 'name', type: 'string' },
      admissionDate: { column: 'admission_date', type: 'string' },
      firstBillingMonth: { column: 'first_billing_month', type: 'string' },
      classId: { column: 'class_id', type: 'string' },
      monthlyDiscount: { column: 'monthly_discount', type: 'number' },
      mobileNumber: { column: 'mobile_number', type: 'string' },
      notes: { column: 'notes', type: 'string' },
      photoUrl: { column: 'photo_url', type: 'string' },
      dob: { column: 'dob', type: 'string' },
      gender: { column: 'gender', type: 'string' },
      bFormNo: { column: 'b_form_no', type: 'string' },
      familyId: { column: 'family_id', type: 'string' },
      address: { column: 'address', type: 'string' },
      fatherName: { column: 'father_name', type: 'string' },
      fatherCnic: { column: 'father_cnic', type: 'string' },
      fatherPhone: { column: 'father_phone', type: 'string' },
      fatherOccupation: { column: 'father_occupation', type: 'string' },
      motherName: { column: 'mother_name', type: 'string' },
      motherCnic: { column: 'mother_cnic', type: 'string' },
      motherPhone: { column: 'mother_phone', type: 'string' },
      status: { column: 'status', type: 'string' },
      createdDate: { column: 'created_date', type: 'string' },
    };

    const setCols: string[] = [];
    const values: any[] = [];
    for (const [field, spec] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        setCols.push(spec.column);
        values.push(spec.type === 'number' ? Number(updates[field]) || 0 : updates[field] ?? null);
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

    if (setCols.length === 0) {
      return this.getStudentById(tenantId, id);
    }

    if (this.engine === 'postgres' && this.pgPool) {
      const setClauses = setCols.map((c, i) => `${c} = $${i + 1}`);
      setClauses.push(`updated_at = $${setCols.length + 1}`);
      const res = await this.pgPool.query(
        `UPDATE students SET ${setClauses.join(', ')} WHERE id = $${setCols.length + 2} AND institution_id = $${
          setCols.length + 3
        }`,
        [...values, now, id, tenantId]
      );
      if ((res.rowCount || 0) === 0) return null;
    } else if (this.sqliteDb) {
      const setClauses = setCols.map((c) => `${c} = ?`);
      setClauses.push('updated_at = ?');
      const result = this.sqliteDb
        .prepare(`UPDATE students SET ${setClauses.join(', ')} WHERE id = ? AND institution_id = ?`)
        .run(...values, now, id, tenantId);
      if (result.changes === 0) return null;
    } else {
      return null;
    }

    return this.getStudentById(tenantId, id);
  }

  public async deleteStudent(institutionId: string, id: string): Promise<boolean> {
    await this.init();
    const tenantId = institutionId || 'default';
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`DELETE FROM students WHERE id = $1 AND institution_id = $2`, [id, tenantId]);
      return (res.rowCount || 0) > 0;
    }
    if (this.sqliteDb) {
      const result = this.sqliteDb.prepare(`DELETE FROM students WHERE id = ? AND institution_id = ?`).run(id, tenantId);
      return result.changes > 0;
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
    id: string
  ): Promise<{ deleted: boolean; blockedByVouchers: boolean }> {
    await this.init();
    const tenantId = institutionId || 'default';

    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        `DELETE FROM students
         WHERE id = $1 AND institution_id = $2
           AND NOT EXISTS (SELECT 1 FROM vouchers WHERE student_id = $1 AND institution_id = $2)`,
        [id, tenantId]
      );
      if ((res.rowCount || 0) > 0) {
        return { deleted: true, blockedByVouchers: false };
      }
      // Deleted nothing — find out whether that's because the student
      // doesn't exist, or because they have vouchers. This read happens
      // after the atomic delete attempt, so it only affects which error
      // message we return, not whether the deletion itself was safe.
      const existsRes = await this.pgPool.query(
        `SELECT EXISTS(SELECT 1 FROM students WHERE id = $1 AND institution_id = $2) AS exists`,
        [id, tenantId]
      );
      return { deleted: false, blockedByVouchers: Boolean(existsRes.rows[0]?.exists) };
    }

    if (this.sqliteDb) {
      return this.withSqliteWriteLock(() => {
        const result = this.sqliteDb!
          .prepare(
            `DELETE FROM students
             WHERE id = ? AND institution_id = ?
               AND NOT EXISTS (SELECT 1 FROM vouchers WHERE student_id = ? AND institution_id = ?)`
          )
          .run(id, tenantId, id, tenantId);
        if (result.changes > 0) {
          return { deleted: true, blockedByVouchers: false };
        }
        const exists = this.sqliteDb!
          .prepare(`SELECT 1 FROM students WHERE id = ? AND institution_id = ?`)
          .get(id, tenantId);
        return { deleted: false, blockedByVouchers: Boolean(exists) };
      });
    }

    return { deleted: false, blockedByVouchers: false };
  }


  // --- Vouchers (read side; writes go through runVoucherTransaction) ---

  public async listVouchers(
    institutionId: string,
    opts: { studentId?: string; classId?: string; month?: string; status?: string; page?: number; pageSize?: number }
  ): Promise<{ vouchers: any[]; total: number }> {
    await this.init();
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 100));
    const offset = (page - 1) * pageSize;

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
      return { where: conditions.join(' AND '), params, nextIndex: p };
    };

    if (this.engine === 'postgres' && this.pgPool) {
      const { where, params, nextIndex } = buildConditions((i) => `$${i}`);
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM vouchers v WHERE ${where}`, params);
      const total = Number(countRes.rows[0].total) || 0;

      const res = await this.pgPool.query(
        `SELECT v.*, s.name AS student_name, s.reg_no AS student_reg_no
         FROM vouchers v
         LEFT JOIN students s ON s.id = v.student_id AND s.institution_id = v.institution_id
         WHERE ${where}
         ORDER BY v.month DESC, v.voucher_no DESC
         LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
        [...params, pageSize, offset]
      );
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
      return { vouchers, total };
    }

    if (this.sqliteDb) {
      const { where, params } = buildConditions(() => '?');
      const total = Number(
        (this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM vouchers v WHERE ${where}`).get(...params) as any).total
      );
      const rows = this.sqliteDb
        .prepare(
          `SELECT v.*, s.name AS student_name, s.reg_no AS student_reg_no
           FROM vouchers v
           LEFT JOIN students s ON s.id = v.student_id AND s.institution_id = v.institution_id
           WHERE ${where}
           ORDER BY v.month DESC, v.voucher_no DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset) as any[];

      const vouchers = rows.map((r) => {
        const pRows = this.sqliteDb!.prepare(`SELECT * FROM voucher_particulars WHERE voucher_id = ? ORDER BY sort_order`).all(
          r.id
        ) as any[];
        const particulars = pRows.map((p) => ({ kind: p.kind, label: p.label, amount: Number(p.amount) }));
        return {
          ...this.voucherRowToRecord(r, particulars),
          studentName: r.student_name || undefined,
          studentRegNo: r.student_reg_no || undefined,
        };
      });
      return { vouchers, total };
    }

    return { vouchers: [], total: 0 };
  }

  // --- Collections & Transactions (read side; writes go through runVoucherTransaction) ---

  public async listCollections(
    institutionId: string,
    opts: { dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }
  ): Promise<{ collections: any[]; total: number }> {
    await this.init();
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 100));
    const offset = (page - 1) * pageSize;

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
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM collections WHERE ${where}`, params);
      const res = await this.pgPool.query(
        `SELECT * FROM collections WHERE ${where} ORDER BY date DESC, collection_no DESC LIMIT $${p++} OFFSET $${p++}`,
        [...params, pageSize, offset]
      );
      return { collections: res.rows.map((r) => this.collectionRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    if (this.sqliteDb) {
      const conditions = ['institution_id = ?'];
      const params: any[] = [tenantId];
      if (opts.dateFrom) {
        conditions.push('date >= ?');
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push('date <= ?');
        params.push(opts.dateTo);
      }
      const where = conditions.join(' AND ');
      const total = Number((this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM collections WHERE ${where}`).get(...params) as any).total);
      const rows = this.sqliteDb
        .prepare(`SELECT * FROM collections WHERE ${where} ORDER BY date DESC, collection_no DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, offset) as any[];
      return { collections: rows.map((r) => this.collectionRowToRecord(r)), total };
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
    opts: { studentId?: string; voucherId?: string; collectionId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }
  ): Promise<{ transactions: any[]; total: number }> {
    await this.init();
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 100));
    const offset = (page - 1) * pageSize;

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
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM transactions t WHERE ${where}`, params);
      const res = await this.pgPool.query(
        `SELECT t.*, s.name AS student_name
         FROM transactions t
         LEFT JOIN students s ON s.id = t.student_id AND s.institution_id = t.institution_id
         WHERE ${where} ORDER BY t.date DESC, t.txn_no DESC LIMIT $${p++} OFFSET $${p++}`,
        [...params, pageSize, offset]
      );
      return { transactions: res.rows.map((r) => this.transactionRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    if (this.sqliteDb) {
      const conditions = ['t.institution_id = ?'];
      const params: any[] = [tenantId];
      if (opts.studentId) {
        conditions.push('t.student_id = ?');
        params.push(opts.studentId);
      }
      if (opts.voucherId) {
        conditions.push('t.voucher_id = ?');
        params.push(opts.voucherId);
      }
      if (opts.collectionId) {
        conditions.push('t.collection_id = ?');
        params.push(opts.collectionId);
      }
      if (opts.dateFrom) {
        conditions.push('t.date >= ?');
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push('t.date <= ?');
        params.push(opts.dateTo);
      }
      const where = conditions.join(' AND ');
      const total = Number(
        (this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM transactions t WHERE ${where}`).get(...params) as any).total
      );
      const rows = this.sqliteDb
        .prepare(
          `SELECT t.*, s.name AS student_name
           FROM transactions t
           LEFT JOIN students s ON s.id = t.student_id AND s.institution_id = t.institution_id
           WHERE ${where} ORDER BY t.date DESC, t.txn_no DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset) as any[];
      return { transactions: rows.map((r) => this.transactionRowToRecord(r)), total };
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

  public async listAuditLogs(
    institutionId: string,
    opts: { module?: string; actionType?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }
  ): Promise<{ logs: any[]; total: number }> {
    await this.init();
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 100));
    const offset = (page - 1) * pageSize;

    if (this.engine === 'postgres' && this.pgPool) {
      const conditions = ['institution_id = $1'];
      const params: any[] = [tenantId];
      let p = 2;
      if (opts.module) {
        conditions.push(`module = $${p++}`);
        params.push(opts.module);
      }
      if (opts.actionType) {
        conditions.push(`action_type = $${p++}`);
        params.push(opts.actionType);
      }
      if (opts.dateFrom) {
        conditions.push(`timestamp >= $${p++}`);
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push(`timestamp <= $${p++}`);
        params.push(opts.dateTo);
      }
      const where = conditions.join(' AND ');
      const countRes = await this.pgPool.query(`SELECT COUNT(*) AS total FROM audit_logs WHERE ${where}`, params);
      const res = await this.pgPool.query(
        `SELECT * FROM audit_logs WHERE ${where} ORDER BY timestamp DESC LIMIT $${p++} OFFSET $${p++}`,
        [...params, pageSize, offset]
      );
      return { logs: res.rows.map((r) => this.auditLogRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    if (this.sqliteDb) {
      const conditions = ['institution_id = ?'];
      const params: any[] = [tenantId];
      if (opts.module) {
        conditions.push('module = ?');
        params.push(opts.module);
      }
      if (opts.actionType) {
        conditions.push('action_type = ?');
        params.push(opts.actionType);
      }
      if (opts.dateFrom) {
        conditions.push('timestamp >= ?');
        params.push(opts.dateFrom);
      }
      if (opts.dateTo) {
        conditions.push('timestamp <= ?');
        params.push(opts.dateTo);
      }
      const where = conditions.join(' AND ');
      const total = Number((this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM audit_logs WHERE ${where}`).get(...params) as any).total);
      const rows = this.sqliteDb
        .prepare(`SELECT * FROM audit_logs WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, offset) as any[];
      return { logs: rows.map((r) => this.auditLogRowToRecord(r)), total };
    }
    return { logs: [], total: 0 };
  }

  /**
   * The ONLY way to write an audit log entry — always server-generated from
   * the action being audited, never accepted verbatim from a client
   * payload. See the security note on the old syncState() for why.
   */
  public async appendAuditLog(institutionId: string, entry: Record<string, any>): Promise<any> {
    await this.init();
    const tenantId = institutionId || 'default';
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

    if (this.engine === 'postgres' && this.pgPool) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await this.pgPool.query(`INSERT INTO audit_logs (${cols.join(', ')}) VALUES (${placeholders})`, values);
    } else if (this.sqliteDb) {
      const placeholders = cols.map(() => '?').join(', ');
      this.sqliteDb.prepare(`INSERT INTO audit_logs (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
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
    const tenantId = institutionId || 'default';
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 200));
    const offset = (page - 1) * pageSize;

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
      const res = await this.pgPool.query(
        `SELECT * FROM student_account_history WHERE ${where} ORDER BY timestamp DESC LIMIT $${p++} OFFSET $${p++}`,
        [...params, pageSize, offset]
      );
      return { entries: res.rows.map((r) => this.studentHistoryRowToRecord(r)), total: Number(countRes.rows[0].total) || 0 };
    }
    if (this.sqliteDb) {
      const conditions = ['institution_id = ?'];
      const params: any[] = [tenantId];
      if (opts.studentId) {
        conditions.push('student_id = ?');
        params.push(opts.studentId);
      }
      const where = conditions.join(' AND ');
      const total = Number(
        (this.sqliteDb.prepare(`SELECT COUNT(*) AS total FROM student_account_history WHERE ${where}`).get(...params) as any).total
      );
      const rows = this.sqliteDb
        .prepare(`SELECT * FROM student_account_history WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, offset) as any[];
      return { entries: rows.map((r) => this.studentHistoryRowToRecord(r)), total };
    }
    return { entries: [], total: 0 };
  }

  public async appendStudentAccountHistory(institutionId: string, entry: Record<string, any>): Promise<any> {
    await this.init();
    const tenantId = institutionId || 'default';
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

    if (this.engine === 'postgres' && this.pgPool) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await this.pgPool.query(`INSERT INTO student_account_history (${cols.join(', ')}) VALUES (${placeholders})`, values);
    } else if (this.sqliteDb) {
      const placeholders = cols.map(() => '?').join(', ');
      this.sqliteDb.prepare(`INSERT INTO student_account_history (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
    }
    return { id, timestamp, ...entry };
  }

  // --- Locked Months ---

  public async listLockedMonths(institutionId: string): Promise<string[]> {
    await this.init();
    const tenantId = institutionId || 'default';
    if (this.engine === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(`SELECT month FROM locked_months WHERE institution_id = $1 ORDER BY month`, [tenantId]);
      return res.rows.map((r) => r.month);
    }
    if (this.sqliteDb) {
      const rows = this.sqliteDb
        .prepare(`SELECT month FROM locked_months WHERE institution_id = ? ORDER BY month`)
        .all(tenantId) as any[];
      return rows.map((r) => r.month);
    }
    return [];
  }

  public async lockMonth(institutionId: string, month: string): Promise<void> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO locked_months (institution_id, month, locked_at) VALUES ($1,$2,$3) ON CONFLICT (institution_id, month) DO NOTHING`,
        [tenantId, month, now]
      );
    } else if (this.sqliteDb) {
      this.sqliteDb
        .prepare(`INSERT INTO locked_months (institution_id, month, locked_at) VALUES (?,?,?) ON CONFLICT(institution_id, month) DO NOTHING`)
        .run(tenantId, month, now);
    }
  }

  public async unlockMonth(institutionId: string, month: string): Promise<void> {
    await this.init();
    const tenantId = institutionId || 'default';
    if (this.engine === 'postgres' && this.pgPool) {
      await this.pgPool.query(`DELETE FROM locked_months WHERE institution_id = $1 AND month = $2`, [tenantId, month]);
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`DELETE FROM locked_months WHERE institution_id = ? AND month = ?`).run(tenantId, month);
    }
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
    const tenantId = institutionId || 'default';
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
    } else if (this.sqliteDb) {
      const setClauses = setCols.map((c) => `${c} = ?`);
      setClauses.push('updated_at = ?');
      this.sqliteDb.prepare(`UPDATE institutions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values, now, tenantId);
    }

    return this.getInstitutionById(tenantId);
  }

  // --- Backup export / restore ---

  public async exportInstitutionBackup(institutionId: string): Promise<Record<string, any>> {
    const tenantId = institutionId || 'default';
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
    const { students } = await this.searchStudents(tenantId, { pageSize: 100000 });
    const { vouchers } = await this.listVouchers(tenantId, { pageSize: 100000 });
    const { collections } = await this.listCollections(tenantId, { pageSize: 100000 });
    const { transactions } = await this.listTransactions(tenantId, { pageSize: 100000 });
    const { logs: auditLogs } = await this.listAuditLogs(tenantId, { pageSize: 100000 });
    const { entries: studentAccountHistory } = await this.listStudentAccountHistory(tenantId, { pageSize: 100000 });
    const lockedMonths = await this.listLockedMonths(tenantId);

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
    const tenantId = institutionId || 'default';
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
        } else if (this.sqliteDb) {
          if (table === 'voucher_particulars') {
            this.sqliteDb
              .prepare(`DELETE FROM voucher_particulars WHERE voucher_id IN (SELECT id FROM vouchers WHERE institution_id = ?)`)
              .run(tenantId);
          } else {
            this.sqliteDb.prepare(`DELETE FROM ${table} WHERE institution_id = ?`).run(tenantId);
          }
        }
      }

      // Reload simple entities
      for (const [config, items] of [
        [CLASS_ENTITY_CONFIG, backup.classes],
        [FAMILY_ENTITY_CONFIG, backup.families],
        [BUS_ENTITY_CONFIG, backup.buses],
        [STOP_ENTITY_CONFIG, backup.stops],
        [TRANSPORT_ASSIGNMENT_ENTITY_CONFIG, backup.transportAssignments],
        [FEE_TEMPLATE_ENTITY_CONFIG, backup.feeTemplates],
        [BANK_ACCOUNT_ENTITY_CONFIG, backup.bankAccounts],
      ] as [SimpleEntityConfig, any[]][]) {
        for (const item of items || []) {
          await this.createSimpleEntity(config, tenantId, item);
        }
      }

      for (const student of backup.students || []) {
        await this.createStudent(tenantId, student);
      }

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
        } else if (this.sqliteDb) {
          this.sqliteDb
            .prepare(
              `INSERT INTO collections (id, institution_id, collection_no, date, total_amount, transaction_count, notes, is_bulk_import, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)`
            )
            .run(c.id, tenantId, c.collectionNo, c.date, c.totalAmount, c.transactionCount, c.notes || null, c.isBulkImport ? 1 : 0, new Date().toISOString());
        }
      }

      for (const t of backup.transactions || []) {
        if (this.engine === 'postgres' && this.pgPool) {
          await this.pgPool.query(
            `INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, fine_added, payment_mode, reference_no, notes, date, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [t.id, tenantId, t.txnNo, t.collectionId, t.voucherId, t.studentId, t.month, t.amount, t.fineAdded ?? null, t.paymentMode || null, t.referenceNo || null, t.notes || null, t.date, new Date().toISOString()]
          );
        } else if (this.sqliteDb) {
          this.sqliteDb
            .prepare(
              `INSERT INTO transactions (id, institution_id, txn_no, collection_id, voucher_id, student_id, month, amount, fine_added, payment_mode, reference_no, notes, date, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            )
            .run(t.id, tenantId, t.txnNo, t.collectionId, t.voucherId, t.studentId, t.month, t.amount, t.fineAdded ?? null, t.paymentMode || null, t.referenceNo || null, t.notes || null, t.date, new Date().toISOString());
        }
      }

      for (const entry of backup.auditLogs || []) {
        await this.appendAuditLog(tenantId, entry);
      }
      for (const entry of backup.studentAccountHistory || []) {
        await this.appendStudentAccountHistory(tenantId, entry);
      }
      for (const month of backup.lockedMonths || []) {
        await this.lockMonth(tenantId, month);
      }

      this.incrementRevision(tenantId);
      return { success: true };
    } catch (err: any) {
      console.error(`[DB] Backup restore failed for tenant ${tenantId}:`, err);
      return { success: false, error: err?.message || 'Backup restore failed' };
    }
  }

}

export const dbService = new DatabaseService();