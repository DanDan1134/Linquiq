/**
 * SQLite schema definition.
 *
 * Schema version is stored via PRAGMA user_version.
 * Bump SCHEMA_VERSION and add migration SQL to MIGRATIONS when you change table structure.
 */

export const SCHEMA_VERSION = 3;

/** SQL to create all tables (idempotent — uses IF NOT EXISTS) */
export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS files (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT 'Untitled',
    type          TEXT NOT NULL DEFAULT '',
    content_type  TEXT,
    created_at    TEXT,
    creator       TEXT,
    url           TEXT,
    content       TEXT,
    local_uri     TEXT,
    bundle_ids    TEXT DEFAULT '[]',
    dirty            INTEGER NOT NULL DEFAULT 0,
    deleted          INTEGER NOT NULL DEFAULT 0,
    synced_at        INTEGER
  );

  CREATE TABLE IF NOT EXISTS bundles (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT 'linq',
    type          TEXT NOT NULL DEFAULT 'Link',
    content_type  TEXT,
    created_at    TEXT,
    creator       TEXT,
    url           TEXT,
    content       TEXT,
    child_ids     TEXT DEFAULT '[]',
    dirty         INTEGER NOT NULL DEFAULT 0,
    deleted       INTEGER NOT NULL DEFAULT 0,
    synced_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS outbox (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    op            TEXT NOT NULL,
    payload       TEXT NOT NULL DEFAULT '{}',
    retries       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
`;

/**
 * Indexes for the queries that run on every list load and every sync.
 *
 * Without these, `WHERE deleted = 0 ORDER BY created_at DESC` scans and sorts
 * the whole table on each read, which is what a slower phone feels most.
 * Kept separate from CREATE_TABLES_SQL so existing installs get them too.
 */
export const CREATE_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_files_list
    ON files (deleted, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_files_client_id
    ON files (client_id);
  CREATE INDEX IF NOT EXISTS idx_files_download_status
    ON files (download_status, deleted);
  CREATE INDEX IF NOT EXISTS idx_bundles_list
    ON bundles (deleted, created_at DESC);
`;

/**
 * Migrations keyed by the version they bring the DB TO.
 * e.g. version 2 migration runs when user_version is currently 1.
 *
 * Add new entries here when the schema changes.
 */
export const MIGRATIONS: Record<number, string> = {
  2: `ALTER TABLE files ADD COLUMN client_id TEXT;`,
  3: `ALTER TABLE files ADD COLUMN download_status TEXT NOT NULL DEFAULT 'pending';`,
};

// ── TypeScript row types ────────────────────────────────────────────────────

export type FileRow = {
  id: string;
  name: string;
  type: string;
  content_type: string | null;
  created_at: string | null;
  creator: string | null;
  url: string | null;
  content: string | null;
  local_uri: string | null;
  /** Original client id (opt-…) kept after sync so outbox can resolve create_bundle children */
  client_id: string | null;
  bundle_ids: string; // JSON string
  dirty: number;            // 0 | 1
  deleted: number;          // 0 | 1
  synced_at: number | null;
  /** 'pending' | 'downloaded' | 'failed' | 'skipped' */
  download_status: string;
};

export type BundleRow = {
  id: string;
  name: string;
  type: string;
  content_type: string | null;
  created_at: string | null;
  creator: string | null;
  url: string | null;
  content: string | null;
  child_ids: string; // JSON string
  dirty: number;
  deleted: number;
  synced_at: number | null;
};

export type OutboxRow = {
  id: number;
  op: 'upload_file' | 'upload_blob' | 'delete' | 'create_bundle' | 'add_to_bundle' | 'rename_bundle';
  payload: string; // JSON string
  retries: number;
  created_at: number;
};
