import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getPendingApprovals } from "../app/api/approvals/pending/route";
import { GET as getPendingApprovalAlias } from "../app/api/approval/pending/route";
import { GET as getApprovals, POST as postApproval } from "../app/api/approvals/route";
import { GET as getApprovalAlias } from "../app/api/approval/route";
import {
  saveAnalysis,
  clearStore,
  recordApprovalDecision
} from "./storage";
import type { AnalysisResponse } from "./types";

describe("Pending Approvals Queue API", () => {
  const pendingRequest = () => new NextRequest("http://localhost:3000/api/approvals/pending");
  beforeEach(() => {
    clearStore();
  });

  const createSampleAnalysis = (
    id: string,
    status: AnalysisResponse["approval"]["status"] = "pending",
    generatedAt = new Date().toISOString()
  ): AnalysisResponse => ({
    analysisId: id,
    status: "completed",
    question: `Margin question for ${id}`,
    sql: "SELECT * FROM products",
    validation: { status: "passed", errors: [] },
    execution: { status: "completed", rowCount: 6 },
    results: [],
    evidence: [
      {
        productId: "P001",
        productName: "Classic Backpack",
        status: "declined",
        previousMargin: 55,
        currentMargin: 36.84,
        marginChange: -18.16,
        previousTransactionIds: ["S001"],
        currentTransactionIds: ["S007"],
        previousTransactionCount: 1,
        currentTransactionCount: 1,
        previousDateRange: { start: "2026-07-01", endExclusive: "2026-10-01" },
        currentDateRange: { start: "2026-10-01", endExclusive: "2026-12-01" }
      },
      {
        productId: "P002",
        productName: "Urban Sneakers",
        status: "declined",
        previousMargin: 54,
        currentMargin: 27,
        marginChange: -27,
        previousTransactionIds: ["S001"],
        currentTransactionIds: ["S007"],
        previousTransactionCount: 1,
        currentTransactionCount: 1,
        previousDateRange: { start: "2026-07-01", endExclusive: "2026-10-01" },
        currentDateRange: { start: "2026-10-01", endExclusive: "2026-12-01" }
      }
    ],
    explanation: {
      summary: "Sample summary",
      findings: [
        {
          id: "f-1",
          title: "Classic Backpack declined",
          productId: "P001",
          productName: "Classic Backpack",
          description: "desc",
          metric: "Gross Margin",
          impact: "negative",
          verified: true
        },
        {
          id: "f-2",
          title: "Urban Sneakers declined",
          productId: "P002",
          productName: "Urban Sneakers",
          description: "desc",
          metric: "Gross Margin",
          impact: "negative",
          verified: true
        }
      ]
    },
    approval: {
      status,
      recommendations: ["Review supplier prices"]
    },
    metadata: {
      dataSource: "seeded_demo_data",
      isDemoData: true,
      generatedAt,
      latestDataDate: "2026-11-02",
      isPartialQuarter: true,
      dataCoverage: {
        q3Comparison: "complete Q3",
        q4Coverage: "partial quarter (October 8 through 2026-11-02)",
        latestSeededDate: "2026-11-02"
      },
      quarterComparison: {
        previousQuarter: "Q3 2026",
        currentQuarter: "Q4 2026",
        previousDateRange: { start: "2026-07-01", endExclusive: "2026-10-01" },
        currentDateRange: { start: "2026-10-01", endExclusive: "2026-12-01" },
        comparisonPeriod: {
          label: "Q3 2026",
          quarterType: "complete",
          isPartial: false,
          calendarQuarter: { start: "2026-07-01", endExclusive: "2026-10-01" },
          actualDataCoverage: { start: "2026-07-10", end: "2026-09-22" },
          latestDataDate: "2026-09-22",
          coverageNote: "note"
        },
        currentPeriod: {
          label: "Q4 2026 (Partial)",
          quarterType: "partial_quarter",
          isPartial: true,
          calendarQuarter: { start: "2026-10-01", endExclusive: "2026-12-01" },
          actualDataCoverage: { start: "2026-10-08", end: "2026-11-02" },
          latestDataDate: "2026-11-02",
          coverageNote: "note"
        },
        calendarQuarter: { start: "2026-10-01", endExclusive: "2026-12-01" },
        actualDataCoverage: { start: "2026-10-08", end: "2026-11-02" },
        coverageDistinction: "distinction"
      },
      aiProvider: {
        name: "Deterministic Engine",
        model: "deterministic-rules-v1",
        type: "deterministic_engine",
        verified: true,
        status: "connected"
      }
    }
  });

  it("returns { pendingApprovals: [], count: 0 } when no pending records exist", async () => {
    const res = await getPendingApprovals(pendingRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      pendingApprovals: [],
      count: 0
    });
  });

  it("lists pending analyses with required properties", async () => {
    const analysis = createSampleAnalysis("analysis-001", "pending");
    saveAnalysis(analysis);

    const res = await getPendingApprovals(pendingRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.pendingApprovals).toHaveLength(1);

    const item = data.pendingApprovals[0];
    expect(item.analysisId).toBe("analysis-001");
    expect(item.question).toBe("Margin question for analysis-001");
    expect(item.approvalStatus).toBe("pending");
    expect(item.recommendations).toEqual(["Review supplier prices"]);
    expect(item.findingsCount).toBe(2);
    expect(item.declinedProducts).toEqual(["Classic Backpack", "Urban Sneakers"]);
    expect(item.generatedAt).toBeDefined();

    // Verify alias GET /api/approval/pending matches
    const aliasRes = await getPendingApprovalAlias(pendingRequest());
    const aliasData = await aliasRes.json();
    expect(aliasData).toEqual(data);
  });

  it("does not return approved, rejected, or changes_requested analyses", async () => {
    saveAnalysis(createSampleAnalysis("analysis-approved", "approved"));
    saveAnalysis(createSampleAnalysis("analysis-rejected", "rejected"));
    saveAnalysis(createSampleAnalysis("analysis-changes", "changes_requested"));
    saveAnalysis(createSampleAnalysis("analysis-not-req", "not_required"));

    const res = await getPendingApprovals(pendingRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(0);
    expect(data.pendingApprovals).toHaveLength(0);
  });

  it("removes an analysis from pending queue once approved or changes requested", async () => {
    const analysis = createSampleAnalysis("analysis-live", "pending");
    saveAnalysis(analysis);

    // Initial check: is pending
    const beforeRes = await getPendingApprovals(pendingRequest());
    const beforeData = await beforeRes.json();
    expect(beforeData.count).toBe(1);

    // Submit request_changes decision
    recordApprovalDecision({
      analysisId: "analysis-live",
      action: "request_changes",
      notes: "Please re-evaluate shipping discounts."
    });

    // Check pending queue: must now be 0
    const afterRes = await getPendingApprovals(pendingRequest());
    const afterData = await afterRes.json();
    expect(afterData.count).toBe(0);
  });

  it("sorts multiple pending analyses newest first", async () => {
    const older = createSampleAnalysis(
      "analysis-older",
      "pending",
      "2026-11-04T01:00:00.000Z"
    );
    const newer = createSampleAnalysis(
      "analysis-newer",
      "pending",
      "2026-11-04T02:00:00.000Z"
    );

    saveAnalysis(older);
    saveAnalysis(newer);

    const res = await getPendingApprovals(pendingRequest());
    const data = await res.json();
    expect(data.count).toBe(2);
    expect(data.pendingApprovals[0].analysisId).toBe("analysis-newer");
    expect(data.pendingApprovals[1].analysisId).toBe("analysis-older");
  });

  it("preserves GET /api/approvals and GET /api/approval audit history contracts unchanged", async () => {
    saveAnalysis(createSampleAnalysis("analysis-audit", "pending"));

    // Make an approval decision to generate an audit entry
    const postReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        analysisId: "analysis-audit",
        action: "approve",
        reviewedBy: "operations_director"
      }),
      headers: { "Content-Type": "application/json" }
    });
    await postApproval(postReq);

    // Verify GET /api/approvals still returns { auditHistory: [...], count: ... }
    const getApprovalsReq = new NextRequest("http://localhost:3000/api/approvals");
    const approvalsRes = await getApprovals(getApprovalsReq);
    expect(approvalsRes.status).toBe(200);
    const approvalsData = await approvalsRes.json();
    expect(Array.isArray(approvalsData.auditHistory)).toBe(true);
    expect(approvalsData.count).toBe(1);
    expect(approvalsData.auditHistory[0].action).toBe("approve");

    // Verify GET /api/approval alias returns the same audit structure
    const aliasReq = new NextRequest("http://localhost:3000/api/approval");
    const aliasRes = await getApprovalAlias(aliasReq);
    const aliasData = await aliasRes.json();
    expect(aliasData).toEqual(approvalsData);
  });

  it("completes full decision lifecycle for approve, reject, and request_changes via POST /api/approvals", async () => {
    const actions: Array<{
      action: "approve" | "reject" | "request_changes";
      expectedApprovalStatus: "approved" | "rejected" | "changes_requested";
    }> = [
      { action: "approve", expectedApprovalStatus: "approved" },
      { action: "reject", expectedApprovalStatus: "rejected" },
      { action: "request_changes", expectedApprovalStatus: "changes_requested" }
    ];

    for (const { action, expectedApprovalStatus } of actions) {
      const id = `analysis-lifecycle-${action}`;
      saveAnalysis(createSampleAnalysis(id, "pending"));

      // Verify it starts in pending queue
      const initialQueueRes = await getPendingApprovals(pendingRequest());
      const initialQueueData = await initialQueueRes.json();
      expect(
        initialQueueData.pendingApprovals.some((a: { analysisId: string }) => a.analysisId === id)
      ).toBe(true);

      // Execute POST /api/approvals
      const postReq = new NextRequest("http://localhost:3000/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          analysisId: id,
          action,
          reviewedBy: `reviewer_${action}`,
          notes: `Decision notes for ${action}`
        }),
        headers: { "Content-Type": "application/json" }
      });
      const postRes = await postApproval(postReq);
      expect(postRes.status).toBe(200);

      const postData = await postRes.json();
      expect(postData.success).toBe(true);

      // 1. Updates analysis.approval.status
      expect(postData.approval.status).toBe(expectedApprovalStatus);
      expect(postData.approval.action).toBe(action);
      expect(postData.approval.reviewedBy).toBe("Demo reviewer (unverified)");
      expect(postData.approval.notes).toBe(`Decision notes for ${action}`);

      // 2. Preserves top-level analysis status as 'completed'
      expect(postData.analysis.status).toBe("completed");

      // 3. Creates an audit history entry
      expect(postData.auditEntry).toBeDefined();
      expect(postData.auditEntry.analysisId).toBe(id);
      expect(postData.auditEntry.action).toBe(action);
      expect(postData.auditEntry.previousStatus).toBe("pending");
      expect(postData.auditEntry.newStatus).toBe(expectedApprovalStatus);
      expect(postData.auditEntry.reviewedBy).toBe("Demo reviewer (unverified)");

      // 4. Removes the analysis from GET /api/approvals/pending and alias
      const queueRes = await getPendingApprovals(pendingRequest());
      const queueData = await queueRes.json();
      expect(
        queueData.pendingApprovals.some((a: { analysisId: string }) => a.analysisId === id)
      ).toBe(false);

      const aliasQueueRes = await getPendingApprovalAlias(pendingRequest());
      const aliasQueueData = await aliasQueueRes.json();
      expect(
        aliasQueueData.pendingApprovals.some((a: { analysisId: string }) => a.analysisId === id)
      ).toBe(false);
    }
  });

  it("handles invalid analysis IDs, invalid actions, and malformed bodies properly", async () => {
    // 1. Non-existent analysis ID -> 404
    const notFoundReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        analysisId: "non-existent-analysis-id",
        action: "approve"
      }),
      headers: { "Content-Type": "application/json" }
    });
    const notFoundRes = await postApproval(notFoundReq);
    expect(notFoundRes.status).toBe(404);
    const notFoundData = await notFoundRes.json();
    expect(notFoundData.error).toContain("not found");

    // 2. Invalid action -> 400
    saveAnalysis(createSampleAnalysis("analysis-for-invalid-action", "pending"));
    const invalidActionReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        analysisId: "analysis-for-invalid-action",
        action: "unauthorized_delete"
      }),
      headers: { "Content-Type": "application/json" }
    });
    const invalidActionRes = await postApproval(invalidActionReq);
    expect(invalidActionRes.status).toBe(400);
    const invalidActionData = await invalidActionRes.json();
    expect(invalidActionData.details[0]).toContain(
      "Action must be one of: 'approve', 'reject', or 'request_changes'."
    );

    // 3. Missing analysisId -> 400
    const missingIdReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        action: "approve"
      }),
      headers: { "Content-Type": "application/json" }
    });
    const missingIdRes = await postApproval(missingIdReq);
    expect(missingIdRes.status).toBe(400);

    // 4. Malformed JSON body -> 400
    const malformedReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" }
    });
    const malformedRes = await postApproval(malformedReq);
    expect(malformedRes.status).toBe(400);
  });

  it("returns 409 for repeated and stale decisions without duplicating audit history", async () => {
    saveAnalysis(createSampleAnalysis("analysis-stale", "pending"));
    const decision = (action: string) => postApproval(new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({ analysisId: "analysis-stale", action, reviewedBy: "forged-reviewer" }),
      headers: { "Content-Type": "application/json" }
    }));

    expect((await decision("approve")).status).toBe(200);
    const repeatedResponse = await decision("approve");
    expect(repeatedResponse.status).toBe(409);
    expect((await repeatedResponse.json()).code).toBe("APPROVAL_CONFLICT");
    expect((await decision("reject")).status).toBe(409);

    const history = await getApprovals(new NextRequest("http://localhost:3000/api/approvals?analysisId=analysis-stale"));
    const historyData = await history.json();
    expect(historyData.count).toBe(1);
    expect(historyData.auditHistory[0].reviewedBy).toBe("Demo reviewer (unverified)");
    expect(historyData.auditHistory[0].previousStatus).toBe("pending");
    expect(historyData.auditHistory[0].newStatus).toBe("approved");
  });
});
