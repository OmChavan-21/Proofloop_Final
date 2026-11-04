"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CategoryRevenueChart } from "@/components/charts/category-revenue-chart";
import { MarginComparisonChart } from "@/components/charts/margin-comparison-chart";
import { QuarterComparisonChart } from "@/components/charts/quarter-comparison-chart";
import { formatDay, formatMoney, formatNumber, formatPercent, formatPoints } from "@/components/dashboard/format";
import type { CategorySnapshot, DemoSnapshot, PeriodTotals, ProductSnapshot } from "@/components/dashboard/types";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNote } from "@/components/ui/partial-note";
import { PeriodContext } from "@/components/ui/period-context";
import { StatusPill } from "@/components/ui/status-pill";

type Period = "q3" | "q4";

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
        <p className="mt-1 text-sm text-muted">The current demo snapshot returned no products.</p>
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

export function BusinessOverview({ snapshot }: { snapshot: DemoSnapshot }) {
  const [period, setPeriod] = useState<Period>("q4");
  const totals: PeriodTotals = period === "q3" ? snapshot.q3 : snapshot.q4;
  const categories = useMemo(() => categoriesForPeriod(snapshot.products, period), [snapshot.products, period]);
  const firstSaleDate = snapshot.q4.saleDates[0] ?? null;
  const periodLabel = period === "q3" ? snapshot.q3Label : snapshot.q4Label;
  const marginChangeTone = snapshot.marginChange < 0 ? "negative" : "positive";

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Business Overview"
        description="Explore seeded business performance and follow each product to its underlying comparison."
        meta={<StatusPill tone="neutral">Seeded demo catalog</StatusPill>}
      />

      <PeriodContext
        firstSaleDate={period === "q4" ? firstSaleDate : snapshot.q3.saleDates[0] ?? null}
        lastSaleDate={period === "q4" ? snapshot.lastSaleDate : snapshot.q3.saleDates.at(-1) ?? null}
        period={period}
        onPeriodChange={setPeriod}
      />

      <PartialNote firstSaleDate={firstSaleDate} lastSaleDate={snapshot.lastSaleDate} />

      {totals.saleCount > 0 ? (
        <section aria-label={`${periodLabel} key metrics`}>
          <h2 className="sr-only">{periodLabel} key metrics</h2>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            <KpiCard label={`Revenue · ${periodLabel}`} value={formatMoney(totals.revenue)} footnote="Actual total for the selected seeded period." />
            <KpiCard label={`Gross profit · ${periodLabel}`} value={formatMoney(totals.grossProfit)} footnote="Revenue minus product costs in the selected period." />
            <KpiCard
              label={`Gross margin · ${periodLabel}`}
              value={formatPercent(totals.grossMargin)}
              detail={`${formatPoints(snapshot.marginChange)} Q4-to-date vs Q3 complete`}
              footnote="Margin-rate comparison only; Q4 is not a complete quarter."
              tone={marginChangeTone}
            />
            <KpiCard label={`Units · ${periodLabel}`} value={formatNumber(totals.units)} footnote="Seeded units in the selected period." />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-card px-5 py-6" aria-live="polite">
          <h2 className="font-semibold text-ink">No sales in this selected period</h2>
          <p className="mt-1 text-sm leading-6 text-muted">The seeded snapshot returned no sales for {periodLabel}.</p>
        </section>
      )}

      {snapshot.declinedCount > 0 ? (
        <section className="rounded-xl border border-line bg-brand-soft px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-ink">Margin movements to review</h2>
          <p className="mt-1 text-sm leading-6 text-ink/80">
            {snapshot.declinedCount} of {snapshot.products.length} seeded products have lower Q4-to-date gross margin than in Q3. This period comparison does not establish a cause.
          </p>
        </section>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7"><QuarterComparisonChart snapshot={snapshot} /></div>
        <div className="min-w-0 xl:col-span-5"><CategoryRevenueChart categories={categories} periodLabel={periodLabel} /></div>
      </div>

      {snapshot.products.length ? <MarginComparisonChart products={snapshot.products} /> : (
        <section className="rounded-xl border border-line bg-card px-5 py-6"><h2 className="font-semibold text-ink">No product comparison available</h2><p className="mt-1 text-sm text-muted">The seeded database returned no products for these periods.</p></section>
      )}

      <ProductDrilldown products={snapshot.products} />

      <footer className="border-t border-line pt-4 text-xs leading-5 text-muted">
        <p>Seeded demo data · USD · Q3 2026 complete · Q4 2026 partial</p>
        <p>Q4 calendar coverage runs through Dec 31; actual seeded transactions end {snapshot.lastSaleDate ? formatDay(snapshot.lastSaleDate) : "before this quarter"}.</p>
      </footer>
    </div>
  );
}
