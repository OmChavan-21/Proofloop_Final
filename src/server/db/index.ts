import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

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

export async function closeDatabasePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
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
