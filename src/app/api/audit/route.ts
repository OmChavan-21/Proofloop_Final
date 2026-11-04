/**
 * GET /api/audit
 * Returns decision audit history per CONTRACT.md Section 9
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAuditHistory } from "../../../server/storage";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const analysisId = searchParams.get("analysisId") || undefined;
    const auditHistory = getAuditHistory(analysisId);

    return NextResponse.json({
      auditHistory,
      count: auditHistory.length,
      filteredByAnalysisId: analysisId || null
    });
  } catch (error) {
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
