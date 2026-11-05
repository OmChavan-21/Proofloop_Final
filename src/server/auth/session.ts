import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "./config";
import { hasCapability, type Capability, type OrganizationRole } from "./permissions";
import { assertRuntimeDatabaseRole, getDatabase, schema, withTenantTransaction } from "../db";

export type AuthenticatedTenant = {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  workspaceId?: string;
};

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403 | 404 | 409 | 503, message: string) { super(message); }
}

function parseCookie(cookieHeader: string | null, key: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function requireTenant(headers: Headers, capability: Capability, workspaceId?: string): Promise<AuthenticatedTenant> {
  if (process.env.DATABASE_URL) {
    try {
      await assertRuntimeDatabaseRole();
    } catch {
      throw new AuthError(503, "The application database role is not safe for authenticated workspace access.");
    }
  }

  let auth: ReturnType<typeof getAuth>;
  try { auth = getAuth(); } catch (error) {
    throw new AuthError(503, error instanceof Error ? error.message : "Authentication is not configured.");
  }

  let current;
  try { current = await auth.api.getSession({ headers }); } catch {
    throw new AuthError(503, "Authentication service is unavailable.");
  }
  if (!current) throw new AuthError(401, "A valid server session is required.");
  if (!current.user.emailVerified) throw new AuthError(403, "Email verification is required.");
  const organizationId = (current.session as typeof current.session & { activeOrganizationId?: string | null }).activeOrganizationId;
  if (!organizationId) throw new AuthError(403, "Select an organization before accessing workspace data.");

  const db = getDatabase();
  const [membership] = await db.select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, current.user.id)))
    .limit(1);
  if (!membership || !hasCapability(membership.role, capability)) throw new AuthError(403, "This organization role does not grant the requested capability.");

  const tenantContext = { userId: current.user.id, organizationId };
  let resolvedWorkspaceId = workspaceId
    || headers.get("x-proofloop-workspace-id")
    || parseCookie(headers.get("cookie"), "proofloop_workspace_id")
    || parseCookie(headers.get("cookie"), "proofloop-workspace-id")
    || undefined;

  if (resolvedWorkspaceId) {
    const selectedWorkspaceId = resolvedWorkspaceId;
    const workspaceAccess = await withTenantTransaction(tenantContext, async (tx) => {
      const [workspace] = await tx.select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(and(eq(schema.workspace.id, selectedWorkspaceId), eq(schema.workspace.organizationId, organizationId)))
        .limit(1);
      if (!workspace) return { exists: false, assigned: false };
      const [workspaceMembership] = await tx.select({ id: schema.workspaceMembership.id })
        .from(schema.workspaceMembership)
        .where(and(eq(schema.workspaceMembership.userId, current.user.id), eq(schema.workspaceMembership.workspaceId, selectedWorkspaceId)))
        .limit(1);
      return { exists: true, assigned: Boolean(workspaceMembership) };
    });
    if (!workspaceAccess.exists) throw new AuthError(403, "Workspace is outside the authenticated organization.");
    if (!workspaceAccess.assigned && membership.role !== "owner" && membership.role !== "admin") throw new AuthError(403, "Workspace is not assigned to this user.");
  } else if (capability !== "workspace:manage" && capability !== "workspace:list") {
    const memberships = await withTenantTransaction(tenantContext, (tx) => tx.select({ id: schema.workspace.id })
      .from(schema.workspaceMembership)
      .innerJoin(schema.workspace, eq(schema.workspaceMembership.workspaceId, schema.workspace.id))
      .where(and(eq(schema.workspaceMembership.userId, current.user.id), eq(schema.workspace.organizationId, organizationId)))
      .orderBy(desc(schema.workspaceMembership.createdAt))
      .limit(2));
    if (memberships.length >= 1) {
      resolvedWorkspaceId = memberships[0].id;
    } else {
      throw new AuthError(404, "No workspaces found in this organization. Create a workspace first.");
    }
  }

  return { userId: current.user.id, organizationId, role: membership.role as OrganizationRole, ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}) };
}

/**
 * Explicit unprotected seeded-data mode for unit tests and opt-in local demos only.
 * Production and staging environments MUST NEVER silently fall back to in-memory storage.
 */
export async function resolveRequestTenant(headers: Headers, capability: Capability, workspaceId?: string) {
  // When DATABASE_URL is configured, always require authenticated tenant to ensure durable storage
  if (process.env.DATABASE_URL) {
    return requireTenant(headers, capability, workspaceId);
  }
  // Production and staging environments MUST NEVER silently fall back to in-memory storage
  const isSharedEnvironment = process.env.NODE_ENV === "production" || (process.env.NODE_ENV as string) === "staging";
  if (isSharedEnvironment) {
    return requireTenant(headers, capability, workspaceId);
  }
  // Non-production / test / opt-in demo mode:
  // If a workspace ID is explicitly provided, return an isolated tenant scoped to that workspace
  const targetWorkspace = workspaceId
    || headers.get("x-proofloop-workspace-id")
    || parseCookie(headers.get("cookie"), "proofloop_workspace_id")
    || parseCookie(headers.get("cookie"), "proofloop-workspace-id")
    || undefined;
  if (targetWorkspace) {
    const role = (headers.get("x-proofloop-role") as OrganizationRole) || "owner";
    if (!hasCapability(role, capability)) {
      throw new AuthError(403, "This organization role does not grant the requested capability.");
    }
    return {
      userId: headers.get("x-proofloop-user-id") || "tenant-user",
      organizationId: headers.get("x-proofloop-organization-id") || "demo-org",
      role,
      workspaceId: targetWorkspace,
    };
  }

  // Unit test suites test API contract handling and validation with mock demo context
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  // Local development: only fall back if explicitly opted into demo mode
  if (process.env.PROOFLOOP_DEMO_MODE === "true") {
    return null;
  }
  // Otherwise, fail closed and require tenant
  return requireTenant(headers, capability, workspaceId);
}

export function authErrorResponse(error: unknown) {
  const authError = error instanceof AuthError ? error : new AuthError(503, "Authentication or authorization failed.");
  return Response.json({ error: authError.message }, { status: authError.status });
}
