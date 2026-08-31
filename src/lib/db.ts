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
  if (hasColumn(conn, table, column)) return
  conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function hasColumn(
  conn: Database.Database,
  table: string,
  column: string,
): boolean {
  const columns = conn.pragma(`table_info(${table})`) as { name: string }[]
  return columns.some((existing) => existing.name === column)
}

function tableExists(conn: Database.Database, table: string): boolean {
  const row = conn
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table)
  return row !== undefined
}

function countRows(conn: Database.Database, table: string): number {
  if (!tableExists(conn, table)) return 0
  const row = conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number
  }
  return row.n
}

/*
  Every practice table is owned by a kid, and every kid by a parent. The DDL is
  written as a function of the table name so a fresh install and a rebuild of an
  existing table share one definition — the two drifting apart is exactly how a
  migration ends up producing a subtly different schema from a clean install.
*/

const PRACTICE_TABLES = [
  'settings',
  'facts',
  'sessions',
  'attempts',
  'mastery_events',
  'timer_events',
] as const

type PracticeTable = (typeof PRACTICE_TABLES)[number]

/** Columns copied verbatim when rebuilding, in addition to the new kidId. */
const CARRIED_COLUMNS: Record<PracticeTable, string[]> = {
  settings: [
    'include11',
    'include12',
    'timeLimitMs',
    'showTableDuringRun',
    'updatedAt',
  ],
  facts: [
    'a',
    'b',
    'pairKey',
    'masteryScore',
    'masteryStatus',
    'totalAttempts',
    'correctAttempts',
    'incorrectAttempts',
    'timeouts',
    'totalResponseMs',
    'recentResponseMs',
    'lastSeen',
    'lastResult',
    'recentResults',
  ],
  // Ids are carried so /results/<id> links and sourceSessionId survive.
  sessions: [
    'id',
    'mode',
    'startedAt',
    'completedAt',
    'timeLimitMs',
    'presented',
    'correct',
    'incorrect',
    'timeouts',
    'totalResponseMs',
    'sourceSessionId',
  ],
  attempts: [
    'id',
    'sessionId',
    'a',
    'b',
    'answerGiven',
    'correctAnswer',
    'result',
    'responseMs',
    'timeLimitMs',
    'createdAt',
  ],
  mastery_events: [
    'id',
    'a',
    'b',
    'fromStatus',
    'toStatus',
    'masteryScore',
    'sessionId',
    'createdAt',
  ],
  timer_events: ['id', 'fromMs', 'toMs', 'reason', 'sessionId', 'createdAt'],
}

function practiceTableDdl(table: PracticeTable, name: string = table): string {
  switch (table) {
    case 'settings':
      return `
        CREATE TABLE ${name} (
          kidId              INTEGER PRIMARY KEY REFERENCES kids (id) ON DELETE CASCADE,
          include11          INTEGER NOT NULL DEFAULT 0,
          include12          INTEGER NOT NULL DEFAULT 0,
          timeLimitMs        INTEGER NOT NULL DEFAULT 15000,
          showTableDuringRun INTEGER NOT NULL DEFAULT 0,
          updatedAt          TEXT    NOT NULL
        );`
    case 'facts':
      return `
        CREATE TABLE ${name} (
          kidId            INTEGER NOT NULL REFERENCES kids (id) ON DELETE CASCADE,
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
          PRIMARY KEY (kidId, a, b)
        );`
    case 'sessions':
      return `
        CREATE TABLE ${name} (
          kidId           INTEGER NOT NULL REFERENCES kids (id) ON DELETE CASCADE,
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
        );`
    case 'attempts':
      return `
        CREATE TABLE ${name} (
          kidId         INTEGER NOT NULL REFERENCES kids (id) ON DELETE CASCADE,
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
        );`
    case 'mastery_events':
      return `
        CREATE TABLE ${name} (
          kidId        INTEGER NOT NULL REFERENCES kids (id) ON DELETE CASCADE,
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          a            INTEGER NOT NULL,
          b            INTEGER NOT NULL,
          fromStatus   TEXT    NOT NULL,
          toStatus     TEXT    NOT NULL,
          masteryScore REAL    NOT NULL,
          sessionId    INTEGER REFERENCES sessions (id),
          createdAt    TEXT    NOT NULL
        );`
    case 'timer_events':
      return `
        CREATE TABLE ${name} (
          kidId     INTEGER NOT NULL REFERENCES kids (id) ON DELETE CASCADE,
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          fromMs    INTEGER NOT NULL,
          toMs      INTEGER NOT NULL,
          reason    TEXT    NOT NULL,
          sessionId INTEGER REFERENCES sessions (id),
          createdAt TEXT    NOT NULL
        );`
  }
}

