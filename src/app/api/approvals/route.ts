/**
 * POST /api/approvals
 * GET /api/approvals
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateApprovalRequest } from "../../../server/validation";
import { recordApprovalDecision, getAuditHistory } from "../../../server/storage";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON in request body.",
          details: ["The request body must be valid JSON."]
        },
        { status: 400 }
      );
    }

    const validation = validateApprovalRequest(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details
        },
        { status: 400 }
      );
    }

    const result = recordApprovalDecision(validation.data);
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      approval: result.analysis?.approval,
      auditEntry: result.auditEntry,
      analysis: result.analysis
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to process approval.",
        details: [message]
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const analysisId = searchParams.get("analysisId") || undefined;
    const auditHistory = getAuditHistory(analysisId);

    return NextResponse.json({
      auditHistory,
      count: auditHistory.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve approvals.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
