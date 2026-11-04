/**
 * GET /api/analysis/[id]
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAnalysis } from "../../../../server/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analysis = getAnalysis(id);

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
