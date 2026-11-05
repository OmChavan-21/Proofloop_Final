"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEntry } from "@/server/types";
import { useTenant } from "@/components/shell/tenant-context";
import { formatDay } from "@/components/dashboard/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";

type AuditResponse = { auditHistory: AuditEntry[]; count: number };

export function AuditWorkspace() {
  const { tenantFetch, workspaceId, session } = useTenant();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await tenantFetch("/api/audit", { cache: "no-store" });
      const payload = await response.json() as AuditResponse | { error?: string };
      if (!response.ok || !("auditHistory" in payload) || !Array.isArray(payload.auditHistory)) {
        throw new Error("error" in payload && payload.error ? payload.error : "The audit endpoint returned an invalid response.");
      }
      setEntries(payload.auditHistory);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load audit history.");
    } finally { setLoading(false); }
  }, [tenantFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  if (prevWorkspaceId !== workspaceId) {
    setPrevWorkspaceId(workspaceId);
    setEntries([]);
    setError("");
  }

  return <div className="space-y-6">
    <PageHeader title="Audit history" description="Review actions recorded by Proofloop for the selected workspace." meta={<StatusPill tone="neutral">API-backed</StatusPill>} />
    {session && !workspaceId ? <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm" role="status">Select an organization and workspace in the header to inspect its history.</p> : null}
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="audit-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="audit-title" className="font-semibold">Recorded events</h2><p className="mt-1 text-sm text-muted">Loaded from GET /api/audit. Actor and notes are shown as returned by the server.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium disabled:opacity-60">{loading ? "Refreshing…" : "Refresh history"}</button></div>
      {loading && !entries.length ? <p className="py-8 text-center text-sm text-muted" role="status">Loading audit history…</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-negative/25 bg-negative-soft p-3 text-sm text-negative" role="alert">{error}</p> : null}
      {!loading && !error && !entries.length ? <p className="mt-4 rounded-lg bg-canvas p-4 text-sm text-muted">The API returned no audit entries for this workspace.</p> : null}
      <ol className="mt-3 divide-y divide-line">{entries.map((entry) => <li key={entry.id} className="py-4"><article className="rounded-lg bg-canvas p-3">
        <div className="flex flex-wrap items-center gap-2"><StatusPill tone={tone(entry.newStatus)}>{entry.newStatus.replaceAll("_", " ")}</StatusPill><span className="text-sm font-medium capitalize">{entry.action.replaceAll("_", " ")}</span><span className="text-sm text-muted">by {entry.reviewedBy}</span></div>
        <time className="mt-2 block text-xs text-muted" dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
        <p className="mt-2 break-all font-mono text-xs text-muted">Analysis {entry.analysisId} · {entry.previousStatus} → {entry.newStatus}</p>
        <p className="mt-2 text-sm leading-5">{entry.notes || "No reviewer notes recorded."}</p>
      </article></li>)}</ol>
    </section>
    <p className="text-xs leading-5 text-muted">Storage durability depends on the configured backend. In local seeded demo mode, history is process-local; authenticated production storage is provided by the current PostgreSQL-backed implementation.</p>
  </div>;
}

function tone(status: string) {
  if (status === "approved") return "approved" as const;
  if (status === "rejected") return "rejected" as const;
  if (status === "changes_requested") return "changes_requested" as const;
  if (status === "pending") return "pending" as const;
  return "neutral" as const;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${formatDay(value.slice(0, 10))} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
