"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PendingApprovalItem, AnalysisResponse, AuditEntry, ApprovalAction, ApprovalStatus } from "@/server/types";
import { formatDay } from "@/components/dashboard/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useTenant } from "@/components/shell/tenant-context";
import { canDecideApprovals } from "@/lib/frontend-access";

type QueueResponse = { pendingApprovals: PendingApprovalItem[]; count: number };
type AuditResponse = { auditHistory: AuditEntry[]; count: number };
type ApprovalResponse = { success: true; approval: AnalysisResponse["approval"]; auditEntry: AuditEntry };
type ApiError = { error?: string };

const actions: { action: ApprovalAction; label: string; className: string }[] = [
  { action: "approve", label: "Approve", className: "bg-positive text-white hover:bg-positive/90" },
  { action: "reject", label: "Reject", className: "bg-negative text-white hover:bg-negative/90" },
  { action: "request_changes", label: "Request changes", className: "bg-warning text-white hover:bg-warning/90" },
];

export function ApprovalWorkspace() {
  const { tenantFetch, role, session, workspaceId } = useTenant();
  const [queue, setQueue] = useState<PendingApprovalItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [notes, setNotes] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [decisionEntry, setDecisionEntry] = useState<AuditEntry | null>(null);

  const loadQueueAndAudit = useCallback(async () => {
    const [queueResult, auditResult] = await Promise.allSettled([
      tenantFetch("/api/approvals/pending", { cache: "no-store" }),
      tenantFetch("/api/audit", { cache: "no-store" }),
    ]);

    if (queueResult.status === "fulfilled") {
      try {
        const payload = await queueResult.value.json() as QueueResponse | ApiError;
        if (!queueResult.value.ok || !("pendingApprovals" in payload) || !Array.isArray(payload.pendingApprovals)) {
          throw new Error("The pending approvals API did not return a queue.");
        }
        setQueue(payload.pendingApprovals);
      } catch (error) {
        setQueueError(error instanceof Error ? error.message : "Could not load pending approvals.");
      }
    } else {
      setQueueError("Could not reach the pending approvals API.");
    }

    if (auditResult.status === "fulfilled") {
      try {
        const payload = await auditResult.value.json() as AuditResponse | ApiError;
        if (!auditResult.value.ok || !("auditHistory" in payload) || !Array.isArray(payload.auditHistory)) {
          throw new Error("The audit API did not return history.");
        }
        setAudit(payload.auditHistory);
      } catch (error) {
        setAuditError(error instanceof Error ? error.message : "Could not load audit history.");
      }
    } else {
      setAuditError("Could not reach the audit API.");
    }
    setQueueLoading(false);
  }, [tenantFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueueAndAudit(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQueueAndAudit]);

  // Reset selected item and messages when switching workspaces
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  if (prevWorkspaceId !== workspaceId) {
    setPrevWorkspaceId(workspaceId);
    setSelectedId("");
    setSelectedAnalysis(null);
    setDecisionBusy(false);
    setDecisionError("");
    setDecisionMessage("");
    setDecisionEntry(null);
    setNotes("");
  }

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    tenantFetch(`/api/analysis/${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as AnalysisResponse | ApiError;
        if (!response.ok || !("analysisId" in payload)) {
          throw new Error("error" in payload && payload.error ? payload.error : "Could not load the selected analysis.");
        }
        setSelectedAnalysis(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error ? error.message : "Could not load the selected analysis.");
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, tenantFetch]);

  async function submitDecision(action: ApprovalAction) {
    if (!selectedAnalysis || selectedAnalysis.approval.status !== "pending" || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError("");
    setDecisionMessage("");
    try {
      const response = await tenantFetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          analysisId: selectedAnalysis.analysisId,
          action,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      const payload = await response.json() as ApprovalResponse | ApiError;
      if (!response.ok || !("success" in payload) || payload.success !== true || !payload.auditEntry || !payload.approval) {
        throw new Error("error" in payload && payload.error ? payload.error : "The server did not confirm this decision.");
      }
      setDecisionEntry(payload.auditEntry);
      setDecisionMessage(`Server recorded “${payload.approval.status.replaceAll("_", " ")}" for this analysis.`);
      setSelectedAnalysis({ ...selectedAnalysis, approval: payload.approval });
      setNotes("");
      setQueueLoading(true);
      await loadQueueAndAudit();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The decision could not be submitted.");
    } finally {
      setDecisionBusy(false);
    }
  }

  const selectedQueueItem = queue.find((item) => item.analysisId === selectedId);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Approvals"
        description="Review analyses that the API marked as pending, record a decision, and inspect its audit entry."
        meta={<StatusPill tone="neutral">Seeded demo workflow</StatusPill>}
      />
      {session && !canDecideApprovals(role) ? <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-ink" role="status">Your {role || "current"} role does not allow approval decisions. The server remains the source of permission checks.</p> : null}
      {session && !workspaceId ? <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-ink" role="status">Select an organization and workspace in the header to view its approval queue.</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">{queueLoading ? "Loading approval queue…" : `${queue.length} pending ${queue.length === 1 ? "analysis" : "analyses"}`}</p>
        <button
          type="button"
          onClick={() => { setQueueLoading(true); setQueueError(""); setAuditError(""); void loadQueueAndAudit(); }}
          disabled={queueLoading}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-canvas disabled:cursor-wait disabled:opacity-60"
        >
          {queueLoading ? "Refreshing…" : "Refresh queue and audit"}
        </button>
      </div>

      {queueError ? <p className="rounded-xl border border-negative/25 bg-negative-soft p-4 text-sm text-negative" role="alert">{queueError}</p> : null}
      {decisionError ? <p className="rounded-xl border border-negative/25 bg-negative-soft p-4 text-sm text-negative" role="alert">{decisionError}</p> : null}
      {decisionMessage ? <p className="rounded-xl border border-positive/20 bg-positive-soft p-4 text-sm text-positive" role="status">{decisionMessage}</p> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <section className="min-w-0 rounded-xl border border-line bg-card p-4" aria-labelledby="pending-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pending-title" className="font-semibold text-ink">Pending queue</h2>
            <StatusPill tone="pending">{String(queue.length)}</StatusPill>
          </div>
          {queueLoading && queue.length === 0 ? <p className="py-8 text-center text-sm text-muted" role="status">Loading pending analyses…</p> : null}
          {!queueLoading && !queueError && queue.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-medium text-ink">No pending approvals</p>
              <p className="mt-1 text-sm text-muted">Run an analysis to create a review item when the API returns pending approval.</p>
              <Link href="/analysis" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90">Open AI Analysis</Link>
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
            {queue.map((item) => (
              <li key={item.analysisId}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(item.analysisId); setSelectedAnalysis(null); setDetailError(""); setDetailLoading(true); setDecisionEntry(null); setDecisionMessage(""); setDecisionError(""); }}
                  aria-pressed={selectedId === item.analysisId}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === item.analysisId ? "border-brand bg-brand-soft" : "border-line hover:bg-canvas"}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-5 text-ink">{item.question}</span>
                    <StatusPill tone="pending">Pending</StatusPill>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-muted">{item.findingsCount} findings · {item.declinedProducts.length ? item.declinedProducts.join(", ") : "No declined products listed"}</span>
                  <span className="mt-1 block text-xs text-muted">Created {formatDateTime(item.generatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="review-title">
          <div className="rounded-xl border border-line bg-card p-4 sm:p-5">
            <h2 id="review-title" className="font-semibold text-ink">Review analysis</h2>
            {!selectedId ? <p className="mt-2 text-sm text-muted">Select a pending analysis to read its findings and submit a decision.</p> : null}
            {detailLoading ? <p className="mt-3 text-sm text-muted" role="status">Loading selected analysis…</p> : null}
            {detailError ? <p className="mt-3 text-sm text-negative" role="alert">{detailError}</p> : null}
            {selectedAnalysis ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs text-muted">Question</p>
                  <p className="mt-1 text-sm leading-6 font-medium text-ink">{selectedAnalysis.question}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{selectedAnalysis.analysisId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={selectedAnalysis.status === "completed" ? "completed" : "failed"}>{selectedAnalysis.status}</StatusPill>
                  <StatusPill tone={approvalTone(selectedAnalysis.approval.status)}>{selectedAnalysis.approval.status.replaceAll("_", " ")}</StatusPill>
                  {selectedAnalysis.metadata?.aiProvider ? <span className="text-xs text-muted">Provider: {selectedAnalysis.metadata.aiProvider.name} · {selectedAnalysis.metadata.aiProvider.type === "deterministic_engine" ? "deterministic engine" : selectedAnalysis.metadata.aiProvider.status}</span> : null}
                </div>
                <p className="text-sm leading-6 text-muted">{selectedAnalysis.explanation.summary}</p>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Recommendations from API</h3>
                  {selectedAnalysis.approval.recommendations?.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-ink">
                      {selectedAnalysis.approval.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-sm text-muted">No recommendations were returned.</p>}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Findings</h3>
                  {selectedAnalysis.explanation.findings.length ? (
                    <ul className="mt-2 space-y-2">
                      {selectedAnalysis.explanation.findings.map((finding) => (
                        <li key={finding.id} className="rounded-lg bg-canvas p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-ink">{finding.title}</span><StatusPill tone={finding.verified ? "passed" : "pending"}>{finding.verified ? "Verified" : "Unverified"}</StatusPill></div>
                          <p className="mt-1 text-sm leading-5 text-muted">{finding.description}</p>
                          {finding.causalAnalysis?.hypotheses.length ? <p className="mt-2 text-xs leading-5 text-warning">Hypotheses: {finding.causalAnalysis.hypotheses.join("; ")}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-muted">No findings were returned.</p>}
                </div>
                {selectedQueueItem ? <p className="text-xs text-muted">Queue item created {formatDateTime(selectedQueueItem.generatedAt)}.</p> : null}
              </div>
            ) : null}
          </div>

          {selectedAnalysis?.approval.status === "pending" && (!session || canDecideApprovals(role)) ? (
            <form className="space-y-3 rounded-xl border border-line bg-card p-4 sm:p-5" onSubmit={(event) => event.preventDefault()}>
              <h3 className="font-semibold text-ink">Record a review decision</h3>
              <div>
                <label htmlFor="review-notes" className="block text-sm font-medium text-ink">Reviewer notes <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" placeholder="Add context for the audit record" />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    onClick={() => void submitDecision(item.action)}
                    disabled={decisionBusy || selectedAnalysis.approval.status !== "pending"}
                    className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.className}`}
                  >
                    {decisionBusy ? "Saving…" : item.label}
                  </button>
                ))}
              </div>
            </form>
          ) : null}

          {decisionEntry ? <AuditEntryCard entry={decisionEntry} title="Decision recorded by API" /> : null}
        </section>
      </div>

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="audit-history-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="audit-history-title" className="font-semibold text-ink">Audit history</h2><p className="mt-1 text-sm text-muted">Loaded from GET /api/audit.</p></div>
          <StatusPill tone="neutral">{`${audit.length} entries`}</StatusPill>
        </div>
        {auditError ? <p className="mt-3 text-sm text-negative" role="alert">{auditError}</p> : null}
        {!auditError && !audit.length ? <p className="mt-4 rounded-lg bg-canvas p-4 text-sm text-muted">The audit API returned no decisions.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {audit.map((entry) => <li key={entry.id} className="py-3"><AuditEntryCard entry={entry} /></li>)}
        </ul>
      </section>
      <p className="text-xs leading-5 text-muted">Demo audit history is held in process memory. It is not durable across restarts or server instances, and it is not tamper-proof or immutable.</p>
    </div>
  );
}

function AuditEntryCard({ entry, title }: { entry: AuditEntry; title?: string }) {
  return (
    <article className="rounded-lg bg-canvas p-3">
      {title ? <h3 className="text-sm font-semibold text-ink">{title}</h3> : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <StatusPill tone={approvalTone(entry.newStatus)}>{entry.newStatus.replaceAll("_", " ")}</StatusPill>
        <span className="text-ink">{entry.action.replaceAll("_", " ")}</span>
        <span className="text-muted">by {entry.reviewedBy}</span>
        <time className="text-xs text-muted" dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-muted">Analysis {entry.analysisId} · {entry.previousStatus} → {entry.newStatus}</p>
      <p className="mt-2 text-sm leading-5 text-ink">{entry.notes || "No reviewer notes recorded."}</p>
    </article>
  );
}

function approvalTone(status: ApprovalStatus) {
  switch (status) {
    case "approved": return "approved" as const;
    case "rejected": return "rejected" as const;
    case "changes_requested": return "changes_requested" as const;
    case "pending": return "pending" as const;
    default: return "neutral" as const;
  }
}

function formatDateTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : `${formatDay(value.slice(0, 10))} · ${timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
