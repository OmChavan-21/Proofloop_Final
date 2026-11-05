"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { DeferredChart } from "@/components/charts/deferred-chart";
import { formatDay, formatMoney, formatNumber, formatPercent, formatPoints } from "@/components/dashboard/format";
import type { CategorySnapshot, DemoSnapshot, PeriodTotals, ProductSnapshot } from "@/components/dashboard/types";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNote } from "@/components/ui/partial-note";
import { PeriodContext } from "@/components/ui/period-context";
import { StatusPill } from "@/components/ui/status-pill";
import { useTenant } from "@/components/shell/tenant-context";
import { useWorkspaceSnapshot } from "@/components/dashboard/use-workspace-snapshot";
import { WorkspaceSnapshotState } from "@/components/dashboard/workspace-snapshot-state";

type Period = "q3" | "q4";

const QuarterComparisonChart = dynamic(() => import("@/components/charts/quarter-comparison-chart").then((module) => module.QuarterComparisonChart), { ssr: false, loading: () => null });
const CategoryRevenueChart = dynamic(() => import("@/components/charts/category-revenue-chart").then((module) => module.CategoryRevenueChart), { ssr: false, loading: () => null });
const MarginComparisonChart = dynamic(() => import("@/components/charts/margin-comparison-chart").then((module) => module.MarginComparisonChart), { ssr: false, loading: () => null });

