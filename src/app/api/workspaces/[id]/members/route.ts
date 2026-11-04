import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { authErrorResponse, requireTenant } from "../../../../../server/auth/session";
import { getDatabase, schema, withTenantTransaction } from "../../../../../server/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params;
    const tenant = await requireTenant(request.headers, "workspace:manage", workspaceId);
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Malformed JSON request." }, { status: 400 }); }
    if (!body || typeof body !== "object" || typeof (body as { userId?: unknown }).userId !== "string") return Response.json({ error: "A target userId is required." }, { status: 400 });
    const userId = (body as { userId: string }).userId;
    const [organizationMembership] = await getDatabase().select({ userId: schema.member.userId }).from(schema.member)
      .where(and(eq(schema.member.organizationId, tenant.organizationId), eq(schema.member.userId, userId))).limit(1);
    if (!organizationMembership) return Response.json({ error: "The target user is not a member of this organization." }, { status: 404 });

    const [membership] = await withTenantTransaction(tenant, (tx) => tx.insert(schema.workspaceMembership)
      .values({ id: randomUUID(), workspaceId, organizationId: tenant.organizationId, userId }).onConflictDoNothing().returning());
    return Response.json({ membership: membership ?? { workspaceId, userId } }, { status: membership ? 201 : 200 });
  } catch (error) { return authErrorResponse(error); }
}
