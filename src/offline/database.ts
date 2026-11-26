import * as SQLite from 'expo-sqlite';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Migrações versionadas por `PRAGMA user_version`: rodam uma vez e retomam após reinício. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
   CREATE TABLE IF NOT EXISTS local_cache (cache_key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS verified_equipment (inspection_id TEXT PRIMARY KEY NOT NULL, equipment_id TEXT NOT NULL, verified_at TEXT NOT NULL);`,
  `ALTER TABLE sync_queue ADD COLUMN user_id TEXT;
   ALTER TABLE sync_queue ADD COLUMN state TEXT NOT NULL DEFAULT 'pending';
   ALTER TABLE sync_queue ADD COLUMN last_code TEXT;
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
];

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('fieldops.db');
  await database.execAsync('PRAGMA journal_mode = WAL;');
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  // Bancos criados pela versão anterior (sem user_version) já têm as tabelas da migração 1.
  if (version === 0) {
    const legacy = await database.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'");
    if (legacy) {
      await database.execAsync(MIGRATIONS[0]);
      version = 1;
      await database.execAsync('PRAGMA user_version = 1');
    }
  }
  for (let next = version; next < MIGRATIONS.length; next += 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(MIGRATIONS[next]);
      await database.execAsync(`PRAGMA user_version = ${next + 1}`);
    });
  }
  return database;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
}

export const meta = {
  async get(key: string): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  },
};
