import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as postAnalysis, GET as getAnalyses } from "../app/api/analysis/route";
import { GET as getAnalysisById } from "../app/api/analysis/[id]/route";
import { POST as postApprovalDirect } from "../app/api/analysis/[id]/approval/route";
import { POST as postApproval, GET as getApprovals } from "../app/api/approvals/route";
import { GET as getAudit } from "../app/api/audit/route";
import { GET as getAiStatus } from "../app/api/ai/status/route";
import { clearStore } from "./storage";

describe("API Contract Integration Tests", () => {
  beforeEach(() => {
    clearStore();
  });

  it("POST /api/analysis validates and executes analysis according to CONTRACT.md", async () => {
    const req = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      body: JSON.stringify({
        question:
          "Which products are affecting our current quarter's profit margin, and why?"
      }),
      headers: { "Content-Type": "application/json" }
    });

    const res = await postAnalysis(req);
    expect(res.status).toBe(200);

    const data = await res.json();

    // Verify all contract keys from Section 6
    expect(data.analysisId).toBeDefined();
    expect(data.status).toBe("completed");
    expect(data.question).toBe(
      "Which products are affecting our current quarter's profit margin, and why?"
    );
    expect(data.sql).toBeDefined();
    expect(data.validation).toEqual({ status: "passed", errors: [] });
    expect(data.execution.status).toBe("completed");
    expect(data.execution.rowCount).toBeGreaterThan(0);
    expect(Array.isArray(data.results)).toBe(true);
    expect(Array.isArray(data.evidence)).toBe(true);
    expect(data.explanation.summary).toBeDefined();
    expect(Array.isArray(data.explanation.findings)).toBe(true);
    expect(data.approval).toBeDefined();
    expect(data.approval.status).toBe("pending");

    // Verify GET /api/analysis lists it
    const listRes = await getAnalyses();
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.count).toBe(1);
    expect(listData.analyses[0].analysisId).toBe(data.analysisId);

    // Verify GET /api/analysis/[id] retrieves it
    const getByIdRes = await getAnalysisById(
      new NextRequest(`http://localhost:3000/api/analysis/${data.analysisId}`),
      { params: Promise.resolve({ id: data.analysisId }) }
    );
    expect(getByIdRes.status).toBe(200);
    const byIdData = await getByIdRes.json();
    expect(byIdData.analysisId).toBe(data.analysisId);
  });

  it("POST /api/analysis rejects invalid request bodies with 400", async () => {
    // Missing question
    const reqMissing = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" }
    });
    const resMissing = await postAnalysis(reqMissing);
    expect(resMissing.status).toBe(400);
    const missingData = await resMissing.json();
    expect(missingData.error).toContain("Invalid analysis request");

    // Empty question
    const reqEmpty = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      body: JSON.stringify({ question: "  " }),
      headers: { "Content-Type": "application/json" }
    });
    const resEmpty = await postAnalysis(reqEmpty);
    expect(resEmpty.status).toBe(400);

    // Invalid JSON
    const reqMalformed = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" }
    });
    const resMalformed = await postAnalysis(reqMalformed);
    expect(resMalformed.status).toBe(400);
  });

  it("processes approvals through /api/approvals and /api/analysis/[id]/approval", async () => {
    // First create an analysis
    const analysisReq = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      body: JSON.stringify({
        question:
          "Which products are affecting our current quarter's profit margin, and why?"
      }),
      headers: { "Content-Type": "application/json" }
    });
    const analysisRes = await postAnalysis(analysisReq);
    const analysis = await analysisRes.json();

    // 1. Submit approval via POST /api/approvals
    const approvalReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        analysisId: analysis.analysisId,
        action: "approve",
        reviewedBy: "sarah_operations",
        notes: "Approved supplier renegotiation."
      }),
      headers: { "Content-Type": "application/json" }
    });
    const approvalRes = await postApproval(approvalReq);
    expect(approvalRes.status).toBe(200);
    const approvalData = await approvalRes.json();
    expect(approvalData.success).toBe(true);
    expect(approvalData.approval.status).toBe("approved");

    // Verify audit trail via GET /api/audit
    const auditReq = new NextRequest(
      `http://localhost:3000/api/audit?analysisId=${analysis.analysisId}`
    );
    const auditRes = await getAudit(auditReq);
    expect(auditRes.status).toBe(200);
    const auditData = await auditRes.json();
    expect(auditData.count).toBe(1);
    expect(auditData.auditHistory[0].action).toBe("approve");

    // 2. Submit change request via POST /api/analysis/[id]/approval
    const directApprovalReq = new NextRequest(
      `http://localhost:3000/api/analysis/${analysis.analysisId}/approval`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "request_changes",
          reviewedBy: "cfo_alex",
          notes: "Need further analysis on marketing spend."
        }),
        headers: { "Content-Type": "application/json" }
      }
    );
    const directRes = await postApprovalDirect(directApprovalReq, {
      params: Promise.resolve({ id: analysis.analysisId })
    });
    expect(directRes.status).toBe(200);
    const directData = await directRes.json();
    expect(directData.approval.status).toBe("changes_requested");

    // Check GET /api/approvals
    const approvalsListRes = await getApprovals(
      new NextRequest(
        `http://localhost:3000/api/approvals?analysisId=${analysis.analysisId}`
      )
    );
    const approvalsListData = await approvalsListRes.json();
    expect(approvalsListData.count).toBe(2);
  });

  it("GET /api/ai/status reports verified state truthfully", async () => {
    const res = await getAiStatus();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.deterministicEngine).toBeDefined();
    expect(data.deterministicEngine.connected).toBe(true);
    expect(data.metaAI).toBeDefined();

    // In environment without META_AI_API_KEY, Meta AI must report unconfigured, NOT connected
    if (!process.env.META_AI_API_KEY) {
      expect(data.metaAI.connected).toBe(false);
      expect(data.metaAI.status).toBe("unconfigured");
    }
  });
});
