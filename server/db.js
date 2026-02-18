import fs from "node:fs";
import path from "node:path";

function parseJsonState(rawState) {
  if (!rawState) {
    return null;
  }

  try {
    return JSON.parse(rawState);
  } catch {
    return null;
  }
}

function stringifyJsonState(state) {
  return JSON.stringify(state);
}

function ensureDirectoryForFile(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

async function createSqliteStore(sqlitePath) {
  const { DatabaseSync } = await import("node:sqlite");

  ensureDirectoryForFile(sqlitePath);

  const db = new DatabaseSync(sqlitePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS planner_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const selectState = db.prepare("SELECT state_json FROM planner_state WHERE id = 1 LIMIT 1");
  const upsertState = db.prepare(`
    INSERT INTO planner_state (id, state_json, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id)
    DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP;
  `);

  return {
    engine: "sqlite",
    async getState() {
      const row = selectState.get();
      return parseJsonState(row?.state_json || "");
    },
    async setState(state) {
      upsertState.run(stringifyJsonState(state));
    },
    async close() {
      db.close();
    },
  };
}

async function createPostgresStore(databaseUrl) {
  const imported = await import("pg");
  const Pool = imported?.Pool;

  if (!Pool) {
    throw new Error("The \"pg\" package is required for Postgres support.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planner_state (
      id INTEGER PRIMARY KEY,
      state_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return {
    engine: "postgres",
    async getState() {
      const result = await pool.query(
        "SELECT state_json FROM planner_state WHERE id = 1 LIMIT 1",
      );
      return result.rows[0]?.state_json || null;
    },
    async setState(state) {
      await pool.query(
        `
          INSERT INTO planner_state (id, state_json, updated_at)
          VALUES (1, $1::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = NOW();
        `,
        [stringifyJsonState(state)],
      );
    },
    async close() {
      await pool.end();
    },
  };
}

export async function createStateStore(options = {}) {
  const databaseUrl = String(options.databaseUrl || process.env.DATABASE_URL || "").trim();
  const sqlitePath = String(
    options.sqlitePath || process.env.SQLITE_PATH || path.resolve(process.cwd(), "data", "meal-planner.db"),
  );

  if (databaseUrl) {
    if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
      throw new Error("DATABASE_URL must use a postgres:// or postgresql:// URL.");
    }
    return createPostgresStore(databaseUrl);
  }

  return createSqliteStore(sqlitePath);
}
