import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

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
}

export type DbEngineType = 'postgres' | 'sqlite';

class DatabaseService {
  private engine: DbEngineType = 'sqlite';
  private sqliteDb: DatabaseSync | null = null;
  private pgPool: pg.Pool | null = null;
  private isInitialized = false;
  private revision: number = 1;
  private lastModified: string = new Date().toISOString();

  constructor() {
    // Check if Postgres URL is provided
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && databaseUrl.trim().startsWith('postgres')) {
      try {
        this.pgPool = new pg.Pool({
          connectionString: databaseUrl.trim(),
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        this.engine = 'postgres';
        console.log('[DB] Configured PostgreSQL database engine from DATABASE_URL.');
      } catch (err) {
        console.warn('[DB] Failed to initialize PostgreSQL pool, falling back to SQLite:', err);
        this.engine = 'sqlite';
      }
    } else {
      this.engine = 'sqlite';
      console.log('[DB] No DATABASE_URL provided. Initializing local embedded SQLite database.');
    }
  }

  public getEngine(): DbEngineType {
    return this.engine;
  }

  public getRevisionInfo(): { revision: number; lastModified: string } {
    return {
      revision: this.revision,
      lastModified: this.lastModified,
    };
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        await this.initPostgresSchema();
        this.isInitialized = true;
        console.log('[DB] PostgreSQL tables verified & ready.');
        return;
      } catch (err) {
        console.error('[DB] PostgreSQL connection error, falling back to embedded SQLite:', err);
        this.engine = 'sqlite';
      }
    }

