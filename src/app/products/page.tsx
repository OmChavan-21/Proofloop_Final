import { loadDemoSnapshot } from "@/components/dashboard/load-demo-snapshot";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNote } from "@/components/ui/partial-note";
import { ProductPerformanceTable } from "@/components/products/product-performance-table";
import { StatusPill } from "@/components/ui/status-pill";

export default async function ProductPerformancePage() {
  const snapshot = await loadDemoSnapshot();
  const firstSaleDate = snapshot.q4.saleDates[0] ?? null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Product Performance"
        description="Compare seeded product revenue, costs, gross profit, and margin across the available periods."
        meta={<StatusPill tone="neutral">Seeded demo catalog</StatusPill>}
      />
      <PartialNote firstSaleDate={firstSaleDate} lastSaleDate={snapshot.lastSaleDate} />
      <section className="rounded-xl border border-line bg-card px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">Comparison periods</h2>
        <p className="mt-1 text-sm text-muted">
          Q3 2026 is complete ({snapshot.q3RangeLabel}). Q4 2026 is partial ({firstSaleDate ?? "no sales"} through {snapshot.lastSaleDate ?? "no sales"}).
        </p>
      </section>
      <ProductPerformanceTable products={snapshot.products} />
    </div>
  );
}
