/**
 * POST /api/analysis/[id]/approval
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateApprovalRequest } from "../../../../../server/validation";
import { recordApprovalDecision } from "../../../../../server/storage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON in request body.",
          details: ["The request body must be valid JSON."]
        },
        { status: 400 }
      );
    }

    const payload = {
      ...body,
      analysisId: id
    };

    const validation = validateApprovalRequest(payload);
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
        error: "Failed to record approval.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
