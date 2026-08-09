/**
 * SQLite database singleton.
 *
 * Call initDb() once at app boot (before any repo functions).
 * All repo modules import `getDb()` to access the open database.
 */

import * as SQLite from 'expo-sqlite';
import {
  CREATE_INDEXES_SQL,
  CREATE_TABLES_SQL,
  MIGRATIONS,
  SCHEMA_VERSION,
} from './schema';
import { track } from '../utils/perfLog';

let _db: SQLite.SQLiteDatabase | null = null;

/** Open (or return) the singleton DB instance. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('DB not initialized — call initDb() first');
  return _db;
}

/**
 * Initialize the database:
 *  1. Open the file
 *  2. Enable WAL mode for better concurrent read perf
 *  3. Run CREATE TABLE IF NOT EXISTS for all tables
 *  4. Apply any pending migrations
 *  5. Create the list/lookup indexes
 */
export async function initDb(): Promise<void> {
  if (_db) return; // already initialized

  const t = track('OPEN DATABASE');
  _db = await SQLite.openDatabaseAsync('linquiq.db');

  // WAL mode: readers don't block writers
  await _db.execAsync('PRAGMA journal_mode = WAL;');

  // Create tables
  await _db.execAsync(CREATE_TABLES_SQL);

  // Run migrations
  await runMigrations(_db);

  // Indexes come after migrations so they can reference migrated columns.
  await _db.execAsync(CREATE_INDEXES_SQL);
  t.done('tables + indexes ready');
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  let currentVersion = result?.user_version ?? 0;

  const pendingVersions = Object.keys(MIGRATIONS)
    .map(Number)
    .filter((v) => v > currentVersion)
    .sort((a, b) => a - b);

  for (const version of pendingVersions) {
    const sql = MIGRATIONS[version];
    // Migration 3 adds download_status; fresh DBs that already had it in CREATE (older builds)
    // hit "duplicate column" — skip ALTER if the column exists.
    if (version === 3) {
      const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(files)');
      const hasDownloadStatus = cols.some((c) => c.name === 'download_status');
      if (!hasDownloadStatus) {
        await db.execAsync(sql);
      }
    } else {
      await db.execAsync(sql);
    }
    await db.execAsync(`PRAGMA user_version = ${version}`);
    currentVersion = version;
  }

  // Stamp with schema version if we haven't yet
  if (currentVersion < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/** Close and nullify (useful in tests / dev reloads) */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}
