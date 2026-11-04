/**
 * Process-local in-memory storage for analyses and demo approval history.
 * This state is neither durable across restarts nor tamper-proof.
 * Bound to global scope to prevent cache eviction in Next.js development server.
 */

import type {
  AnalysisResponse,
  ApprovalAction,
  ApprovalStatus,
  AuditEntry,
  PendingApprovalItem
} from "./types";
import { currentReviewerIdentity, currentTenantScope } from "./auth/tenant-context";

interface StorageContainer {
  analyses: Map<string, AnalysisResponse>;
  auditLog: Array<{ scope: string; entry: AuditEntry }>;
}

declare global {
  var __proofloop_storage: StorageContainer | undefined;
}

function getStorage(): StorageContainer {
  if (!globalThis.__proofloop_storage) {
    globalThis.__proofloop_storage = {
      analyses: new Map(),
      auditLog: []
    };
  }
  return globalThis.__proofloop_storage;
}

function storageKey(id: string): string {
  return `${currentTenantScope()}\u0000${id}`;
}

export function saveAnalysis(analysis: AnalysisResponse): void {
  const store = getStorage();
  store.analyses.set(storageKey(analysis.analysisId), analysis);
}

export function getAnalysis(id: string): AnalysisResponse | undefined {
  const store = getStorage();
  return store.analyses.get(storageKey(id));
}

export function listAnalyses(): AnalysisResponse[] {
  const store = getStorage();
  return Array.from(store.analyses.entries()).filter(([key]) => key.startsWith(`${currentTenantScope()}\u0000`)).map(([, analysis]) => analysis).sort((a, b) => {
    const timeA = a.metadata?.generatedAt || "";
    const timeB = b.metadata?.generatedAt || "";
    return timeB.localeCompare(timeA);
  });
}

export function toPendingApprovalItem(a: AnalysisResponse): PendingApprovalItem {
      const fromEvidence = Array.isArray(a.evidence)
        ? (a.evidence as Array<{ status?: string; productName?: string }>)
            .filter((e) => e.status === "declined" && typeof e.productName === "string")
            .map((e) => e.productName as string)
        : [];

      const fromFindings = a.explanation?.findings
        ? a.explanation.findings
            .filter((f) => f.impact === "negative" || f.title.toLowerCase().includes("declined"))
            .map((f) => f.productName || f.title)
        : [];

      const combinedDeclined = fromEvidence.length > 0 ? fromEvidence : fromFindings;
      const declinedProducts = Array.from(new Set(combinedDeclined));

      return {
        analysisId: a.analysisId,
        question: a.question,
        generatedAt: a.metadata?.generatedAt || new Date().toISOString(),
        approvalStatus: "pending" as const,
        recommendations: a.approval.recommendations || [],
        findingsCount: a.explanation?.findings?.length || 0,
        declinedProducts
      };
}

export function listPendingApprovals(): PendingApprovalItem[] {
  const store = getStorage();
  const analyses = Array.from(store.analyses.entries()).filter(([key]) => key.startsWith(`${currentTenantScope()}\u0000`)).map(([, analysis]) => analysis);

  return analyses
    .filter((a) => a.approval.status === "pending")
    .map(toPendingApprovalItem)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export type ApprovalDecisionResult =
  | { success: true; auditEntry: AuditEntry; analysis: AnalysisResponse; reason?: never; error?: never }
  | { success: false; reason: "not_found" | "conflict"; error: string; auditEntry?: never; analysis?: never };

export function recordApprovalDecision(params: {
  analysisId: string;
  action: ApprovalAction;
  notes?: string;
}): ApprovalDecisionResult {
  const store = getStorage();
  const key = storageKey(params.analysisId);
  const analysis = store.analyses.get(key);

  if (!analysis) {
    return {
      success: false,
      reason: "not_found",
      error: `Analysis with ID '${params.analysisId}' not found.`
    };
  }

  const previousStatus = analysis.approval.status;
  if (previousStatus !== "pending") {
    return {
      success: false,
      reason: "conflict",
      error: `Approval decision conflict: analysis is no longer pending (current status: ${previousStatus}).`
    };
  }

  let newStatus: ApprovalStatus;

  switch (params.action) {
    case "approve":
      newStatus = "approved";
      break;
    case "reject":
      newStatus = "rejected";
      break;
    case "request_changes":
      newStatus = "changes_requested";
      break;
  }

  const now = new Date().toISOString();
  const reviewer = currentReviewerIdentity();

  const updatedAnalysis: AnalysisResponse = {
    ...analysis,
    approval: {
      ...analysis.approval,
      status: newStatus,
      action: params.action,
      reviewedAt: now,
      reviewedBy: reviewer,
      notes: params.notes || analysis.approval.notes || null
    }
  };

  // Record audit entry
  const auditEntry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    analysisId: params.analysisId,
    action: params.action,
    previousStatus,
    newStatus,
    reviewedBy: reviewer,
    notes: params.notes
  };

  // These mutations are synchronous. Roll the analysis back if appending its
  // corresponding audit entry fails, so the demo store cannot report only half
  // of the transition.
  store.analyses.set(key, updatedAnalysis);
  try {
  store.auditLog.push({ scope: currentTenantScope(), entry: auditEntry });
  } catch (error) {
    store.analyses.set(key, analysis);
    throw error;
  }

  return {
    success: true,
    auditEntry,
    analysis: updatedAnalysis
  };
}

export function getAuditHistory(analysisId?: string): AuditEntry[] {
  const store = getStorage();
  if (analysisId) {
    return store.auditLog
      .filter(({ scope, entry }) => scope === currentTenantScope() && entry.analysisId === analysisId)
      .map(({ entry }) => entry)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  return store.auditLog.filter(({ scope }) => scope === currentTenantScope()).map(({ entry }) => entry).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function clearStore(): void {
  const store = getStorage();
  store.analyses.clear();
  store.auditLog = [];
}
