/**
 * GET /api/dashboard
 * Returns the period metrics, KPI totals, and product comparisons for the active workspace.
 * Newly created workspaces return an empty snapshot with ₹0 / 0 products / 0 orders.
 */

import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, resolveRequestTenant } from "../../../server/auth/session";
import { loadWorkspaceSnapshot } from "../../../engine/workspace-manager";
import { getPersistedWorkspaceSnapshot } from "../../../server/db/persistence";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.headers.get("x-proofloop-workspace-id") || undefined;
    const tenant = await resolveRequestTenant(request.headers, "analysis:read", workspaceId);

    const targetWorkspace = tenant?.workspaceId || workspaceId;
    const snapshot = (tenant && process.env.DATABASE_URL)
      ? await getPersistedWorkspaceSnapshot(tenant)
      : await loadWorkspaceSnapshot(targetWorkspace, tenant ?? undefined);

    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve dashboard snapshot.",
        details: [message],
      },
      { status: 500 }
    );
  }
}
