
import initSqlJs, { type Database } from "sql.js";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema";
import { SEED_SQL } from "./seed";

export async function createDemoDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      file.endsWith(".wasm")
        ? join(process.cwd(), "node_modules", "sql.js", "dist", file)
        : file
  });
  const db = new SQL.Database();

  try {
    // Initialize the schema and demo data first.
    db.run(SCHEMA_SQL);
    db.run(SEED_SQL);

    // Enforce read-only mode for all subsequent operations.
    db.run("PRAGMA query_only = ON");

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
