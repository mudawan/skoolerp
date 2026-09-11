import fs from 'fs';
import path from 'path';
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

class DatabaseService {
  private engine: DbEngineType = 'sqlite';
  private sqliteDb: DatabaseSync | null = null;
  private pgPool: pg.Pool | null = null;
  private isInitialized = false;
  private isStrictPostgres = false;
  private revisions: Map<string, { revision: number; lastModified: string }> = new Map();
  private globalRevision: number = 1;

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
        currency TEXT DEFAULT 'PKR',
        logo_url TEXT,
        status TEXT DEFAULT 'active',
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

      CREATE TABLE IF NOT EXISTS entities (
        institution_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (institution_id, collection_name, id)
      );

      CREATE TABLE IF NOT EXISTS system_metadata (
        institution_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT,
        PRIMARY KEY (institution_id, key)
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

      CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(code);
      CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
      CREATE INDEX IF NOT EXISTS idx_invites_code ON operator_invites(invite_code);
      CREATE INDEX IF NOT EXISTS idx_entities_tenant_coll ON entities(institution_id, collection_name);
      CREATE INDEX IF NOT EXISTS idx_sequences_lookup ON system_sequences(institution_id, prefix, year);
      CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON user_sessions(session_token, expires_at);
    `);
  }

  private async initPostgresSchema(): Promise<void> {
    if (!this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS institutions (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(32) UNIQUE NOT NULL,
          registration_no VARCHAR(128),
          address TEXT,
          phone VARCHAR(64),
          email VARCHAR(128),
          currency VARCHAR(16) DEFAULT 'PKR',
          logo_url TEXT,
          status VARCHAR(32) DEFAULT 'active',
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

        CREATE TABLE IF NOT EXISTS entities (
          institution_id VARCHAR(64) NOT NULL,
          collection_name VARCHAR(64) NOT NULL,
          id VARCHAR(128) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (institution_id, collection_name, id)
        );

        CREATE TABLE IF NOT EXISTS system_metadata (
          institution_id VARCHAR(64) NOT NULL,
          key VARCHAR(128) NOT NULL,
          value TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (institution_id, key)
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

        CREATE INDEX IF NOT EXISTS idx_institutions_code ON institutions(LOWER(code));
        CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
        CREATE INDEX IF NOT EXISTS idx_invites_code ON operator_invites(LOWER(invite_code));
        CREATE INDEX IF NOT EXISTS idx_entities_tenant_coll ON entities(institution_id, collection_name);
        CREATE INDEX IF NOT EXISTS idx_sequences_lookup ON system_sequences(institution_id, prefix, year);
        CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON user_sessions(session_token, expires_at);
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
      if (updates.last_login_at !== undefined) {
        fields.push(`last_login_at = $${idx++}`);
        values.push(updates.last_login_at);
      }

      await this.pgPool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $1`, values);
      return true;
    }

    if (this.sqliteDb) {
      const fields: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (updates.full_name !== undefined) {
        fields.push('full_name = ?');
        values.push(updates.full_name);
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
      if (updates.last_login_at !== undefined) {
        fields.push('last_login_at = ?');
        values.push(updates.last_login_at);
      }

      values.push(id);
      const stmt = this.sqliteDb.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
      return true;
    }

    return false;
  }

  // --- Operator Invites ---

  public async createInvite(data: {
    institutionId: string;
    fullName: string;
    assignedRole: string;
    permissions: string[];
    createdBy: string;
    inviteCode?: string;
  }): Promise<{ success: boolean; invite?: DbOperatorInvite; error?: string }> {
    await this.init();
    const id = 'inv_' + Math.random().toString(36).substring(2, 9);
    const code =
      data.inviteCode ||
      'INV-' +
        Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days validity

    const invite: DbOperatorInvite = {
      id,
      institution_id: data.institutionId,
      invite_code: code.toUpperCase(),
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

  // --- Multi-Tenant Scoped Collection Operations ---

  public async getCollection<T = any>(institutionId: string, collectionName: string): Promise<T[]> {
    await this.init();
    const tenantId = institutionId || 'default';

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          'SELECT data FROM entities WHERE institution_id = $1 AND collection_name = $2 ORDER BY id ASC',
          [tenantId, collectionName]
        );
        return res.rows.map((r) => r.data);
      } catch (err) {
        console.error(`[DB] Error fetching ${collectionName} for tenant ${tenantId}:`, err);
        return [];
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(
          'SELECT data FROM entities WHERE institution_id = ? AND collection_name = ? ORDER BY id ASC'
        );
        const rows = stmt.all(tenantId, collectionName) as { data: string }[];
        return rows.map((r) => JSON.parse(r.data));
      } catch (err) {
        console.error(`[DB] Error fetching ${collectionName} for tenant ${tenantId} from SQLite:`, err);
        return [];
      }
    }

    return [];
  }

  public async saveCollection<T extends { id?: string }>(
    institutionId: string,
    collectionName: string,
    items: T[]
  ): Promise<boolean> {
    await this.init();
    if (!Array.isArray(items)) return false;
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM entities WHERE institution_id = $1 AND collection_name = $2',
          [tenantId, collectionName]
        );

        for (const item of items) {
          const id = item.id || (item as any).key || Math.random().toString(36).substring(2, 12);
          await client.query(
            'INSERT INTO entities (institution_id, collection_name, id, data, updated_at) VALUES ($1, $2, $3, $4, $5)',
            [tenantId, collectionName, String(id), JSON.stringify(item), now]
          );
        }
        await client.query('COMMIT');
        return true;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB] Error saving collection ${collectionName} for tenant ${tenantId}:`, err);
        return false;
      } finally {
        client.release();
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.exec('BEGIN TRANSACTION;');
        const deleteStmt = this.sqliteDb.prepare(
          'DELETE FROM entities WHERE institution_id = ? AND collection_name = ?'
        );
        deleteStmt.run(tenantId, collectionName);

        const insertStmt = this.sqliteDb.prepare(
          'INSERT INTO entities (institution_id, collection_name, id, data, updated_at) VALUES (?, ?, ?, ?, ?)'
        );

        for (const item of items) {
          const id = item.id || (item as any).key || Math.random().toString(36).substring(2, 12);
          insertStmt.run(tenantId, collectionName, String(id), JSON.stringify(item), now);
        }

        this.sqliteDb.exec('COMMIT;');
        return true;
      } catch (err) {
        try {
          this.sqliteDb.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        console.error(`[DB] Error saving collection ${collectionName} for tenant ${tenantId} in SQLite:`, err);
        return false;
      }
    }

    return false;
  }

  public async getMeta<T = any>(
    institutionId: string,
    key: string,
    defaultValue: T | null = null
  ): Promise<T | null> {
    await this.init();
    const tenantId = institutionId || 'default';

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          'SELECT value FROM system_metadata WHERE institution_id = $1 AND key = $2',
          [tenantId, key]
        );
        if (res.rows.length === 0) return defaultValue;
        return JSON.parse(res.rows[0].value);
      } catch {
        return defaultValue;
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(
          'SELECT value FROM system_metadata WHERE institution_id = ? AND key = ?'
        );
        const row = stmt.get(tenantId, key) as { value: string } | undefined;
        if (!row) return defaultValue;
        return JSON.parse(row.value);
      } catch {
        return defaultValue;
      }
    }

    return defaultValue;
  }

  public async setMeta(institutionId: string, key: string, value: any): Promise<boolean> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value);

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO system_metadata (institution_id, key, value, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (institution_id, key) DO UPDATE SET value = $3, updated_at = $4`,
          [tenantId, key, serialized, now]
        );
        return true;
      } catch (err) {
        console.error(`[DB] Error setting meta ${key} for tenant ${tenantId}:`, err);
        return false;
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO system_metadata (institution_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(institution_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        stmt.run(tenantId, key, serialized, now);
        return true;
      } catch (err) {
        console.error(`[DB] Error setting meta ${key} for tenant ${tenantId} in SQLite:`, err);
        return false;
      }
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
      try {
        this.sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION;');
        const selectStmt = this.sqliteDb.prepare(
          'SELECT last_value FROM system_sequences WHERE institution_id = ? AND prefix = ? AND year = ?'
        );
        const existing = selectStmt.get(tenantId, cleanPrefix, cleanYear) as { last_value: number } | undefined;
        const nextVal = (existing?.last_value || 0) + 1;

        const upsertStmt = this.sqliteDb.prepare(`
          INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(institution_id, prefix, year) DO UPDATE SET last_value = excluded.last_value, updated_at = excluded.updated_at
        `);
        upsertStmt.run(tenantId, cleanPrefix, cleanYear, nextVal, now);
        this.sqliteDb.exec('COMMIT;');
        return nextVal;
      } catch (err) {
        try {
          this.sqliteDb.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        console.error('[DB] SQLite sequence generation error:', err);
        throw err;
      }
    }

    return 1;
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
      try {
        this.sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION;');
        const selectStmt = this.sqliteDb.prepare(
          'SELECT last_value FROM system_sequences WHERE institution_id = ? AND prefix = ? AND year = ?'
        );
        const existing = selectStmt.get(tenantId, cleanPrefix, cleanYear) as { last_value: number } | undefined;
        const cur = existing?.last_value || 0;
        if (highestObservedNumber > cur) {
          const upsertStmt = this.sqliteDb.prepare(`
            INSERT INTO system_sequences (institution_id, prefix, year, last_value, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(institution_id, prefix, year) DO UPDATE SET last_value = excluded.last_value, updated_at = excluded.updated_at
          `);
          upsertStmt.run(tenantId, cleanPrefix, cleanYear, highestObservedNumber, now);
        }
        this.sqliteDb.exec('COMMIT;');
      } catch (err) {
        try {
          this.sqliteDb.exec('ROLLBACK;');
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Saves or updates a single entity within a collection
   */
  public async upsertEntity<T extends { id: string }>(
    institutionId: string,
    collectionName: string,
    item: T
  ): Promise<boolean> {
    await this.init();
    const tenantId = institutionId || 'default';
    const now = new Date().toISOString();
    const serialized = JSON.stringify(item);

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO entities (institution_id, collection_name, id, data, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (institution_id, collection_name, id)
           DO UPDATE SET data = $4, updated_at = $5`,
          [tenantId, collectionName, item.id, serialized, now]
        );
        return true;
      } catch (err) {
        console.error(`[DB] Error upserting ${collectionName}/${item.id} for tenant ${tenantId}:`, err);
        return false;
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO entities (institution_id, collection_name, id, data, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(institution_id, collection_name, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        `);
        stmt.run(tenantId, collectionName, item.id, serialized, now);
        return true;
      } catch (err) {
        console.error(`[DB] Error upserting ${collectionName}/${item.id} in SQLite:`, err);
        return false;
      }
    }

    return false;
  }

  /**
   * Fetches the entire application state for a specific institution
   */
  public async getFullState(institutionId: string): Promise<DatabaseState> {
    const tenantId = institutionId || 'default';
    const institution = await this.getInstitutionById(tenantId);
    const dbUsers = await this.listUsers(tenantId);

    const [
      classes,
      students,
      families,
      buses,
      stops,
      transportAssignments,
      templates,
      vouchers,
      collections,
      transactions,
      bankAccounts,
      auditLogs,
      studentAccountHistory,
      lockedMonths,
      instituteMeta,
      systemConfig,
    ] = await Promise.all([
      this.getCollection(tenantId, 'classes'),
      this.getCollection(tenantId, 'students'),
      this.getCollection(tenantId, 'families'),
      this.getCollection(tenantId, 'buses'),
      this.getCollection(tenantId, 'stops'),
      this.getCollection(tenantId, 'assignments'),
      this.getCollection(tenantId, 'templates'),
      this.getCollection(tenantId, 'vouchers'),
      this.getCollection(tenantId, 'collections'),
      this.getCollection(tenantId, 'transactions'),
      this.getCollection(tenantId, 'banks'),
      this.getCollection(tenantId, 'audit_logs'),
      this.getCollection(tenantId, 'student_account_history'),
      this.getMeta<string[]>(tenantId, 'locked_months', []),
      this.getMeta<any>(tenantId, 'institute', null),
      this.getMeta<any>(tenantId, 'system_config', null),
    ]);

    const mappedUsers = dbUsers.map((u) => ({
      id: u.id,
      institutionId: u.institution_id,
      username: u.username,
      name: u.full_name,
      role: u.role,
      permissions: u.permissions,
      email: u.email,
      lastLogin: u.last_login_at,
      status: u.status,
    }));

    return {
      institution: institution || undefined,
      users: mappedUsers,
      classes,
      students,
      families,
      buses,
      stops,
      transportAssignments,
      templates,
      vouchers,
      collections,
      transactions,
      bankAccounts,
      auditLogs,
      studentAccountHistory,
      lockedMonths: lockedMonths || [],
      institute: instituteMeta || (institution ? {
        name: institution.name,
        code: institution.code,
        regNo: institution.registration_no,
        address: institution.address,
        phone: institution.phone,
        email: institution.email,
        currency: institution.currency,
        logoUrl: institution.logo_url,
      } : undefined),
      systemConfig: systemConfig || undefined,
    };
  }

  /**
   * Saves tenant state updates to the database
   */
  public async syncState(
    institutionId: string,
    payload: Partial<DatabaseState>
  ): Promise<{ success: boolean; error?: string }> {
    const tenantId = institutionId || 'default';
    try {
      const promises: Promise<any>[] = [];

      if (payload.classes) promises.push(this.saveCollection(tenantId, 'classes', payload.classes));
      if (payload.students) promises.push(this.saveCollection(tenantId, 'students', payload.students));
      if (payload.families) promises.push(this.saveCollection(tenantId, 'families', payload.families));
      if (payload.buses) promises.push(this.saveCollection(tenantId, 'buses', payload.buses));
      if (payload.stops) promises.push(this.saveCollection(tenantId, 'stops', payload.stops));
      if (payload.transportAssignments)
        promises.push(this.saveCollection(tenantId, 'assignments', payload.transportAssignments));
      if (payload.templates) promises.push(this.saveCollection(tenantId, 'templates', payload.templates));
      if (payload.vouchers) promises.push(this.saveCollection(tenantId, 'vouchers', payload.vouchers));
      if (payload.collections) promises.push(this.saveCollection(tenantId, 'collections', payload.collections));
      if (payload.transactions) promises.push(this.saveCollection(tenantId, 'transactions', payload.transactions));
      if (payload.bankAccounts) promises.push(this.saveCollection(tenantId, 'banks', payload.bankAccounts));
      if (payload.auditLogs) promises.push(this.saveCollection(tenantId, 'audit_logs', payload.auditLogs));
      if (payload.studentAccountHistory)
        promises.push(this.saveCollection(tenantId, 'student_account_history', payload.studentAccountHistory));

      if (payload.lockedMonths) promises.push(this.setMeta(tenantId, 'locked_months', payload.lockedMonths));
      if (payload.institute) promises.push(this.setMeta(tenantId, 'institute', payload.institute));
      if (payload.systemConfig) promises.push(this.setMeta(tenantId, 'system_config', payload.systemConfig));

      await Promise.all(promises);
      this.incrementRevision(tenantId);
      return { success: true };
    } catch (err: any) {
      console.error(`[DB] Error in syncState for tenant ${tenantId}:`, err);
      return { success: false, error: err?.message || 'Database sync error' };
    }
  }
}

export const dbService = new DatabaseService();