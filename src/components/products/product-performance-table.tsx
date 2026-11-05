"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney, formatPercent, formatPoints, formatNumber } from "@/components/dashboard/format";
import type { ProductSnapshot } from "@/components/dashboard/types";
import { productPeriodMetrics } from "@/components/products/metrics";
import { StatusPill } from "@/components/ui/status-pill";

type SortKey = "revenue" | "cost" | "grossProfit" | "grossMargin" | "marginChange";

const sortLabels: Record<SortKey, string> = {
  revenue: "Revenue · Q4 to date",
  cost: "Product cost · Q4 to date",
  grossProfit: "Gross profit · Q4 to date",
  grossMargin: "Gross margin · Q4 to date",
  marginChange: "Margin change",
};

export function ProductPerformanceTable({ products }: { products: ProductSnapshot[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [ascending, setAscending] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("all");

  const visibleProducts = useMemo(() => {
    const filtered = selectedProductId === "all"
      ? [...products]
      : products.filter((product) => product.productId === selectedProductId);
    return filtered.sort((a, b) => {
      const aMetric = productPeriodMetrics(a, "q4");
      const bMetric = productPeriodMetrics(b, "q4");
      const aValue = sortValue(a, aMetric, sortKey);
      const bValue = sortValue(b, bMetric, sortKey);
      return (aValue - bValue) * (ascending ? 1 : -1);
    });
  }, [products, selectedProductId, sortKey, ascending]);

  function changeSort(key: SortKey) {
    if (sortKey === key) setAscending((value) => !value);
    else {
      setSortKey(key);
      setAscending(false);
    }
  }

  function heading(key: SortKey) {
    const active = key === sortKey;
    return (
      <th
        scope="col"
        aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
        className="px-3 py-3 text-right font-medium"
      >
        <button
          type="button"
          onClick={() => changeSort(key)}
          className="min-h-9 whitespace-nowrap rounded px-1 text-right hover:text-brand"
          aria-label={`Sort by ${sortLabels[key]}${active ? (ascending ? " descending" : " ascending") : ""}`}
        >
          {sortLabels[key]}{active ? (ascending ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  const selectedProduct = products.find((product) => product.productId === selectedProductId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label htmlFor="product-selection" className="block text-sm font-medium text-ink">Select a product</label>
          <select
            id="product-selection"
            value={selectedProductId}
            onChange={(event) => setSelectedProductId(event.target.value)}
            className="mt-1 min-h-11 w-full max-w-sm rounded-lg border border-line bg-white px-3 text-sm text-ink focus-visible:outline-offset-2"
          >
            <option value="all">All seeded products</option>
            {products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}
          </select>
        </div>
        <div className="sm:hidden">
          <label htmlFor="product-sort-mobile" className="block text-sm font-medium text-ink">Sort products</label>
          <select
            id="product-sort-mobile"
            value={`${sortKey}:${ascending ? "asc" : "desc"}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":") as [SortKey, "asc" | "desc"];
              setSortKey(key);
              setAscending(direction === "asc");
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option key={key} value={`${key}:desc`}>{sortLabels[key]} · high to low</option>
            ))}
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option key={`${key}-asc`} value={`${key}:asc`}>{sortLabels[key]} · low to high</option>
            ))}
          </select>
        </div>
        <p className="hidden text-xs leading-5 text-muted sm:block">Select a product to filter the table. Column buttons sort the rows.</p>
      </div>

      {selectedProduct ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3">
          <p className="text-sm text-ink">Selected: <span className="font-semibold">{selectedProduct.productName}</span></p>
          <Link className="inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" href={`/products/${encodeURIComponent(selectedProduct.productId)}`}>
            Open product details
          </Link>
        </div>
      ) : null}

      {products.length === 0 ? (
        <section className="rounded-xl border border-line bg-card p-5" role="status">
          <h2 className="font-semibold text-ink">No product data</h2>
          <p className="mt-1 text-sm text-muted">No products have been added to this workspace yet.</p>
        </section>
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-xl border border-line bg-card lg:block">
          <table className="w-full min-w-[1480px] border-collapse text-left text-sm">
            <caption className="sr-only">Product comparison for complete Q3 2026 and partial Q4 2026</caption>
            <thead className="bg-canvas text-xs text-muted">
              <tr>
                <th className="px-4 py-2" scope="col" rowSpan={2}>Product</th>
                <th className="px-3 py-2" scope="col" rowSpan={2}>Category</th>
                <th className="border-l border-line px-3 py-2 text-center font-semibold" scope="colgroup" colSpan={4}>Q3 2026 · complete</th>
                <th className="border-l border-line px-3 py-2 text-center font-semibold" scope="colgroup" colSpan={4}>Q4 2026 · partial</th>
                <th className="border-l border-line px-3 py-2 text-right font-semibold" scope="col" rowSpan={2}>Margin change</th>
              </tr>
              <tr>
                <th className="border-l border-line px-3 py-3 text-right font-medium" scope="col">Revenue</th>
                <th className="px-3 py-3 text-right font-medium" scope="col">Product cost</th>
                <th className="px-3 py-3 text-right font-medium" scope="col">Gross profit</th>
                <th className="px-3 py-3 text-right font-medium" scope="col">Gross margin</th>
                {heading("revenue")}
                {heading("cost")}
                {heading("grossProfit")}
                {heading("grossMargin")}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const q3 = productPeriodMetrics(product, "q3");
                const q4 = productPeriodMetrics(product, "q4");
                return (
                  <tr key={product.productId} className="border-t border-line align-middle hover:bg-canvas/70">
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link className="text-ink underline-offset-4 hover:text-brand hover:underline" href={`/products/${encodeURIComponent(product.productId)}`}>{product.productName}</Link>
                      <span className="mt-0.5 block text-xs font-normal text-muted">{product.productId}</span>
                    </th>
                    <td className="px-3 py-3 text-muted">{product.category}</td>
                    <td className="border-l border-line px-3 py-3 text-right tabular-nums">{formatMoney(q3.revenue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(q3.productCost)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(q3.grossProfit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPercent(q3.grossMargin)}</td>
                    <td className="border-l border-line px-3 py-3 text-right tabular-nums">{formatMoney(q4.revenue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(q4.productCost)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatMoney(q4.grossProfit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPercent(q4.grossMargin)}</td>
                    <td className="px-3 py-3 text-right"><StatusPill tone={product.status}>{formatPoints(product.marginChange)}</StatusPill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 lg:hidden">
          {visibleProducts.map((product) => {
            const q3 = productPeriodMetrics(product, "q3");
            const q4 = productPeriodMetrics(product, "q4");
            return (
              <article key={product.productId} className="rounded-xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h2 className="font-semibold text-ink">{product.productName}</h2><p className="mt-0.5 text-xs text-muted">{product.category} · {product.productId}</p></div>
                  <StatusPill tone={product.status}>{formatPoints(product.marginChange)}</StatusPill>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <MobileMetric label="Q3 revenue" value={formatMoney(q3.revenue)} />
                  <MobileMetric label="Q3 product cost" value={formatMoney(q3.productCost)} />
                  <MobileMetric label="Q3 gross profit" value={formatMoney(q3.grossProfit)} />
                  <MobileMetric label="Q3 gross margin" value={formatPercent(q3.grossMargin)} />
                  <MobileMetric label="Q4 revenue · partial" value={formatMoney(q4.revenue)} />
                  <MobileMetric label="Q4 product cost · partial" value={formatMoney(q4.productCost)} />
                  <MobileMetric label="Q4 gross profit · partial" value={formatMoney(q4.grossProfit)} />
                  <MobileMetric label="Q4 gross margin · partial" value={formatPercent(q4.grossMargin)} />
                </dl>
                <Link href={`/products/${encodeURIComponent(product.productId)}`} className="mt-4 inline-flex min-h-10 items-center font-medium text-brand hover:underline">Open product details</Link>
              </article>
            );
          })}
        </div>
        </>
      )}
      <p className="text-xs leading-5 text-muted">
        Q4 values cover only the seeded sales available so far. Product cost is the snapshot’s average unit cost multiplied by units; gross profit is revenue less product cost. Q3 is a complete quarter.
      </p>
      <p className="text-xs text-muted" aria-live="polite">Showing {formatNumber(visibleProducts.length)} of {formatNumber(products.length)} products · sorted by {sortLabels[sortKey]} {ascending ? "ascending" : "descending"}.</p>
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 text-sm font-medium tabular-nums text-ink">{value}</dd></div>;
}

function sortValue(
  product: ProductSnapshot,
  metrics: ReturnType<typeof productPeriodMetrics>,
  key: SortKey,
) {
  switch (key) {
    case "revenue": return metrics.revenue;
    case "cost": return metrics.productCost;
    case "grossProfit": return metrics.grossProfit;
    case "grossMargin": return metrics.grossMargin;
    case "marginChange": return product.marginChange;
  }
}
