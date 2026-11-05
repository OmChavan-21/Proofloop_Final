import { Suspense } from "react";
import { headers } from "next/headers";
import { resolveRequestTenant } from "@/server/auth/session";
import { createEmptySnapshot, loadWorkspaceSnapshot } from "@/engine/workspace-manager";
import { getPersistedWorkspaceSnapshot } from "@/server/db/persistence";
import { ProductDetailWorkspace } from "@/components/products/product-detail-workspace";

export default function ProductDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted" role="status" aria-busy="true">
          Loading product details…
        </p>
      }
    >
      <ProductDetailLoader params={params} />
    </Suspense>
  );
}

async function ProductDetailLoader({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reqHeaders = await headers();
  let snapshot;
  try {
    const tenant = await resolveRequestTenant(reqHeaders, "analysis:read");
    if (tenant && process.env.DATABASE_URL) {
      snapshot = await getPersistedWorkspaceSnapshot(tenant);
    } else if (tenant?.workspaceId) {
      snapshot = await loadWorkspaceSnapshot(tenant.workspaceId, tenant);
    } else if (process.env.DATABASE_URL) {
      snapshot = createEmptySnapshot("workspace_data");
    } else {
      snapshot = await loadWorkspaceSnapshot("demo");
    }
  } catch {
    snapshot = process.env.DATABASE_URL
      ? createEmptySnapshot("workspace_data")
      : await loadWorkspaceSnapshot("demo");
  }

  const fallbackProduct = snapshot.products.find((item) => item.productId === id) ?? null;

  return <ProductDetailWorkspace productId={id} fallbackProduct={fallbackProduct} />;
}
