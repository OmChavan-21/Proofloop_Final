import { describe, expect, it, beforeEach } from "vitest";
import {
  saveAnalysis,
  getAnalysis,
  recordApprovalDecision,
  getAuditHistory,
  clearStore
} from "./storage";
import type { AnalysisResponse } from "./types";
import { withTenantContext } from "./auth/tenant-context";

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
      notes: "Approved supplier contract renegotiation."
    });

    expect(result.success).toBe(true);
    expect(result.analysis?.approval.status).toBe("approved");
    expect(result.analysis?.approval.action).toBe("approve");
    expect(result.analysis?.approval.reviewedBy).toBe("Demo reviewer (unverified)");
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
    expect(auditLogs[0].reviewedBy).toBe("Demo reviewer (unverified)");
  });

  it("records request_changes action properly", () => {
    const analysis = createSampleAnalysis("analysis-002");
    saveAnalysis(analysis);

    const result = recordApprovalDecision({
      analysisId: "analysis-002",
      action: "request_changes",
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

  it("rejects repeated or conflicting decisions without adding audit events", () => {
    saveAnalysis(createSampleAnalysis("analysis-once"));
    const first = recordApprovalDecision({ analysisId: "analysis-once", action: "approve" });
    const repeated = recordApprovalDecision({ analysisId: "analysis-once", action: "approve" });
    const conflicting = recordApprovalDecision({ analysisId: "analysis-once", action: "reject" });

    expect(first.success).toBe(true);
    expect(repeated).toMatchObject({ success: false, reason: "conflict" });
    expect(conflicting).toMatchObject({ success: false, reason: "conflict" });
    expect(getAnalysis("analysis-once")?.approval.status).toBe("approved");
    expect(getAuditHistory("analysis-once")).toHaveLength(1);
  });

  it("uses the explicit demo label when no authenticated session context exists", () => {
    saveAnalysis(createSampleAnalysis("analysis-demo-reviewer"));
    const result = recordApprovalDecision({
      analysisId: "analysis-demo-reviewer",
      action: "approve",
    });

    expect(result.analysis?.approval.reviewedBy).toBe("Demo reviewer (unverified)");
    expect(result.auditEntry?.reviewedBy).toBe("Demo reviewer (unverified)");
  });

  it("keeps analysis and audit state isolated by organization and workspace", () => {
    const tenantA = { userId: "user-a", organizationId: "org-a", role: "analyst" as const, workspaceId: "workspace-a" };
    const tenantB = { userId: "user-b", organizationId: "org-b", role: "analyst" as const, workspaceId: "workspace-b" };
    withTenantContext(tenantA, () => {
      saveAnalysis(createSampleAnalysis("tenant-analysis"));
      recordApprovalDecision({ analysisId: "tenant-analysis", action: "approve" });
    });

    withTenantContext(tenantB, () => {
      expect(getAnalysis("tenant-analysis")).toBeUndefined();
      expect(getAuditHistory("tenant-analysis")).toHaveLength(0);
    });
    withTenantContext(tenantA, () => {
      expect(getAnalysis("tenant-analysis")?.approval.status).toBe("approved");
      expect(getAuditHistory("tenant-analysis")).toHaveLength(1);
    });
  });

  it("records reviewer identity only from the authenticated server context", () => {
    const tenant = { userId: "session-user-7", organizationId: "org-a", role: "owner" as const, workspaceId: "workspace-a" };
    withTenantContext(tenant, () => {
      saveAnalysis(createSampleAnalysis("authenticated-reviewer"));
      const result = recordApprovalDecision({ analysisId: "authenticated-reviewer", action: "approve" });
      expect(result.auditEntry?.reviewedBy).toBe("session-user-7");
      expect(result.analysis?.approval.reviewedBy).toBe("session-user-7");
    });
  });
});
