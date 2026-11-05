"use client";

import { PageHeader } from "@/components/ui/page-header";
import { PartialNote } from "@/components/ui/partial-note";
import { ProductPerformanceTable } from "@/components/products/product-performance-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useTenant } from "@/components/shell/tenant-context";
import type { DemoSnapshot } from "@/components/dashboard/types";
import { useWorkspaceSnapshot } from "@/components/dashboard/use-workspace-snapshot";
import { WorkspaceSnapshotState } from "@/components/dashboard/workspace-snapshot-state";

export function ProductPerformanceWorkspace({ initialSnapshot, initialWorkspaceId, initialOrganizationId }: { initialSnapshot: DemoSnapshot; initialWorkspaceId?: string; initialOrganizationId?: string }) {
  const { workspaceId, session } = useTenant();
  const snapshotView = useWorkspaceSnapshot(initialSnapshot, initialWorkspaceId, initialOrganizationId);
  const snapshot = snapshotView.snapshot;

  if (!snapshot) {
    return <WorkspaceSnapshotState view={snapshotView} title="Product performance" />;
  }

  const firstSaleDate = snapshot.q4.saleDates[0] ?? null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Product Performance"
        description="Compare product revenue, costs, gross profit, and margin across the available periods."
        meta={<StatusPill tone="neutral">{snapshot.dataSource === "seeded_demo_data" ? "Seeded demo catalog" : session && workspaceId ? "Active workspace" : "No active workspace"}</StatusPill>}
      />
      {firstSaleDate ? (
        <PartialNote firstSaleDate={firstSaleDate} lastSaleDate={snapshot.lastSaleDate} />
      ) : null}
      <section className="rounded-xl border border-line bg-card px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">Comparison periods</h2>
        <p className="mt-1 text-sm text-muted">
          Q3 2026 is complete ({snapshot.q3RangeLabel}). Q4 2026 is partial ({firstSaleDate ?? "no sales"} through {snapshot.lastSaleDate ?? "no sales"}).
        </p>
      </section>
      <ProductPerformanceTable key={`${session?.user.id ?? "demo"}:${workspaceId || "no-workspace"}`} products={snapshot.products} />
    </div>
  );
}
