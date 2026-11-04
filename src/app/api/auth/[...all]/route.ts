import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";
import { getAuth, emailDeliveryStorage } from "../../../../server/auth/config";

async function dispatch(request: NextRequest) {
  try {
    const handlers = toNextJsHandler(getAuth() as NonNullable<ReturnType<typeof getAuth>>);
    return await emailDeliveryStorage.run({ failed: false, error: "" }, async () => {
      return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
    });
  } catch {
    return Response.json({ error: "Authentication service is unavailable." }, { status: 503 });
  }
}

export const GET = dispatch;
export const POST = dispatch;
