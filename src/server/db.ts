import fs from "fs";
import path from "path";
import pg from "pg";
import { getServerConfig } from "./config";

// Register BIGINT parser once globally (BIGINT = type OID 20) -> number
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

const globalForDb = globalThis as unknown as {
  _dbPool?: pg.Pool | null;
};

export function getPool(): pg.Pool {
  if (!globalForDb._dbPool) {
    const config = getServerConfig();
    globalForDb._dbPool = new pg.Pool({
      connectionString: config.postgresUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return globalForDb._dbPool;
}

export async function initDbPool(): Promise<pg.Pool> {
  return getPool();
}

export async function closeDbPool(): Promise<void> {
  if (globalForDb._dbPool) {
    await globalForDb._dbPool.end();
    globalForDb._dbPool = null;
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function queryRow<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const pool = getPool();
  const res = await pool.query(sql, params);
  if (res.rows.length === 0) return null;
  return res.rows[0] as T;
}

export async function queryVal<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const pool = getPool();
  const res = await pool.query(sql, params);
  if (res.rows.length === 0) return null;
  const firstRow = res.rows[0];
  const keys = Object.keys(firstRow);
  if (keys.length === 0) return null;
  return firstRow[keys[0]] as T;
}

export async function execute(sql: string, params: any[] = []): Promise<string> {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res.command;
}

export async function ensureSchema(): Promise<void> {
  const migrationPath = path.resolve(process.cwd(), "migrations/001_initial_schema.sql");
  if (fs.existsSync(migrationPath)) {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    await execute(sql);
  }
}
