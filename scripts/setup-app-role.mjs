/**
 * Configures the restricted proofloop_app role in Neon PostgreSQL for RLS verification.
 * Grants required schema USAGE, connect privilege, and table access.
 * Writes TEST_DATABASE_URL and MIGRATION_DATABASE_URL to .env.local without exposing secrets in stdout.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;
const adminUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!adminUrl) {
  process.stderr.write("Error: DATABASE_URL or DATABASE_URL_UNPOOLED must be set in .env.local\n");
  process.exit(1);
}

const isNeon = adminUrl.includes("neon.tech") || adminUrl.includes("sslmode=require");
const pool = new Pool({
  connectionString: adminUrl,
  max: 1,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined
});

try {
  // Generate a cryptographically random password for proofloop_app
  const appPassword = crypto.randomBytes(24).toString("base64url");

  // Configure proofloop_app role
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'proofloop_app') THEN
        CREATE ROLE proofloop_app WITH LOGIN PASSWORD '${appPassword}';
      ELSE
        ALTER ROLE proofloop_app WITH LOGIN PASSWORD '${appPassword}';
      END IF;
    END $$;
  `);

  // Grant privileges
  await pool.query(`
    GRANT CONNECT ON DATABASE neondb TO proofloop_app;
    GRANT USAGE ON SCHEMA auth, app TO proofloop_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO proofloop_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO proofloop_app;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth, app TO proofloop_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO proofloop_app;
  `);

  process.stdout.write("Configured role 'proofloop_app' with restricted privileges.\n");

  // Construct TEST_DATABASE_URL by replacing credentials in adminUrl
  const parsed = new URL(adminUrl);
  parsed.username = "proofloop_app";
  parsed.password = appPassword;
  const testDbUrl = parsed.toString();

  // MIGRATION_DATABASE_URL uses the unpooled admin connection
  const migrationDbUrl = adminUrl;

  // Update or append in .env.local
  let envContent = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";

  // Replace or append MIGRATION_DATABASE_URL
  if (/^MIGRATION_DATABASE_URL=/m.test(envContent)) {
    envContent = envContent.replace(/^MIGRATION_DATABASE_URL=.*$/m, `MIGRATION_DATABASE_URL="${migrationDbUrl}"`);
  } else {
    envContent += `\nMIGRATION_DATABASE_URL="${migrationDbUrl}"`;
  }

  // Replace or append TEST_DATABASE_URL
  if (/^TEST_DATABASE_URL=/m.test(envContent)) {
    envContent = envContent.replace(/^TEST_DATABASE_URL=.*$/m, `TEST_DATABASE_URL="${testDbUrl}"`);
  } else {
    envContent += `\nTEST_DATABASE_URL="${testDbUrl}"`;
  }

  fs.writeFileSync(".env.local", envContent.trim() + "\n", "utf8");
  process.stdout.write("Updated .env.local with MIGRATION_DATABASE_URL and TEST_DATABASE_URL.\n");
} catch (error) {
  process.stderr.write(`Role setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
} finally {
  await pool.end();
}
