import { describe, expect, it, beforeEach } from "vitest";
import {
  saveAnalysis,
  getAnalysis,
  recordApprovalDecision,
  getAuditHistory,
  clearStore
} from "./storage";
import type { AnalysisResponse } from "./types";

describe("Approval Workflow and Audit Trail", () => {
  beforeEach(() => {
    clearStore();
  });

  const createSampleAnalysis = (id: string): AnalysisResponse => ({
    analysisId: id,
    status: "completed",
    question: "Which products are affecting our margin?",
    sql: "SELECT * FROM products",
    validation: { status: "passed", errors: [] },
    execution: { status: "completed", rowCount: 6 },
    results: [],
    evidence: [],
    explanation: { summary: "Test summary", findings: [] },
    approval: {
      status: "pending",
      recommendations: ["Review supplier prices"]
    }
  });

  it("records an approval decision and logs audit history", () => {
    const analysis = createSampleAnalysis("analysis-001");
    saveAnalysis(analysis);

    const result = recordApprovalDecision({
      analysisId: "analysis-001",
      action: "approve",
      reviewedBy: "operations_director",
      notes: "Approved supplier contract renegotiation."
    });

    expect(result.success).toBe(true);
    expect(result.analysis?.approval.status).toBe("approved");
    expect(result.analysis?.approval.action).toBe("approve");
    expect(result.analysis?.approval.reviewedBy).toBe("operations_director");
    expect(result.analysis?.approval.notes).toBe(
      "Approved supplier contract renegotiation."
    );

    // Verify stored analysis updated
    const updated = getAnalysis("analysis-001");
    expect(updated?.approval.status).toBe("approved");

    // Verify audit log
    const auditLogs = getAuditHistory("analysis-001");
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("approve");
    expect(auditLogs[0].previousStatus).toBe("pending");
    expect(auditLogs[0].newStatus).toBe("approved");
    expect(auditLogs[0].reviewedBy).toBe("operations_director");
  });

  it("records request_changes action properly", () => {
    const analysis = createSampleAnalysis("analysis-002");
    saveAnalysis(analysis);

    const result = recordApprovalDecision({
      analysisId: "analysis-002",
      action: "request_changes",
      reviewedBy: "cfo",
      notes: "Need more data on shipping discount impact."
    });

    expect(result.success).toBe(true);
    expect(result.analysis?.approval.status).toBe("changes_requested");

    const audit = getAuditHistory("analysis-002");
    expect(audit[0].newStatus).toBe("changes_requested");
  });

  it("records reject action properly", () => {
    const analysis = createSampleAnalysis("analysis-003");
    saveAnalysis(analysis);

    const result = recordApprovalDecision({
      analysisId: "analysis-003",
      action: "reject",
      reviewedBy: "vp_sales",
      notes: "Rejecting price changes until holiday season ends."
    });

    expect(result.success).toBe(true);
    expect(result.analysis?.approval.status).toBe("rejected");
  });

  it("returns error for unknown analysis ID", () => {
    const result = recordApprovalDecision({
      analysisId: "unknown-id",
      action: "approve"
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
