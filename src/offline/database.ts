import * as SQLite from 'expo-sqlite';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('fieldops.db');
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
    CREATE TABLE IF NOT EXISTS local_cache (cache_key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS verified_equipment (inspection_id TEXT PRIMARY KEY NOT NULL, equipment_id TEXT NOT NULL, verified_at TEXT NOT NULL);
  `);
  return database;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
}
