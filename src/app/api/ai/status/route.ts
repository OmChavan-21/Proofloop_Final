/**
 * GET /api/ai/status
 * Returns verified AI provider status per CONTRACT.md
 */

import { NextResponse } from "next/server";
import { getProviderStatuses } from "../../../../server/ai";

export async function GET() {
  try {
    const statuses = await getProviderStatuses();
    return NextResponse.json(statuses);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to determine AI provider status.",
        details: [message]
      },
      { status: 500 }
    );
  }
}
