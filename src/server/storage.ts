/**
 * In-memory server-side storage for analyses and approval audit history.
 * Bound to global scope to prevent cache eviction in Next.js development server.
 */

import type {
  AnalysisResponse,
  ApprovalAction,
  ApprovalStatus,
  AuditEntry
} from "./types";

interface StorageContainer {
  analyses: Map<string, AnalysisResponse>;
  auditLog: AuditEntry[];
}

declare global {
  // eslint-disable-next-line no-var
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

export function saveAnalysis(analysis: AnalysisResponse): void {
  const store = getStorage();
  store.analyses.set(analysis.analysisId, analysis);
}

export function getAnalysis(id: string): AnalysisResponse | undefined {
  const store = getStorage();
  return store.analyses.get(id);
}

export function listAnalyses(): AnalysisResponse[] {
  const store = getStorage();
  return Array.from(store.analyses.values()).sort((a, b) => {
    const timeA = a.metadata?.generatedAt || "";
    const timeB = b.metadata?.generatedAt || "";
    return timeB.localeCompare(timeA);
  });
}

export function recordApprovalDecision(params: {
  analysisId: string;
  action: ApprovalAction;
  reviewedBy?: string;
  notes?: string;
}): {
  success: boolean;
  auditEntry?: AuditEntry;
  analysis?: AnalysisResponse;
  error?: string;
} {
  const store = getStorage();
  const analysis = store.analyses.get(params.analysisId);

  if (!analysis) {
    return {
      success: false,
      error: `Analysis with ID '${params.analysisId}' not found.`
    };
  }

  const previousStatus = analysis.approval.status;
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
  const reviewer = params.reviewedBy || "operations_lead";

  // Update analysis approval state
  analysis.approval = {
    ...analysis.approval,
    status: newStatus,
    action: params.action,
    reviewedAt: now,
    reviewedBy: reviewer,
    notes: params.notes || analysis.approval.notes || null
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

  store.auditLog.push(auditEntry);
  store.analyses.set(params.analysisId, analysis);

  return {
    success: true,
    auditEntry,
    analysis
  };
}

export function getAuditHistory(analysisId?: string): AuditEntry[] {
  const store = getStorage();
  if (analysisId) {
    return store.auditLog
      .filter((entry) => entry.analysisId === analysisId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  return [...store.auditLog].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
}

export function clearStore(): void {
  const store = getStorage();
  store.analyses.clear();
  store.auditLog = [];
}
