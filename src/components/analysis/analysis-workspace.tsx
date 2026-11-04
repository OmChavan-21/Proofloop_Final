"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ProductEvidence } from "@/engine/evidence";
import type { AIProviderStatus, AnalysisResponse, Finding } from "@/server/types";
import { formatDay, formatPercent, formatPoints } from "@/components/dashboard/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { useTenant } from "@/components/shell/tenant-context";
import { canRunAnalysis } from "@/lib/frontend-access";

type ProviderStatusResponse = {
  activeProvider: AIProviderStatus;
  metaAI: AIProviderStatus;
  deterministicEngine: AIProviderStatus;
};

const primaryQuestion = "Which products are affecting our current quarter's profit margin, and why?";

export function AnalysisWorkspace() {
  const { tenantFetch, role, session, workspaceId } = useTenant();
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [provider, setProvider] = useState<ProviderStatusResponse | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const loadProvider = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store", signal });
      const payload = await response.json() as ProviderStatusResponse | { error?: string };
      if (!response.ok || !("activeProvider" in payload)) {
        throw new Error("Provider status is currently unavailable.");
      }
      setProvider(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProviderError(error instanceof Error ? error.message : "Provider status is currently unavailable.");
    } finally {
      if (!signal?.aborted) setProviderLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadProvider(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadProvider]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 3 || submitting) return;

    setSubmitting(true);
    setRequestError("");
    setAnalysis(null);
    try {
      const response = await tenantFetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
        cache: "no-store",
      });
      const payload = await response.json() as AnalysisResponse | { error?: string };
      if ("analysisId" in payload && typeof payload.analysisId === "string") {
        setAnalysis(payload as AnalysisResponse);
        return;
      }
      setRequestError("error" in payload && payload.error ? payload.error : "The analysis request failed.");
    } catch {
      setRequestError("Could not reach the analysis API. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const providerName = analysis?.metadata?.aiProvider.name ?? provider?.activeProvider.name;
  const providerType = analysis?.metadata?.aiProvider.type;
  const isDeterministic = providerType === "deterministic_engine" || providerName?.toLowerCase().includes("deterministic") === true;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="AI Analysis"
        description="Ask a business question, then inspect the query, validation, results, and evidence returned by Proofloop."
        meta={<StatusPill tone="neutral">Seeded demo data</StatusPill>}
      />

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="provider-status-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="provider-status-title" className="text-sm font-semibold text-ink">Active analysis provider</h2>
            {providerLoading ? (
              <p className="mt-1 text-sm text-muted" role="status">Checking the provider status endpoint…</p>
            ) : providerError ? (
              <p className="mt-1 text-sm text-negative" role="alert">{providerError}</p>
            ) : provider ? (
              <>
                <p className="mt-1 text-sm font-medium text-ink">{provider.activeProvider.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {provider.activeProvider.status} · {provider.activeProvider.targetModel}
                  {provider.activeProvider.name.toLowerCase().includes("deterministic") ? ". Rule-based deterministic engine; this is not a live LLM." : ". Status supplied by the provider verification endpoint."}
                </p>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => { setProviderLoading(true); setProviderError(""); void loadProvider(); }}
            disabled={providerLoading}
            className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-canvas disabled:cursor-wait disabled:opacity-60"
          >
            {providerLoading ? "Checking…" : "Refresh status"}
          </button>
        </div>
      </section>

      {session && !canRunAnalysis(role) ? <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-ink" role="status">Your current role can inspect existing analyses, but it cannot run new analyses.</p> : null}
      {session && !workspaceId ? <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-ink" role="status">Select an organization and workspace in the header before running an analysis.</p> : null}
      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="question-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="question-title" className="text-base font-semibold text-ink">Ask a business question</h2>
            <p className="mt-1 text-sm text-muted">The current API validates the question and returns a completed or failed analysis synchronously.</p>
          </div>
          <button
            type="button"
            onClick={() => setQuestion(primaryQuestion)}
            className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm font-medium text-brand hover:bg-brand-soft"
          >
            Use primary example
          </button>
        </div>
        <form onSubmit={submitQuestion} className="mt-4 space-y-3">
          <label htmlFor="business-question" className="block text-sm font-medium text-ink">Business question</label>
          <textarea
            id="business-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            minLength={3}
            maxLength={1000}
            required
            rows={3}
            placeholder="For example: Which products are affecting our current quarter’s profit margin, and why?"
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-3 text-sm leading-6 text-ink placeholder:text-muted focus-visible:outline-offset-2"
            aria-describedby="question-help"
          />
          <p id="question-help" className="text-xs text-muted">3–1000 characters. Results use the seeded catalog only.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting || question.trim().length < 3 || (!!session && (!canRunAnalysis(role) || !workspaceId))}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Running analysis…" : "Run analysis"}
            </button>
            {submitting ? <span className="text-sm text-muted" role="status">Waiting for the API response…</span> : null}
          </div>
        </form>
        {requestError ? <p className="mt-3 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative" role="alert">{requestError}</p> : null}
      </section>

      {analysis ? (
        <AnalysisResult
          analysis={analysis}
          isDeterministic={isDeterministic}
          providerName={providerName}
        />
      ) : null}
    </div>
  );
}

function AnalysisResult({
  analysis,
  isDeterministic,
  providerName,
}: {
  analysis: AnalysisResponse;
  isDeterministic: boolean;
  providerName?: string;
}) {
  const columns = analysis.execution.columns?.length
    ? analysis.execution.columns
    : Object.keys(analysis.results[0] ?? {});
  const evidence = analysis.evidence as ProductEvidence[];

  return (
    <div className="space-y-5" aria-live="polite">
      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="analysis-response-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">API response</p>
            <h2 id="analysis-response-title" className="mt-1 text-lg font-semibold text-ink">Analysis result</h2>
          </div>
          <StatusPill tone={analysis.status === "completed" ? "completed" : analysis.status === "failed" ? "failed" : "pending"}>{analysis.status}</StatusPill>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink">{analysis.question}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Meta label="Analysis ID" value={analysis.analysisId} mono />
          <Meta label="Provider" value={providerName ?? "Not returned"} />
          <Meta label="Provider verification" value={analysis.metadata?.aiProvider ? `${analysis.metadata.aiProvider.status} · ${analysis.metadata.aiProvider.verified ? "verified" : "not verified"}` : "Not returned"} />
          <Meta label="Model / engine" value={analysis.metadata?.aiProvider.model ?? "Not returned"} mono />
          <Meta label="Data source" value={analysis.metadata?.isDemoData ? "Seeded demo data" : "Not marked as demo data"} />
        </dl>
        {isDeterministic ? <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm text-muted">The deterministic rules engine generated this response. No live LLM response is being presented.</p> : null}
        {analysis.explanation.summary ? <p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-ink">{analysis.explanation.summary}</p> : null}
        {analysis.status === "failed" && analysis.validation.errors.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-negative">
            {analysis.validation.errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4" aria-labelledby="validation-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="validation-title" className="font-semibold text-ink">SQL validation</h2>
            <StatusPill tone={analysis.validation.status}>{analysis.validation.status}</StatusPill>
          </div>
          {analysis.validation.errors.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-negative">{analysis.validation.errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul> : <p className="mt-2 text-sm text-muted">The API returned no validation errors.</p>}
        </section>
        <section className="rounded-xl border border-line bg-card p-4" aria-labelledby="execution-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="execution-title" className="font-semibold text-ink">Read-only execution</h2>
            <StatusPill tone={analysis.execution.status}>{analysis.execution.status}</StatusPill>
          </div>
          <p className="mt-2 text-sm text-muted">{analysis.execution.rowCount} returned rows{analysis.execution.truncated ? " · result truncated at the API limit" : ""}</p>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="sql-title">
        <h2 id="sql-title" className="font-semibold text-ink">Generated SQL</h2>
        {analysis.sql ? <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-[#20202a] p-4 font-mono text-xs leading-5 text-white">{analysis.sql}</pre> : <p className="mt-3 text-sm text-muted">No SQL was returned.</p>}
      </section>

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="results-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-title" className="font-semibold text-ink">Query result rows</h2>
          <StatusPill tone="neutral">{`${analysis.results.length} rows`}</StatusPill>
        </div>
        {analysis.results.length && columns.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">Rows returned by the validated read-only query</caption>
              <thead className="bg-canvas text-xs text-muted"><tr>{columns.map((column) => <th key={column} scope="col" className="px-3 py-2 font-medium">{column}</th>)}</tr></thead>
              <tbody>{analysis.results.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-line">{columns.map((column) => <td key={column} className="max-w-72 px-3 py-2 tabular-nums">{displayValue(row[column])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <p className="mt-3 rounded-lg bg-canvas px-3 py-4 text-sm text-muted">The API returned no result rows.</p>}
      </section>

      <section className="space-y-3" aria-labelledby="evidence-title">
        <div>
          <h2 id="evidence-title" className="text-lg font-semibold text-ink">Inspect evidence</h2>
          <p className="mt-1 text-sm text-muted">Transaction references and findings returned by this analysis.</p>
        </div>
        {evidence.length ? evidence.map((item) => (
          <EvidenceCard key={item.productId} item={item} analysis={analysis} />
        )) : <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">No product evidence was returned.</p>}
      </section>

      {analysis.approval.status === "pending" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4" aria-label="Approval required">
          <div>
            <p className="font-semibold text-ink">Human review is pending</p>
            <p className="mt-1 text-sm text-muted">The API returned {analysis.approval.recommendations?.length ?? 0} recommendation(s) for review.</p>
          </div>
          <Link href="/approvals" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90">Open approvals</Link>
        </section>
      ) : <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-muted">Approval status: {analysis.approval.status}.</p>}
    </div>
  );
}

function EvidenceCard({ item, analysis }: { item: ProductEvidence; analysis: AnalysisResponse }) {
  const finding = analysis.explanation.findings.find((entry) => entry.productId === item.productId);
  return (
    <article className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{item.productName}</h3>
          <p className="mt-0.5 font-mono text-xs text-muted">Product {item.productId} · result row {findResultRow(analysis, item.productId)}</p>
        </div>
        <StatusPill tone={item.status}>{item.status}</StatusPill>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Meta label="Q3 gross margin" value={formatPercent(item.previousMargin)} />
        <Meta label="Q4-to-date gross margin" value={formatPercent(item.currentMargin)} />
        <Meta label="Change" value={formatPoints(item.marginChange)} />
      </dl>
      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Complete Q3 transactions</h4>
          <p className="mt-1 text-sm text-ink">{item.previousTransactionCount} transactions · {formatDay(item.previousDateRange.start)} to (exclusive) {formatDay(item.previousDateRange.endExclusive)}</p>
          <p className="mt-1 break-words font-mono text-xs leading-5 text-muted">{item.previousTransactionIds.length ? item.previousTransactionIds.join(", ") : "No transaction IDs returned"}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Partial Q4 transactions</h4>
          <p className="mt-1 text-sm text-ink">{item.currentTransactionCount} transactions · {formatDay(item.currentDateRange.start)} to (exclusive) {formatDay(item.currentDateRange.endExclusive)}</p>
          <p className="mt-1 break-words font-mono text-xs leading-5 text-muted">{item.currentTransactionIds.length ? item.currentTransactionIds.join(", ") : "No transaction IDs returned"}</p>
        </div>
      </div>
      {finding ? <FindingDetail finding={finding} /> : null}
    </article>
  );
}

function FindingDetail({ finding }: { finding: Finding }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium text-ink">{finding.title}</h4>
        <StatusPill tone={finding.verified ? "passed" : "pending"}>{finding.verified ? "Verified finding" : "Unverified"}</StatusPill>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{finding.description}</p>
      {finding.causalAnalysis?.verifiedDrivers.length ? (
        <div className="mt-3 rounded-lg bg-positive-soft p-3">
          <h5 className="text-sm font-semibold text-positive">Verified drivers in returned transaction data</h5>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">{finding.causalAnalysis.verifiedDrivers.map((driver) => <li key={driver}>{driver}</li>)}</ul>
        </div>
      ) : null}
      {finding.causalAnalysis?.hypotheses.length ? (
        <div className="mt-3 rounded-lg bg-warning-soft p-3">
          <h5 className="text-sm font-semibold text-warning">Hypotheses · not verified by the data</h5>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">{finding.causalAnalysis.hypotheses.map((hypothesis) => <li key={hypothesis}>{hypothesis}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function findResultRow(analysis: AnalysisResponse, productId: string): string {
  const index = analysis.results.findIndex((row) => String(row.id ?? "") === productId);
  return index >= 0 ? String(index + 1) : "not present in SQL rows";
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className={`mt-1 break-words text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
