/**
 * GET /api/audit
 * Returns decision audit history per CONTRACT.md Section 9
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAuditHistory } from "../../../server/storage";
import { authErrorResponse, resolveRequestTenant } from "../../../server/auth/session";
import { withTenantContext } from "../../../server/auth/tenant-context";
import { getPersistedAuditHistory } from "../../../server/db/persistence";

export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveRequestTenant(request.headers, "analysis:read", request.headers.get("x-proofloop-workspace-id") ?? undefined);
    const searchParams = request.nextUrl.searchParams;
    const analysisId = searchParams.get("analysisId") || undefined;
    const auditHistory = (tenant && process.env.DATABASE_URL)
      ? await getPersistedAuditHistory(tenant, analysisId)
      : await withTenantContext(tenant, async () => getAuditHistory(analysisId));

    return NextResponse.json({
      auditHistory,
      count: auditHistory.length,
      filteredByAnalysisId: analysisId || null
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve audit log.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
