import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;
let runtimeRoleCheck: Promise<void> | undefined;

export type RuntimeRoleState = {
  rolsuper: boolean;
  rolbypassrls: boolean;
  app_schema_create: boolean;
  owns_application_objects: boolean;
};

export function isSafeRuntimeRole(role: RuntimeRoleState | undefined): boolean {
  if (!role) return false;
  return !role.rolsuper
    && !role.rolbypassrls
    && !role.app_schema_create
    && !role.owns_application_objects;
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL-backed authentication.");
  const isNeon = connectionString.includes("neon.tech") || connectionString.includes("sslmode=require");
  pool ??= new Pool({
    connectionString,
    max: 10,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

export function getDatabase() {
  database ??= drizzle(getPool(), { schema });
  return database;
}

/** Refuse application traffic when DATABASE_URL can bypass tenant RLS or own schema objects. */
export function assertRuntimeDatabaseRole(): Promise<void> {
  runtimeRoleCheck ??= (async () => {
    const result = await getPool().query(`
      SELECT r.rolsuper, r.rolbypassrls,
        has_schema_privilege(current_user, 'app', 'CREATE') AS app_schema_create,
        EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('app', 'auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'S') AND c.relowner = r.oid
        ) AS owns_application_objects
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const role = result.rows[0];
    if (!isSafeRuntimeRole(role)) {
      throw new Error("DATABASE_URL must use a non-owner runtime role with NOBYPASSRLS and no schema CREATE privileges.");
    }
  })().catch((error) => {
    runtimeRoleCheck = undefined;
    throw error;
  });
  return runtimeRoleCheck;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
  runtimeRoleCheck = undefined;
}

export async function withTenantTransaction<T>(
  tenant: { userId: string; organizationId: string; workspaceId?: string },
  callback: (tx: NodePgDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true), set_config('app.workspace_id', $3, true)", [tenant.userId, tenant.organizationId, tenant.workspaceId ?? ""]);
    const result = await callback(drizzle(client, { schema }));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export { schema };
