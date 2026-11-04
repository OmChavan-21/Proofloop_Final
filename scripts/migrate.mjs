import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL must be configured.");

const isNeon = connectionString.includes("neon.tech") || connectionString.includes("sslmode=require");
const pool = new Pool({
  connectionString,
  max: 1,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined
});

try {
  // Ensure schema auth and app exist before creating migration table or applying migrations
  await pool.query("CREATE SCHEMA IF NOT EXISTS auth;");
  await pool.query("CREATE SCHEMA IF NOT EXISTS app;");

  // Ensure runtime role proofloop_app exists if referenced by migration GRANT/REVOKE statements
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'proofloop_app') THEN
        CREATE ROLE proofloop_app NOLOGIN;
      END IF;
    END $$;
  `);

  await pool.query("CREATE TABLE IF NOT EXISTS auth.proofloop_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir("./drizzle")).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query("SELECT 1 FROM auth.proofloop_migrations WHERE name = $1", [name]);
      if (prior.rowCount) { await client.query("ROLLBACK"); continue; }
      await client.query(await readFile(join("./drizzle", name), "utf8"));
      await client.query("INSERT INTO auth.proofloop_migrations(name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
} finally { await pool.end(); }
