/**
 * POST /api/analysis
 * GET /api/analysis
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateAnalysisRequest } from "../../../server/validation";
import { runAnalysisOrchestration } from "../../../server/orchestration";
import { listAnalyses } from "../../../server/storage";

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

    const validation = validateAnalysisRequest(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details
        },
        { status: 400 }
      );
    }

    const analysis = await runAnalysisOrchestration(validation.data);

    // If analysis execution itself encountered a failure, return 422 or 200 with structured failed status
    const statusCode = analysis.status === "failed" ? 422 : 200;
    return NextResponse.json(analysis, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to process analysis.",
        details: [message]
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const analyses = listAnalyses();
    return NextResponse.json({
      analyses,
      count: analyses.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve analyses.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
