/**
 * Verification script for Neon PostgreSQL connectivity and schema state.
 * Tests connection, SSL handshake, current user, database, and verifies
 * applied migrations and RLS enablement.
 *
 * Explicitly reports any query failures without suppressing errors.
 */

import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL;

if (!connectionString) {
  process.stderr.write("Verification skipped: Neither DATABASE_URL nor MIGRATION_DATABASE_URL is configured.\n");
  process.exit(0);
}

const isNeon = connectionString.includes("neon.tech") || connectionString.includes("sslmode=require");
const pool = new Pool({
  connectionString,
  max: 1,
  ssl: isNeon ? { rejectUnauthorized: false } : undefined
});

try {
  const { rows: [info] } = await pool.query(`
    SELECT
      current_database() AS database,
      current_user AS user,
      version() AS version,
      inet_server_addr() AS server_addr
  `);
  process.stdout.write(`Connected to PostgreSQL: database="${info.database}", user="${info.user}"\n`);
  process.stdout.write(`Version: ${info.version.split("\n")[0]}\n`);

  // Check applied migrations with explicit error reporting
  try {
    const { rows: migrations } = await pool.query(`
      SELECT name, applied_at
      FROM auth.proofloop_migrations
      ORDER BY name ASC
    `);
    process.stdout.write(`Applied migrations (${migrations.length}):\n`);
    for (const m of migrations) {
      process.stdout.write(`  - ${m.name} (${new Date(m.applied_at).toISOString()})\n`);
    }
  } catch (err) {
    process.stderr.write(`Error checking migrations from auth.proofloop_migrations: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Check RLS status using pg_class and pg_namespace
  try {
    const { rows: rlsTables } = await pool.query(`
      SELECT
        n.nspname AS schemaname,
        c.relname AS tablename,
        c.relrowsecurity AS rowsecurity,
        c.relforcerowsecurity AS forcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('auth', 'app')
        AND c.relkind IN ('r', 'p')
      ORDER BY n.nspname, c.relname
    `);

    process.stdout.write(`Table RLS status (${rlsTables.length} tables):\n`);
    for (const t of rlsTables) {
      process.stdout.write(`  - ${t.schemaname}.${t.tablename}: RLS=${t.rowsecurity}, FORCE_RLS=${t.forcerowsecurity}\n`);
    }

    // Verify expected app tables have RLS enabled and forced
    const expectedAppTables = [
      "analysis",
      "analysis_approval",
      "approval_decision",
      "audit_event",
      "workspace",
      "workspace_membership",
      "workspace_product",
      "workspace_sale",
      "workspace_sale_item"
    ];

    const missingAppTables = expectedAppTables.filter(
      (name) => !rlsTables.some((t) => t.schemaname === "app" && t.tablename === name)
    );
    if (missingAppTables.length > 0) {
      process.stderr.write(`WARNING: Missing expected app tables: ${missingAppTables.join(", ")}\n`);
    }

    const unsecureAppTables = rlsTables.filter(
      (t) => t.schemaname === "app" && (!t.rowsecurity || !t.forcerowsecurity)
    );
    if (unsecureAppTables.length > 0) {
      process.stderr.write(`WARNING: Tables in app schema without RLS or FORCE_RLS: ${unsecureAppTables.map((t) => t.tablename).join(", ")}\n`);
    } else {
      process.stdout.write("All app schema tables have RLS enabled and FORCE ROW LEVEL SECURITY enabled.\n");
    }
  } catch (err) {
    process.stderr.write(`Error checking table RLS status: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Inspect current role privileges
  try {
    const { rows: [roleInfo] } = await pool.query(`
      SELECT
        rolname,
        rolsuper,
        rolinherit,
        rolcreaterole,
        rolcreatedb,
        rolcanlogin,
        rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `);
    process.stdout.write(`Current connection role (${roleInfo.rolname}):\n`);
    process.stdout.write(`  - Superuser: ${roleInfo.rolsuper}\n`);
    process.stdout.write(`  - BypassRLS: ${roleInfo.rolbypassrls}\n`);
    process.stdout.write(`  - CanLogin: ${roleInfo.rolcanlogin}\n`);
  } catch (err) {
    process.stderr.write(`Error checking current role attributes: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Inspect application role (proofloop_app)
  try {
    const { rows: appRoles } = await pool.query(`
      SELECT
        rolname,
        rolsuper,
        rolbypassrls,
        rolcanlogin,
        has_database_privilege(rolname, current_database(), 'CONNECT') AS can_connect,
        has_schema_privilege(rolname, 'auth', 'USAGE') AS auth_usage,
        has_schema_privilege(rolname, 'app', 'USAGE') AS app_usage,
        has_schema_privilege(rolname, 'app', 'CREATE') AS can_create_app_objects
      FROM pg_roles
      WHERE rolname = 'proofloop_app'
    `);
    if (appRoles.length === 0) {
      process.stderr.write("WARNING: Role 'proofloop_app' does not exist in pg_roles.\n");
    } else {
      const appRole = appRoles[0];
      process.stdout.write(`Application role (${appRole.rolname}):\n`);
      process.stdout.write(`  - Superuser: ${appRole.rolsuper}\n`);
      process.stdout.write(`  - BypassRLS: ${appRole.rolbypassrls}\n`);
      process.stdout.write(`  - CanLogin: ${appRole.rolcanlogin}\n`);
      process.stdout.write(`  - Connect to DB: ${appRole.can_connect}\n`);
      process.stdout.write(`  - Schema usage (auth): ${appRole.auth_usage}\n`);
      process.stdout.write(`  - Schema usage (app): ${appRole.app_usage}\n`);
      process.stdout.write(`  - Can create app objects: ${appRole.can_create_app_objects}\n`);
    }
  } catch (err) {
    process.stderr.write(`Error checking proofloop_app attributes: ${err instanceof Error ? err.message : String(err)}\n`);
  }
} catch (error) {
  process.stderr.write(`Database verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
} finally {
  await pool.end();
}