function categoriesForPeriod(products: ProductSnapshot[], period: Period): CategorySnapshot[] {
  const values = new Map<string, CategorySnapshot>();
  for (const product of products) {
    const revenue = period === "q3" ? product.q3Revenue : product.q4Revenue;
    const units = period === "q3" ? product.q3Units : product.q4Units;
    const unitCost = period === "q3" ? product.q3UnitCost : product.q4UnitCost;
    const category = values.get(product.category) ?? {
      category: product.category,
      revenue: 0,
      grossProfit: 0,
      grossMargin: 0,
      units: 0,
      share: 0,
    };
    category.revenue += revenue;
    category.grossProfit += revenue - unitCost * units;
    category.units += units;
    values.set(product.category, category);
  }
  const totalRevenue = [...values.values()].reduce((total, category) => total + category.revenue, 0);
  if (totalRevenue === 0) return [];
  return [...values.values()]
    .map((category) => ({
      ...category,
      grossMargin: category.revenue > 0 ? (category.grossProfit / category.revenue) * 100 : 0,
      share: totalRevenue > 0 ? (category.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function ProductDrilldown({ products }: { products: ProductSnapshot[] }) {
  if (!products.length) {
    return (
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="font-semibold text-ink">No product data available</h2>
        <p className="mt-1 text-sm text-muted">No products have been added to this workspace yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Product margin movement</h2>
          <p className="mt-1 text-sm text-muted">Select a product to inspect its period totals and costs.</p>
        </div>
        <Link href="/products" className="inline-flex min-h-11 items-center font-medium text-brand hover:underline">View product performance</Link>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {products.map((product) => (
          <li key={product.productId}>
            <Link
              href={`/products/${encodeURIComponent(product.productId)}`}
              className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm focus-visible:rounded-md"
            >
              <span>
                <span className="block font-medium text-ink">{product.productName}</span>
                <span className="text-xs text-muted">{product.category} · {product.productId}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted">Q4-to-date margin</span>
                <span className="font-medium tabular-nums text-ink">{formatPercent(product.q4Margin)}</span>
                <StatusPill tone={product.status}>{formatPoints(product.marginChange)}</StatusPill>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BusinessOverview({ snapshot: initialSnapshot, initialWorkspaceId, initialOrganizationId }: { snapshot: DemoSnapshot; initialWorkspaceId?: string; initialOrganizationId?: string }) {
  const { workspaceId, session } = useTenant();
  const snapshotView = useWorkspaceSnapshot(initialSnapshot, initialWorkspaceId, initialOrganizationId);
  const snapshot = snapshotView.snapshot ?? initialSnapshot;
  const [period, setPeriod] = useState<Period>("q4");

  const totals: PeriodTotals = period === "q3" ? snapshot.q3 : snapshot.q4;
  const categories = useMemo(() => categoriesForPeriod(snapshot.products, period), [snapshot.products, period]);
  const firstSaleDate = snapshot.q4.saleDates[0] ?? null;
  const periodLabel = period === "q3" ? snapshot.q3Label : snapshot.q4Label;
  const marginChangeTone = snapshot.marginChange < 0 ? "negative" : "positive";
  const dataLabel = snapshot.dataSource === "seeded_demo_data" ? "Seeded demo catalog" : session && workspaceId ? "Active workspace" : "No active workspace";

  if (!snapshotView.snapshot) {
    return <WorkspaceSnapshotState view={snapshotView} title="Business overview" />;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Business Overview"
        description="Explore business performance and follow each product to its underlying comparison."
        meta={<StatusPill tone="neutral">{dataLabel}</StatusPill>}
      />

      <PeriodContext
        firstSaleDate={period === "q4" ? firstSaleDate : snapshot.q3.saleDates[0] ?? null}
        lastSaleDate={period === "q4" ? snapshot.lastSaleDate : snapshot.q3.saleDates.at(-1) ?? null}
        period={period}
        onPeriodChange={setPeriod}
      />

      {firstSaleDate ? (
        <PartialNote firstSaleDate={firstSaleDate} lastSaleDate={snapshot.lastSaleDate} />
      ) : null}

      {totals.saleCount > 0 ? (
        <section aria-label={`${periodLabel} key metrics`}>
          <h2 className="sr-only">{periodLabel} key metrics</h2>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          <KpiCard
            label={`Revenue · ${periodLabel}`}
            value={formatMoney(totals.revenue)}
            footnote={totals.saleCount > 0 ? "Actual total for the selected period." : "No orders recorded in this workspace."}
          />
          <KpiCard
            label={`Gross profit · ${periodLabel}`}
            value={formatMoney(totals.grossProfit)}
            footnote={totals.saleCount > 0 ? "Revenue minus product costs in the selected period." : "No profit data available."}
          />
          <KpiCard
            label={`Gross margin · ${periodLabel}`}
            value={formatPercent(totals.grossMargin)}
            detail={snapshot.products.length > 0 ? `${formatPoints(snapshot.marginChange)} Q4-to-date vs Q3 complete` : "0.0 pp margin change"}
            footnote={totals.saleCount > 0 ? "Margin-rate comparison only; Q4 is not a complete quarter." : "0% margin recorded."}
            tone={totals.saleCount > 0 ? marginChangeTone : "neutral"}
          />
          <KpiCard
            label={`Units · ${periodLabel}`}
            value={formatNumber(totals.units)}
            footnote={totals.saleCount > 0 ? "Units sold in the selected period." : "0 units sold."}
          />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-card p-5" aria-live="polite">
          <h2 className="font-semibold text-ink">No KPI data for {periodLabel}</h2>
          <p className="mt-1 text-sm text-muted">The selected workspace API returned no sales for this period. KPIs will appear when this workspace contains sales data.</p>
        </section>
      )}

      {snapshot.products.length === 0 ? (
        <section className="rounded-xl border border-line bg-card p-5 text-center" aria-live="polite">
          <h2 className="font-semibold text-ink">New Workspace Dashboard</h2>
          <p className="mt-1 text-sm text-muted">
            This workspace currently has no products or orders recorded. Adding data to this workspace will populate its independent metrics.
          </p>
        </section>
      ) : null}

      {snapshot.declinedCount > 0 ? (
        <section className="rounded-xl border border-line bg-brand-soft px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">Margin movements to review</h2>
          <p className="mt-1 text-sm leading-6 text-ink/80">
            {snapshot.declinedCount} of {snapshot.products.length} products have lower Q4-to-date gross margin than in Q3. This period comparison does not establish a cause.
          </p>
        </section>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7"><DeferredChart label="Quarter comparison"><QuarterComparisonChart snapshot={snapshot} /></DeferredChart></div>
        <div className="min-w-0 xl:col-span-5"><DeferredChart label="Category revenue"><CategoryRevenueChart categories={categories} periodLabel={periodLabel} /></DeferredChart></div>
      </div>

      {snapshot.products.length && (snapshot.q3.saleCount > 0 || snapshot.q4.saleCount > 0) ? (
        <DeferredChart label="Product margin comparison" minHeight={480}><MarginComparisonChart products={snapshot.products} /></DeferredChart>
      ) : snapshot.products.length ? (
        <section className="rounded-xl border border-line bg-card px-5 py-6">
          <h2 className="font-semibold text-ink">No margin comparison available</h2>
          <p className="mt-1 text-sm text-muted">This workspace has products, but the API returned no sales in either comparison period.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-card px-5 py-6">
          <h2 className="font-semibold text-ink">No product comparison available</h2>
          <p className="mt-1 text-sm text-muted">No products recorded in this workspace for margin comparison.</p>
        </section>
      )}

      <ProductDrilldown products={snapshot.products} />

      <footer className="border-t border-line pt-4 text-xs leading-5 text-muted">
        <p>{snapshot.dataSource === "seeded_demo_data" ? "Seeded demo data" : session && workspaceId ? "Workspace-scoped data" : "No active workspace data"} · USD · Q3 2026 complete · Q4 2026 partial</p>
        <p>Q4 calendar coverage runs through Dec 31; actual transactions end {snapshot.lastSaleDate ? formatDay(snapshot.lastSaleDate) : "before this quarter"}.</p>
      </footer>
    </div>
  );
}
