import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { authErrorResponse, requireTenant } from "../../../server/auth/session";
import { schema, withTenantTransaction } from "../../../server/db";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant(request.headers, "workspace:list");
    const rows = await withTenantTransaction(tenant, (tx) => tenant.role === "owner" || tenant.role === "admin"
      ? tx.select({ id: schema.workspace.id, name: schema.workspace.name, createdAt: schema.workspace.createdAt }).from(schema.workspace).where(eq(schema.workspace.organizationId, tenant.organizationId))
      : tx.select({ id: schema.workspace.id, name: schema.workspace.name, createdAt: schema.workspace.createdAt }).from(schema.workspaceMembership)
        .innerJoin(schema.workspace, eq(schema.workspaceMembership.workspaceId, schema.workspace.id))
        .where(and(eq(schema.workspaceMembership.userId, tenant.userId), eq(schema.workspace.organizationId, tenant.organizationId))));
    return Response.json({ workspaces: rows });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant(request.headers, "workspace:manage");
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Malformed JSON request." }, { status: 400 }); }
    if (!body || typeof body !== "object" || typeof (body as { name?: unknown }).name !== "string") return Response.json({ error: "A workspace name is required." }, { status: 400 });
    const name = (body as { name: string }).name.trim();
    if (!name || name.length > 120) return Response.json({ error: "Workspace name must be between 1 and 120 characters." }, { status: 400 });

    const workspaceId = randomUUID();
    const created = await withTenantTransaction(tenant, async (tx) => {
      const [workspace] = await tx.insert(schema.workspace).values({ id: workspaceId, organizationId: tenant.organizationId, name }).returning();
      await tx.insert(schema.workspaceMembership).values({ id: randomUUID(), workspaceId, organizationId: tenant.organizationId, userId: tenant.userId });
      return workspace;
    });
    return Response.json({ workspace: created }, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
