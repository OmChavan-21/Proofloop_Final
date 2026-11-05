"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, formatPercent, formatPoints, formatNumber } from "@/components/dashboard/format";
import { productPeriodMetrics } from "@/components/products/metrics";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useTenant } from "@/components/shell/tenant-context";
import type { ProductSnapshot } from "@/components/dashboard/types";

export function ProductDetailWorkspace({
  productId,
  fallbackProduct,
}: {
  productId: string;
  fallbackProduct: ProductSnapshot | null;
}) {
  const { workspaceId, tenantFetch, session, sessionLoading } = useTenant();
  const [resolvedProduct, setResolvedProduct] = useState<{
    workspaceId: string;
    productId: string;
    product: ProductSnapshot | null;
    notFound: boolean;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (sessionLoading || !session || !workspaceId) return;

    let active = true;

    tenantFetch(`/api/products/${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { error?: string } | null;
          return {
            product: null,
            notFound: res.status === 404,
            error: res.status === 404 ? "" : payload?.error ?? `Product request failed (${res.status}).`,
          };
        }
        const payload = await res.json() as { product?: ProductSnapshot };
        return { product: payload.product ?? null, notFound: !payload.product, error: "" };
      })
      .then((result) => {
        if (active) setResolvedProduct({ workspaceId, productId, ...result });
      })
      .catch((error: unknown) => {
        if (active) setResolvedProduct({
          workspaceId,
          productId,
          product: null,
          notFound: false,
          error: error instanceof Error ? error.message : "Could not load this product.",
        });
      });

    return () => { active = false; };
  }, [productId, workspaceId, session, sessionLoading, tenantFetch]);

  const hasCurrentResolution = Boolean(
    resolvedProduct && resolvedProduct.workspaceId === workspaceId && resolvedProduct.productId === productId
  );
  const product = session
    ? (hasCurrentResolution ? resolvedProduct?.product ?? null : null)
    : (sessionLoading ? null : fallbackProduct);
  const loading = sessionLoading || (Boolean(session && workspaceId) && !hasCurrentResolution);
  const notFoundInWorkspace = Boolean(session && hasCurrentResolution && resolvedProduct?.notFound);
  const productError = session && hasCurrentResolution ? resolvedProduct?.error ?? "" : "";

  if (session && !sessionLoading && !workspaceId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Select a workspace" description="Choose a workspace to view its product data." />
      </div>
    );
  }

  if (productError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Product data unavailable" description="The product API could not load this workspace's product." />
        <p className="rounded-xl border border-negative/25 bg-negative-soft p-5 text-sm text-negative" role="alert">{productError}</p>
        <Link href="/products" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-canvas">Back to products</Link>
      </div>
    );
  }

  if (notFoundInWorkspace || (!product && !loading)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Product not found" description="The requested product does not exist in this workspace." />
        <section className="rounded-xl border border-line bg-card p-6 text-center">
          <h2 className="text-base font-semibold text-ink">Product not found in this workspace</h2>
          <p className="mt-1 text-sm text-muted">The product ID “{productId}” does not belong to the active workspace.</p>
          <Link href="/products" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90">
            Back to products
          </Link>
        </section>
      </div>
    );
  }

  if (!product) {
    return (
      <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted" role="status" aria-busy="true">
        Loading product details…
      </p>
    );
  }

  const q3 = productPeriodMetrics(product, "q3");
  const q4 = productPeriodMetrics(product, "q4");

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={product.productName}
        description={`${product.category} · ${product.productId} · workspace product details`}
        meta={<StatusPill tone={product.status}>{formatPoints(product.marginChange)}</StatusPill>}
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Q4 to-date product metrics">
        <Metric label="Revenue · Q4 to date" value={formatMoney(q4.revenue)} />
        <Metric label="Product cost · Q4 to date" value={formatMoney(q4.productCost)} />
        <Metric label="Gross profit · Q4 to date" value={formatMoney(q4.grossProfit)} />
        <Metric label="Gross margin · Q4 to date" value={formatPercent(q4.grossMargin)} />
      </section>

      <section className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <caption className="sr-only">{product.productName} period performance comparison</caption>
          <thead className="bg-canvas text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium" scope="col">Measure</th>
              <th className="px-4 py-3 text-right font-medium" scope="col">Q3 2026 · complete</th>
              <th className="px-4 py-3 text-right font-medium" scope="col">Q4 2026 · partial</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow label="Revenue" q3={formatMoney(q3.revenue)} q4={formatMoney(q4.revenue)} />
            <ComparisonRow label="Product cost" q3={formatMoney(q3.productCost)} q4={formatMoney(q4.productCost)} />
            <ComparisonRow label="Gross profit" q3={formatMoney(q3.grossProfit)} q4={formatMoney(q4.grossProfit)} />
            <ComparisonRow label="Gross margin" q3={formatPercent(q3.grossMargin)} q4={formatPercent(q4.grossMargin)} />
            <ComparisonRow label="Units in seeded sales" q3={formatNumber(q3.units)} q4={formatNumber(q4.units)} />
          </tbody>
        </table>
      </section>

      <p className="text-sm leading-6 text-muted">
        Product cost is derived from the average unit cost multiplied by units. Gross profit is revenue less this cost. Revenue and unit totals are not like-for-like across a complete quarter and a partial quarter; the margin change is in percentage points.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/products" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-canvas">Back to all products</Link>
        <Link href="/analysis" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90">Open AI Analysis</Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-card px-4 py-4">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </article>
  );
}

function ComparisonRow({ label, q3, q4 }: { label: string; q3: string; q4: string }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-4 py-3 font-medium text-ink">{label}</th>
      <td className="px-4 py-3 text-right tabular-nums text-muted">{q3}</td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">{q4}</td>
    </tr>
  );
}
