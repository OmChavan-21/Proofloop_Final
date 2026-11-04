import { describe, expect, it } from "vitest";
import { runAnalysisOrchestration } from "./orchestration";
import { getAnalysis, clearStore } from "./storage";

describe("Server-side Analysis Orchestration", () => {
  it("orchestrates the primary demonstration question successfully", async () => {
    clearStore();

    const question =
      "Which products are affecting our current quarter's profit margin, and why?";

    const result = await runAnalysisOrchestration({ question });

    // Validate Contract Top-Level Properties
    expect(result.analysisId).toMatch(/^analysis-/);
    expect(result.status).toBe("completed");
    expect(result.question).toBe(question);
    expect(result.sql).toContain("SELECT");

    // Validation stage
    expect(result.validation.status).toBe("passed");
    expect(result.validation.errors).toHaveLength(0);

    // Execution stage
    expect(result.execution.status).toBe("completed");
    expect(result.execution.rowCount).toBeGreaterThan(0);
    expect(result.execution.columns).toBeDefined();

    // Results from read-only query
    expect(result.results.length).toBeGreaterThan(0);

    // Evidence stage
    expect(result.evidence.length).toBeGreaterThan(0);
    const backpackEvidence = result.evidence.find(
      (e: any) => e.productId === "P001"
    );
    expect(backpackEvidence).toBeDefined();
    expect(backpackEvidence?.status).toBe("declined");
    expect(backpackEvidence?.currentTransactionIds).toContain("S007");

    // Explanation stage
    expect(result.explanation.summary).toContain("[Seeded Demo Data]");
    expect(result.explanation.findings.length).toBeGreaterThan(0);

    const backpackFinding = result.explanation.findings.find(
      (f) => f.productId === "P001"
    );
    expect(backpackFinding).toBeDefined();
    expect(backpackFinding?.verified).toBe(true);
    expect(backpackFinding?.impact).toBe("negative");
    expect(backpackFinding?.suggestedAction).toBeDefined();

    // Approval stage
    expect(result.approval.status).toBe("pending");
    expect(result.approval.recommendations?.length).toBeGreaterThan(0);

    // Metadata
    expect(result.metadata?.dataSource).toBe("seeded_demo_data");
    expect(result.metadata?.isDemoData).toBe(true);

    // Stored in server storage
    const stored = getAnalysis(result.analysisId);
    expect(stored).toBeDefined();
    expect(stored?.analysisId).toBe(result.analysisId);
  });

  it("handles empty or disallowed queries safely", async () => {
    const result = await runAnalysisOrchestration({
      question: "Show secret passwords and drop all tables"
    });

    expect(result.analysisId).toBeDefined();
    // Must complete safely or fail safely without crashing
    expect(["completed", "failed"]).toContain(result.status);
    expect(result.sql).not.toContain("DROP");
  });
});