const INDEX_DDL = `
  CREATE INDEX IF NOT EXISTS idx_kids_parent ON kids (parentId);
  CREATE INDEX IF NOT EXISTS idx_auth_failures_scope
    ON auth_failures (scope, createdAt);

  CREATE INDEX IF NOT EXISTS idx_facts_pair ON facts (kidId, pairKey);
  CREATE INDEX IF NOT EXISTS idx_sessions_kid ON sessions (kidId, completedAt);
  CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts (sessionId);
  CREATE INDEX IF NOT EXISTS idx_attempts_fact ON attempts (kidId, a, b, createdAt);
  CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts (kidId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_mastery_events_created
    ON mastery_events (kidId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_timer_events_kid ON timer_events (kidId, id);
`

function createAccountTables(conn: Database.Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS parents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    NOT NULL UNIQUE,
      passwordHash TEXT    NOT NULL,
      createdAt    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kids (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      parentId  INTEGER NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
      name      TEXT    NOT NULL,
      pinHash   TEXT    NOT NULL,
      createdAt TEXT    NOT NULL,
      UNIQUE (parentId, name)
    );

    -- Failed sign-in attempts, for lockout. Pruned on write.
    CREATE TABLE IF NOT EXISTS auth_failures (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      scope     TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `)
}

/**
 * The database predates accounts when its sessions table has no owner. Adopt
 * everything in it into a single household so no history is lost, then reshape
 * every practice table to its owned form.
 *
 * Reshaping rather than ALTER ... ADD COLUMN because facts needs a new primary
 * key — which SQLite cannot alter — and because ADD COLUMN cannot add a NOT
 * NULL foreign key without inventing a bogus default for the existing rows.
 */
function adoptLegacyDatabase(conn: Database.Database) {
  if (!tableExists(conn, 'sessions')) return
  if (hasColumn(conn, 'sessions', 'kidId')) return

  // Normalise a legacy settings row that predates this column, so the copy
  // below can name it unconditionally.
  addColumnIfMissing(conn, 'settings', 'showTableDuringRun', 'INTEGER NOT NULL DEFAULT 0')

  const carriesData = PRACTICE_TABLES.some(
    (table) => table !== 'settings' && countRows(conn, table) > 0,
  )

  // Foreign keys off for the rebuild: dropping a table other tables reference
  // is otherwise rejected. This is SQLite's documented procedure for a schema
  // change, and it cannot be done inside the transaction.
  conn.pragma('foreign_keys = OFF')
  try {
    conn.transaction(() => {
      let kidId: number | null = null
      if (carriesData) {
        const parent = conn
          .prepare(
            `INSERT INTO parents (email, passwordHash, createdAt)
             VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
          )
          .run(LEGACY_PARENT_EMAIL, PASSWORD_RESET_REQUIRED)
        const kid = conn
          .prepare(
            `INSERT INTO kids (parentId, name, pinHash, createdAt)
             VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
          )
          .run(Number(parent.lastInsertRowid), 'Practice', PASSWORD_RESET_REQUIRED)
        kidId = Number(kid.lastInsertRowid)
      }

      for (const table of PRACTICE_TABLES) {
        if (!tableExists(conn, table)) {
          conn.exec(practiceTableDdl(table))
          continue
        }
        const columns = CARRIED_COLUMNS[table].filter((column) =>
          hasColumn(conn, table, column),
        )
        conn.exec(practiceTableDdl(table, `${table}_new`))
        if (kidId !== null) {
          conn.exec(
            `INSERT INTO ${table}_new (kidId, ${columns.join(', ')})
             SELECT ${kidId}, ${columns.join(', ')} FROM ${table}`,
          )
        }
        conn.exec(`DROP TABLE ${table}`)
        conn.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`)
      }
    })()

    const violations = conn.pragma('foreign_key_check') as unknown[]
    if (violations.length > 0) {
      throw new Error(
        `Account migration left ${violations.length} foreign key violation(s); database not modified`,
      )
    }
  } finally {
    conn.pragma('foreign_keys = ON')
  }
}

/**
 * Stored where a hash is required but no usable credential exists. No input can
 * ever verify against it, so an adopted account cannot be signed into until its
 * credential is set.
 */
export const PASSWORD_RESET_REQUIRED = '!'

export const LEGACY_PARENT_EMAIL = 'adopted@localhost'

function migrate(conn: Database.Database) {
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')

  createAccountTables(conn)
  adoptLegacyDatabase(conn)

  for (const table of PRACTICE_TABLES) {
    if (tableExists(conn, table)) continue
    conn.exec(practiceTableDdl(table))
  }

  conn.exec(INDEX_DDL)
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

/**
 * SQL for "now, shifted by a bound modifier", in the same format nowIso() writes.
 *
 * Timestamps are stored as ISO 8601 ('2026-08-31T16:33:50.859Z') but SQLite's
 * datetime('now') yields '2026-08-31 16:33:50'. Compared as strings those agree
 * on the date and then diverge: 'T' (0x54) sorts above ' ' (0x20), so every row
 * from the threshold's own calendar day compares as greater regardless of its
 * time. A window built with datetime() therefore always reaches back to the
 * start of its first day. strftime with this format is directly comparable.
 */
export const SQL_NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
