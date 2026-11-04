import { describe, expect, it, beforeEach } from "vitest";
import { runAnalysisOrchestration } from "./orchestration";
import { clearStore } from "./storage";

describe("Post-Integration Correctness Verification", () => {
  beforeEach(() => {
    clearStore();
  });

  it("1. Enforces start-inclusive and end-exclusive SQL quarter boundaries (< '2026-12-01')", async () => {
    const result = await runAnalysisOrchestration({
      question:
        "Which products are affecting our current quarter's profit margin, and why?"
    });

    expect(result.status).toBe("completed");
    expect(result.validation.status).toBe("passed");

    // Must enforce both order_date >= '2026-10-01' and order_date < '2026-12-01'
    expect(result.sql).toMatch(/order_date\s*>=\s*'2026-10-01'/);
    expect(result.sql).toMatch(/order_date\s*<\s*'2026-12-01'/);
  });

  it("2. Distinguishes calendar quarter from actual partial-quarter coverage in metadata", async () => {
    const result = await runAnalysisOrchestration({
      question:
        "Which products are affecting our current quarter's profit margin, and why?"
    });

    const metadata = result.metadata;
    expect(metadata).toBeDefined();

    // Latest data date exposed
    expect(metadata?.latestDataDate).toBe("2026-11-02");
    expect(metadata?.isPartialQuarter).toBe(true);

    // Q3 complete vs Q4 partial quarter
    const qComp = metadata?.quarterComparison;
    expect(qComp?.comparisonPeriod.isPartial).toBe(false);
    expect(qComp?.comparisonPeriod.quarterType).toBe("complete");
    expect(qComp?.comparisonPeriod.calendarQuarter).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-10-01"
    });

    expect(qComp?.currentPeriod.isPartial).toBe(true);
    expect(qComp?.currentPeriod.quarterType).toBe("partial_quarter");
    expect(qComp?.currentPeriod.calendarQuarter).toEqual({
      start: "2026-10-01",
      endExclusive: "2026-12-01"
    });
    expect(qComp?.currentPeriod.actualDataCoverage.start).toBe("2026-10-08");
    expect(qComp?.currentPeriod.actualDataCoverage.end).toBe("2026-11-02");
    expect(qComp?.currentPeriod.latestDataDate).toBe("2026-11-02");

    // Regression check: metadata.dataCoverage.q4Coverage must report October 8 (not October 1)
    expect(metadata?.dataCoverage.q4Coverage).toContain("October 8");
    expect(metadata?.dataCoverage.q4Coverage).not.toContain("October 1 through");

    // Explanation never implies Q4 is complete and uses October 8 as actual data start
    expect(result.explanation.summary).toContain("partial quarter");
    expect(result.explanation.summary).toContain("October 8 through 2026-11-02");
    expect(result.explanation.summary).not.toContain("October 1 through 2026-11-02");
    expect(result.explanation.summary).toContain("complete Q3");
    expect(result.explanation.summary).toMatch(
      /should not be interpreted as a completed quarter/i
    );
  });

  it("3. Grounds causal explanations in transaction data and compares Q3 vs Q4 unit costs and discounts", async () => {
    const result = await runAnalysisOrchestration({
      question:
        "Which products are affecting our current quarter's profit margin, and why?"
    });

    const backpackFinding = result.explanation.findings.find(
      (f) => f.productId === "P001"
    );
    expect(backpackFinding).toBeDefined();

    const causal = backpackFinding?.causalAnalysis;
    expect(causal).toBeDefined();

    // P001 cost: $45 in Q3 -> $60 in Q4 (+$15/unit)
    expect(causal?.unitCostComparison.previous).toBe(45);
    expect(causal?.unitCostComparison.current).toBe(60);
    expect(causal?.unitCostComparison.delta).toBe(15);
    expect(causal?.unitCostComparison.verified).toBe(true);

    // P001 discount: $0 in Q3 -> $5 in Q4 (+$5/unit)
    expect(causal?.discountComparison.previous).toBe(0);
    expect(causal?.discountComparison.current).toBe(5);
    expect(causal?.discountComparison.delta).toBe(5);
    expect(causal?.discountComparison.verified).toBe(true);

    // Supporting transactions referenced
    expect(causal?.supportingTransactions).toContain("S007");
    expect(causal?.supportingTransactions).toContain("S010");

    // Finding description includes verified evidence and supporting transactions
    expect(backpackFinding?.description).toContain("Verified transaction evidence");
    expect(backpackFinding?.description).toContain("$45.00");
    expect(backpackFinding?.description).toContain("$60.00");
    expect(backpackFinding?.description).toContain("S007");

    // If driver cannot be established, must be explicitly labeled as hypothesis
    for (const finding of result.explanation.findings) {
      if (finding.causalAnalysis?.verifiedDrivers.length === 0) {
        expect(finding.causalAnalysis.hypotheses.length).toBeGreaterThan(0);
        expect(finding.causalAnalysis.hypotheses[0]).toContain(
          "Hypothesis requiring review"
        );
      }
    }
  });

  it("4. Uses percentage points (pp) terminology for margin changes, not relative percentage", async () => {
    const result = await runAnalysisOrchestration({
      question:
        "Which products are affecting our current quarter's profit margin, and why?"
    });

    const backpackFinding = result.explanation.findings.find(
      (f) => f.productId === "P001"
    );
    expect(backpackFinding).toBeDefined();

    // Unit must be percentage points
    expect(backpackFinding?.unit).toBe("percentage points");

    // Title must say 'percentage points' (e.g. 'declined by 18.16 percentage points')
    expect(backpackFinding?.title).toContain("percentage points");
    expect(backpackFinding?.title).not.toMatch(/declined by 18\.16%/);

    // Description must say 'percentage points'
    expect(backpackFinding?.description).toContain("percentage points");
    expect(backpackFinding?.description).not.toContain("changed by -18.16%");

    // Summary must use pp or percentage points
    expect(result.explanation.summary).toContain("-18.16 pp");
    expect(result.explanation.summary).not.toContain("(-18.16% to 36.84%)");
  });

  it("5. Regression test: Q4 actual data coverage accurately reports October 8 start in summary and metadata", async () => {
    const result = await runAnalysisOrchestration({
      question:
        "Which products are affecting our current quarter's profit margin, and why?"
    });

    // Calendar quarter window must remain 2026-10-01 to 2026-12-01 (exclusive)
    expect(result.metadata?.quarterComparison.calendarQuarter).toEqual({
      start: "2026-10-01",
      endExclusive: "2026-12-01"
    });

    // Actual transaction coverage start must be 2026-10-08, not 2026-10-01
    expect(result.metadata?.quarterComparison.actualDataCoverage).toEqual({
      start: "2026-10-08",
      end: "2026-11-02"
    });

    // metadata.dataCoverage.q4Coverage must use October 8
    expect(result.metadata?.dataCoverage.q4Coverage).toBe(
      "partial quarter (October 8 through 2026-11-02)"
    );

    // explanation.summary must explicitly state October 8
    expect(result.explanation.summary).toContain(
      "actual seeded data coverage: October 8 through 2026-11-02"
    );
    expect(result.explanation.summary).not.toContain(
      "actual seeded data coverage: October 1 through 2026-11-02"
    );
  });
});
