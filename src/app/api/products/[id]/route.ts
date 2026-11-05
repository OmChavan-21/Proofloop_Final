/**
 * GET /api/products/[id]
 * Retrieves product details scoped to the active workspace.
 */

import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, resolveRequestTenant } from "../../../../server/auth/session";
import { loadWorkspaceSnapshot } from "../../../../engine/workspace-manager";
import { getPersistedWorkspaceProductDetail } from "../../../../server/db/persistence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workspaceId = request.headers.get("x-proofloop-workspace-id") || undefined;
    const tenant = await resolveRequestTenant(request.headers, "analysis:read", workspaceId);

    const targetWorkspace = tenant?.workspaceId || workspaceId;
    const product = (tenant && process.env.DATABASE_URL)
      ? await getPersistedWorkspaceProductDetail(tenant, id)
      : (await loadWorkspaceSnapshot(targetWorkspace, tenant ?? undefined)).products.find((p) => p.productId === id);

    if (!product) {
      return NextResponse.json(
        { error: `Product with ID '${id}' was not found in this workspace.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ product, workspaceId: targetWorkspace || null });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve product details.",
        details: [message],
      },
      { status: 500 }
    );
  }
}
