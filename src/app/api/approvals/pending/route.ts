/**
 * GET /api/approvals/pending
 * Returns pending analyses requiring human approval.
 */

import { NextResponse, type NextRequest } from "next/server";
import { listPendingApprovals } from "../../../../server/storage";
import { authErrorResponse, resolveRequestTenant } from "../../../../server/auth/session";
import { withTenantContext } from "../../../../server/auth/tenant-context";
import { listPersistedPendingApprovals } from "../../../../server/db/persistence";

export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveRequestTenant(request.headers, "approval:decide", request.headers.get("x-proofloop-workspace-id") ?? undefined);
    // Access request URL to ensure dynamic execution at runtime
    void request?.nextUrl.searchParams;
    const pendingApprovals = (tenant && process.env.DATABASE_URL)
      ? await listPersistedPendingApprovals(tenant)
      : await withTenantContext(tenant, async () => listPendingApprovals());
    return NextResponse.json({
      pendingApprovals,
      count: pendingApprovals.length
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve pending approvals.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