    // Fallback or default: SQLite
    this.initSqliteSchema();
    this.isInitialized = true;
    console.log('[DB] Embedded SQLite database verified & ready.');
  }

  private initSqliteSchema(): void {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'school_management.db');
    this.sqliteDb = new DatabaseSync(dbPath);

    // Create a key-value / collection store with JSON document serialization
    // This provides fast relational queries and clean document persistence
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS entities (
        collection_name TEXT,
        id TEXT,
        data TEXT,
        updated_at TEXT,
        PRIMARY KEY (collection_name, id)
      );

      CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection_name);
    `);
  }

  private async initPostgresSchema(): Promise<void> {
    if (!this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_metadata (
          key VARCHAR(128) PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS entities (
          collection_name VARCHAR(64) NOT NULL,
          id VARCHAR(128) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (collection_name, id)
        );

        CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection_name);
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all records from a given collection name
   */
  public async getCollection<T = any>(collectionName: string): Promise<T[]> {
    await this.init();

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          'SELECT data FROM entities WHERE collection_name = $1 ORDER BY id ASC',
          [collectionName]
        );
        return res.rows.map((r) => r.data);
      } catch (err) {
        console.error(`[DB] Error fetching ${collectionName} from Postgres:`, err);
        return [];
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(
          'SELECT data FROM entities WHERE collection_name = ? ORDER BY id ASC'
        );
        const rows = stmt.all(collectionName) as { data: string }[];
        return rows.map((r) => JSON.parse(r.data));
      } catch (err) {
        console.error(`[DB] Error fetching ${collectionName} from SQLite:`, err);
        return [];
      }
    }

    return [];
  }

  /**
   * Replaces an entire collection with a new array of items atomically
   */
  public async saveCollection<T extends { id?: string }>(
    collectionName: string,
    items: T[]
  ): Promise<boolean> {
    await this.init();
    if (!Array.isArray(items)) return false;

    const now = new Date().toISOString();

    if (this.engine === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM entities WHERE collection_name = $1', [collectionName]);

        for (const item of items) {
          const id = item.id || (item as any).key || Math.random().toString(36).substring(2, 12);
          await client.query(
            'INSERT INTO entities (collection_name, id, data, updated_at) VALUES ($1, $2, $3, $4)',
            [collectionName, String(id), JSON.stringify(item), now]
          );
        }
        await client.query('COMMIT');
        return true;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB] Error saving collection ${collectionName} to Postgres:`, err);
        return false;
      } finally {
        client.release();
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.exec('BEGIN TRANSACTION;');
        const deleteStmt = this.sqliteDb.prepare('DELETE FROM entities WHERE collection_name = ?');
        deleteStmt.run(collectionName);

        const insertStmt = this.sqliteDb.prepare(
          'INSERT INTO entities (collection_name, id, data, updated_at) VALUES (?, ?, ?, ?)'
        );

        for (const item of items) {
          const id = item.id || (item as any).key || Math.random().toString(36).substring(2, 12);
          insertStmt.run(collectionName, String(id), JSON.stringify(item), now);
        }

        this.sqliteDb.exec('COMMIT;');
        return true;
      } catch (err) {
        try {
          this.sqliteDb.exec('ROLLBACK;');
        } catch {
          // Ignore
        }
        console.error(`[DB] Error saving collection ${collectionName} to SQLite:`, err);
        return false;
      }
    }

    return false;
  }

  /**
   * Gets a single value from metadata (e.g. institute profile, system settings)
   */
  public async getMeta<T = any>(key: string, defaultValue: T | null = null): Promise<T | null> {
    await this.init();

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          'SELECT value FROM system_metadata WHERE key = $1',
          [key]
        );
        if (res.rows.length === 0) return defaultValue;
        return JSON.parse(res.rows[0].value);
      } catch {
        return defaultValue;
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare('SELECT value FROM system_metadata WHERE key = ?');
        const row = stmt.get(key) as { value: string } | undefined;
        if (!row) return defaultValue;
        return JSON.parse(row.value);
      } catch {
        return defaultValue;
      }
    }

    return defaultValue;
  }

  /**
   * Sets a single value in metadata
   */
  public async setMeta(key: string, value: any): Promise<boolean> {
    await this.init();
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value);

    if (this.engine === 'postgres' && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO system_metadata (key, value, updated_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
          [key, serialized, now]
        );
        return true;
      } catch (err) {
        console.error(`[DB] Error setting meta ${key}:`, err);
        return false;
      }
    }

    if (this.sqliteDb) {
      try {
        const stmt = this.sqliteDb.prepare(`
          INSERT INTO system_metadata (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        stmt.run(key, serialized, now);
        return true;
      } catch (err) {
        console.error(`[DB] Error setting meta ${key} in SQLite:`, err);
        return false;
      }
    }

    return false;
  }

  /**
   * Fetches the entire application state for initial hydration
   */
  public async getFullState(): Promise<DatabaseState> {
    const [
      users,
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
      institute,
      systemConfig,
    ] = await Promise.all([
      this.getCollection('users'),
      this.getCollection('classes'),
      this.getCollection('students'),
      this.getCollection('families'),
      this.getCollection('buses'),
      this.getCollection('stops'),
      this.getCollection('assignments'),
      this.getCollection('templates'),
      this.getCollection('vouchers'),
      this.getCollection('collections'),
      this.getCollection('transactions'),
      this.getCollection('banks'),
      this.getCollection('audit_logs'),
      this.getCollection('student_account_history'),
      this.getMeta<string[]>('locked_months', []),
      this.getMeta<any>('institute', null),
      this.getMeta<any>('system_config', null),
    ]);

    return {
      users,
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
      institute: institute || undefined,
      systemConfig: systemConfig || undefined,
    };
  }

  /**
   * Saves incoming state updates to the database
   */
  public async syncState(payload: Partial<DatabaseState>): Promise<{ success: boolean; error?: string }> {
    try {
      const promises: Promise<any>[] = [];

      if (payload.users) promises.push(this.saveCollection('users', payload.users));
      if (payload.classes) promises.push(this.saveCollection('classes', payload.classes));
      if (payload.students) promises.push(this.saveCollection('students', payload.students));
      if (payload.families) promises.push(this.saveCollection('families', payload.families));
      if (payload.buses) promises.push(this.saveCollection('buses', payload.buses));
      if (payload.stops) promises.push(this.saveCollection('stops', payload.stops));
      if (payload.transportAssignments) promises.push(this.saveCollection('assignments', payload.transportAssignments));
      if (payload.templates) promises.push(this.saveCollection('templates', payload.templates));
      if (payload.vouchers) promises.push(this.saveCollection('vouchers', payload.vouchers));
      if (payload.collections) promises.push(this.saveCollection('collections', payload.collections));
      if (payload.transactions) promises.push(this.saveCollection('transactions', payload.transactions));
      if (payload.bankAccounts) promises.push(this.saveCollection('banks', payload.bankAccounts));
      if (payload.auditLogs) promises.push(this.saveCollection('audit_logs', payload.auditLogs));
      if (payload.studentAccountHistory) promises.push(this.saveCollection('student_account_history', payload.studentAccountHistory));

      if (payload.lockedMonths) promises.push(this.setMeta('locked_months', payload.lockedMonths));
      if (payload.institute) promises.push(this.setMeta('institute', payload.institute));
      if (payload.systemConfig) promises.push(this.setMeta('system_config', payload.systemConfig));

      await Promise.all(promises);
      this.revision += 1;
      this.lastModified = new Date().toISOString();
      return { success: true };
    } catch (err: any) {
      console.error('[DB] Error in syncState:', err);
      return { success: false, error: err?.message || 'Database sync error' };
    }
  }

  /**
   * Seeds the database if empty
   */
  public async seedIfEmpty(seedData: DatabaseState): Promise<boolean> {
    await this.init();
    const existingUsers = await this.getCollection('users');
    if (existingUsers && existingUsers.length > 0) {
      return false; // Already populated
    }

    console.log('[DB] Database is empty. Seeding initial baseline data...');
    await this.syncState(seedData);
    console.log('[DB] Seeding complete.');
    return true;
  }
}

export const dbService = new DatabaseService();
