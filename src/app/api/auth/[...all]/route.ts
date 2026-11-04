import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";
import { getAuth } from "../../../../server/auth/config";

async function dispatch(request: NextRequest) {
  try {
    const handlers = toNextJsHandler(getAuth() as NonNullable<ReturnType<typeof getAuth>>);
    return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication is not configured.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export const GET = dispatch;
export const POST = dispatch;
