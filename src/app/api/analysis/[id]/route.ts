/**
 * GET /api/analysis/[id]
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAnalysis } from "../../../../server/storage";
import { authErrorResponse, resolveRequestTenant } from "../../../../server/auth/session";
import { withTenantContext } from "../../../../server/auth/tenant-context";
import { getPersistedAnalysis } from "../../../../server/db/persistence";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await resolveRequestTenant(_request.headers, "analysis:read", _request.headers.get("x-proofloop-workspace-id") ?? undefined);
    const analysis = tenant
      ? await getPersistedAnalysis(tenant, id)
      : await withTenantContext(null, async () => getAnalysis(id));

    if (!analysis) {
      return NextResponse.json(
        {
          error: `Analysis with ID '${id}' was not found.`,
          analysisId: id
        },
        { status: 404 }
      );
    }

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve analysis.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
