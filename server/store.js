import path from "node:path";

import { createStateStore } from "./db.js";

export async function createStoreFromEnv() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (process.env.VERCEL && !databaseUrl) {
    throw new Error("DATABASE_URL is required on Vercel. Configure a Postgres database first.");
  }

  const sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.resolve(process.cwd(), "data", "meal-planner.db");

  return createStateStore({
    databaseUrl,
    sqlitePath,
  });
}
