/**
 * GET /api/products
 * POST /api/products
 * Scoped to active workspace. Products added to Workspace A do not appear in Workspace B.
 */

import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, resolveRequestTenant } from "../../../server/auth/session";
import { addWorkspaceProduct, loadWorkspaceSnapshot } from "../../../engine/workspace-manager";
import { getPersistedWorkspaceProducts, persistWorkspaceProduct } from "../../../server/db/persistence";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.headers.get("x-proofloop-workspace-id") || undefined;
    const tenant = await resolveRequestTenant(request.headers, "analysis:read", workspaceId);

    const targetWorkspace = tenant?.workspaceId || workspaceId;
    const products = (tenant && process.env.DATABASE_URL)
      ? await getPersistedWorkspaceProducts(tenant)
      : (await loadWorkspaceSnapshot(targetWorkspace, tenant ?? undefined)).products;

    return NextResponse.json({
      products,
      count: products.length,
      workspaceId: targetWorkspace || null,
    });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to retrieve products.",
        details: [message],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body.", details: ["Body must be valid JSON."] },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Product payload must be an object." }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const id = typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id.trim() : undefined;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const category = typeof payload.category === "string" ? payload.category.trim() : "General";
    const price = typeof payload.price === "number" ? payload.price : Number(payload.price) || 0;
    const cost = typeof payload.cost === "number" ? payload.cost : Number(payload.cost) || 0;
    const quantity = typeof payload.quantity === "number" ? payload.quantity : Number(payload.quantity) || 0;
    const orderDate = typeof payload.orderDate === "string" ? payload.orderDate.trim() : undefined;

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "A valid product name (minimum 2 characters) is required." },
        { status: 400 }
      );
    }

    const workspaceId = request.headers.get("x-proofloop-workspace-id")
      || (typeof payload.workspaceId === "string" ? payload.workspaceId : undefined);

    if (!workspaceId) {
      return NextResponse.json(
        { error: "A target workspace ID is required to add products." },
        { status: 400 }
      );
    }

    const tenant = await resolveRequestTenant(request.headers, "analysis:run", workspaceId);
    const targetWorkspace = tenant?.workspaceId || workspaceId;

    const product = (tenant && process.env.DATABASE_URL)
      ? await persistWorkspaceProduct(tenant, {
          id,
          name,
          category,
          price,
          cost,
          quantity,
          orderDate,
        })
      : await addWorkspaceProduct(targetWorkspace, {
          id,
          name,
          category,
          price,
          cost,
          quantity,
          orderDate,
        }, tenant ?? undefined);

    return NextResponse.json({ success: true, product, workspaceId: targetWorkspace }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: "Failed to add product to workspace.",
        details: [message],
      },
      { status: 500 }
    );
  }
}
