import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'practice.db')

let db: Database.Database | null = null

/**
 * Adds a column to an existing table when it is absent. CREATE TABLE IF NOT
 * EXISTS only covers fresh databases, so columns added after a database exists
 * in the wild need this.
 */
function addColumnIfMissing(
  conn: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = conn.pragma(`table_info(${table})`) as { name: string }[]
  if (columns.some((existing) => existing.name === column)) return
  conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function migrate(conn: Database.Database) {
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')

  conn.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      include11          INTEGER NOT NULL DEFAULT 0,
      include12          INTEGER NOT NULL DEFAULT 0,
      timeLimitMs        INTEGER NOT NULL DEFAULT 15000,
      showTableDuringRun INTEGER NOT NULL DEFAULT 0,
      updatedAt          TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS facts (
      a                INTEGER NOT NULL,
      b                INTEGER NOT NULL,
      pairKey          TEXT    NOT NULL,
      masteryScore     REAL    NOT NULL,
      masteryStatus    TEXT    NOT NULL,
      totalAttempts    INTEGER NOT NULL DEFAULT 0,
      correctAttempts  INTEGER NOT NULL DEFAULT 0,
      incorrectAttempts INTEGER NOT NULL DEFAULT 0,
      timeouts         INTEGER NOT NULL DEFAULT 0,
      totalResponseMs  INTEGER NOT NULL DEFAULT 0,
      recentResponseMs REAL,
      lastSeen         TEXT,
      lastResult       TEXT,
      recentResults    TEXT    NOT NULL DEFAULT '[]',
      PRIMARY KEY (a, b)
    );

    CREATE INDEX IF NOT EXISTS idx_facts_pair ON facts (pairKey);

    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      mode            TEXT    NOT NULL,
      startedAt       TEXT    NOT NULL,
      completedAt     TEXT,
      timeLimitMs     INTEGER NOT NULL,
      presented       INTEGER NOT NULL DEFAULT 0,
      correct         INTEGER NOT NULL DEFAULT 0,
      incorrect       INTEGER NOT NULL DEFAULT 0,
      timeouts        INTEGER NOT NULL DEFAULT 0,
      totalResponseMs INTEGER NOT NULL DEFAULT 0,
      sourceSessionId INTEGER REFERENCES sessions (id)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId     INTEGER NOT NULL REFERENCES sessions (id),
      a             INTEGER NOT NULL,
      b             INTEGER NOT NULL,
      answerGiven   INTEGER,
      correctAnswer INTEGER NOT NULL,
      result        TEXT    NOT NULL,
      responseMs    INTEGER NOT NULL,
      timeLimitMs   INTEGER NOT NULL,
      createdAt     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts (sessionId);
    CREATE INDEX IF NOT EXISTS idx_attempts_fact ON attempts (a, b, createdAt);
    CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts (createdAt);

    -- Logged so mastery classification changes are queryable without replaying history.
    CREATE TABLE IF NOT EXISTS mastery_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      a            INTEGER NOT NULL,
      b            INTEGER NOT NULL,
      fromStatus   TEXT    NOT NULL,
      toStatus     TEXT    NOT NULL,
      masteryScore REAL    NOT NULL,
      sessionId    INTEGER REFERENCES sessions (id),
      createdAt    TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mastery_events_created ON mastery_events (createdAt);

    CREATE TABLE IF NOT EXISTS timer_events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      fromMs    INTEGER NOT NULL,
      toMs      INTEGER NOT NULL,
      reason    TEXT    NOT NULL,
      sessionId INTEGER REFERENCES sessions (id),
      createdAt TEXT    NOT NULL
    );
  `)

  addColumnIfMissing(conn, 'settings', 'showTableDuringRun', 'INTEGER NOT NULL DEFAULT 0')

  conn
    .prepare(
      `INSERT OR IGNORE INTO settings (id, include11, include12, timeLimitMs, updatedAt)
       VALUES (1, 0, 0, 15000, datetime('now'))`,
    )
    .run()
}

export function getDb(): Database.Database {
  if (db) return db
  fs.mkdirSync(DB_DIR, { recursive: true })
  db = new Database(DB_PATH)
  migrate(db)
  return db
}

export function nowIso(): string {
  return new Date().toISOString()
}
