/**
 * POST /api/analysis/[id]/approval
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateApprovalRequest } from "../../../../../server/validation";
import { recordApprovalDecision } from "../../../../../server/storage";
import { authErrorResponse, resolveRequestTenant } from "../../../../../server/auth/session";
import { withTenantContext } from "../../../../../server/auth/tenant-context";
import { recordPersistedApprovalDecision } from "../../../../../server/db/persistence";

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

    const tenant = await resolveRequestTenant(request.headers, "approval:decide", request.headers.get("x-proofloop-workspace-id") ?? undefined);
    const result = tenant
      ? await recordPersistedApprovalDecision(tenant, validation.data)
      : await withTenantContext(null, async () => recordApprovalDecision(validation.data));
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.reason === "conflict" ? { code: "APPROVAL_CONFLICT" } : {})
        },
        { status: result.reason === "conflict" ? 409 : 404 }
      );
    }

    return NextResponse.json({
      success: true,
      approval: result.analysis.approval,
      auditEntry: result.auditEntry,
      analysis: result.analysis
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
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
