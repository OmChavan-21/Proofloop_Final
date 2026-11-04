import Link from "next/link";
import { ArrowRight, CircleHelp, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";

export default function DashboardsPage() {
  return <div className="space-y-6">
    <PageHeader title="Dashboard workspace" description="Create and review evidence-backed dashboard proposals when the preview API is available." meta={<StatusPill tone="pending">Preview unavailable</StatusPill>} />
    <section className="rounded-xl border border-warning/25 bg-warning-soft p-4 sm:p-5" aria-labelledby="preview-status-title">
      <div className="flex items-start gap-3"><CircleHelp className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 id="preview-status-title" className="font-semibold text-ink">The dashboard compiler is present; the proposal API is not.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink">The backend currently defines a versioned specification and a validated SQL compiler. It does not yet expose an endpoint that accepts a question, returns a dashboard specification with executed result rows and provenance, or persists an immutable proposal/version. This page therefore does not display sample charts or pretend a proposal exists.</p></div></div>
    </section>
    <section className="grid gap-4 md:grid-cols-2" aria-label="Available dashboard capabilities">
      <article className="rounded-xl border border-line bg-card p-5"><div className="flex items-center gap-2"><LayoutDashboard className="size-4 text-brand" aria-hidden="true" /><h2 className="font-semibold">Specification types defined</h2></div><p className="mt-2 text-sm leading-6 text-muted">The server schema currently accepts KPI, bar, line and table components with catalog-defined metrics, dimensions and filters. Actual preview rendering awaits the response contract for executed component data.</p><p className="mt-3 text-xs text-muted">Source: server dashboard specification and query compiler.</p></article>
      <article className="rounded-xl border border-line bg-card p-5"><h2 className="font-semibold">Run an evidence-backed analysis</h2><p className="mt-2 text-sm leading-6 text-muted">The existing analysis API can inspect the question, validate SQL, execute the current read-only workflow and return results/evidence. It does not produce a dashboard proposal.</p><Link href="/analysis" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90">Open AI Analysis <ArrowRight className="size-4" aria-hidden="true" /></Link></article>
    </section>
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5"><h2 className="font-semibold">Backend integration needed</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted"><li>Workspace-scoped dashboard proposal/preview endpoint with a validated specification, per-component query results, evidence/provenance and validation/execution state.</li><li>Immutable proposal/version persistence and version history/comparison responses.</li><li>Approval decision API that accepts a proposal version ID and returns its updated version status and audit event.</li><li>Dashboard modification endpoint that returns a proposed diff for review without mutating the approved version.</li></ul></section>
  </div>;
}
