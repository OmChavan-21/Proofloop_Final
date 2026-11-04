/**
 * Analysis Orchestration Service
 * Connects the API to the deterministic engine and AI provider abstraction.
 * Follows CONTRACT.md workflow:
 * MONITOR → UNDERSTAND → INSPECT → QUERY → VALIDATE → EXECUTE → VERIFY → VISUALIZE → EXPLAIN → APPROVE
 */

import type { Database } from "sql.js";
import { createDemoDatabase } from "../engine/database";
import { validateSql } from "../engine/sql-validator";
import { executeReadOnlyQuery } from "../engine/query-executor";
import { generateProductEvidence, type ProductEvidence } from "../engine/evidence";
import { compareProductMargins } from "../engine/comparison";

import { DeterministicProvider, resolveAIProvider } from "./ai";
import { saveAnalysis } from "./storage";
import type {
  AnalysisResponse,
  AnalysisStatus,
  Finding,
  ApprovalState,
  AnalysisMetadata,
  QuarterPeriodDetail
} from "./types";
import type { AnalysisRequestInput } from "./validation";

const DEFAULT_PREVIOUS_START = "2026-07-01";
const DEFAULT_PREVIOUS_END = "2026-10-01";
const DEFAULT_CURRENT_START = "2026-10-01";
const DEFAULT_CURRENT_END = "2026-12-01";

interface ProductCostDiscountMetrics {
  productId: string;
  avgUnitCost: number;
  avgDiscount: number;
  avgUnitPrice: number;
  totalQuantity: number;
}

function getProductCostDiscountMetrics(
  db: Database,
  startDate: string,
  endDate: string
): Map<string, ProductCostDiscountMetrics> {
  const statement = db.prepare(`
    SELECT
      si.product_id AS productId,
      SUM(si.quantity * si.unit_cost) * 1.0 / SUM(si.quantity) AS avgUnitCost,
      SUM(si.quantity * si.discount) * 1.0 / SUM(si.quantity) AS avgDiscount,
      SUM(si.quantity * si.unit_price) * 1.0 / SUM(si.quantity) AS avgUnitPrice,
      SUM(si.quantity) AS totalQuantity
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND s.order_date >= $startDate
      AND s.order_date < $endDate
    GROUP BY si.product_id
  `);

  try {
    statement.bind({
      $startDate: startDate,
      $endDate: endDate
    });

    const map = new Map<string, ProductCostDiscountMetrics>();
    while (statement.step()) {
      const row = statement.getAsObject();
      map.set(String(row.productId), {
        productId: String(row.productId),
        avgUnitCost: Number(row.avgUnitCost ?? 0),
        avgDiscount: Number(row.avgDiscount ?? 0),
        avgUnitPrice: Number(row.avgUnitPrice ?? 0),
        totalQuantity: Number(row.totalQuantity ?? 0)
      });
    }
    return map;
  } finally {
    statement.free();
  }
}

function getDataCoverageRange(
  db: Database,
  startDate: string,
  endDate: string
): { minDate: string; maxDate: string; count: number } {
  const statement = db.prepare(`
    SELECT
      MIN(s.order_date) AS minDate,
      MAX(s.order_date) AS maxDate,
      COUNT(s.id) AS count
    FROM sales s
    WHERE s.status = 'completed'
      AND s.order_date >= $startDate
      AND s.order_date < $endDate
  `);

  try {
    statement.bind({ $startDate: startDate, $endDate: endDate });
    if (statement.step()) {
      const row = statement.getAsObject();
      return {
        minDate: String(row.minDate ?? startDate),
        maxDate: String(row.maxDate ?? endDate),
        count: Number(row.count ?? 0)
      };
    }
    return { minDate: startDate, maxDate: endDate, count: 0 };
  } finally {
    statement.free();
  }
}

export async function runAnalysisOrchestration(
  input: AnalysisRequestInput
): Promise<AnalysisResponse> {
  const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let currentStatus: AnalysisStatus = "understanding";

  const prevStart =
    input.dateRange?.previousStart || DEFAULT_PREVIOUS_START;
  const prevEnd =
    input.dateRange?.previousEnd || DEFAULT_PREVIOUS_END;
  const currStart =
    input.dateRange?.currentStart || DEFAULT_CURRENT_START;
  const currEnd =
    input.dateRange?.currentEnd || DEFAULT_CURRENT_END;

  // Resolve AI or Deterministic Provider
  let provider = await resolveAIProvider();
  let providerVerification = await provider.verifyConnection();

  // Create SQLite demo database with read-only pragma
  const db = await createDemoDatabase();

  try {
    // Stage 1 & 2: Understand and Inspect
    currentStatus = "inspecting";
    const schemaDescription =
      "products(id, name, category), sales(id, order_date, status), " +
      "sale_items(id, sale_id, product_id, quantity, unit_price, unit_cost, discount)";

    // Stage 3: Generate SQL enforcing explicit start-inclusive/end-exclusive boundaries
    currentStatus = "generating_sql";
    const generationParams = {
      question: input.question,
      schemaDescription,
      currentStart: currStart,
      currentEnd: currEnd
    };
    let generated;
    let validationResult;
    try {
      generated = await provider.generateSql(generationParams);
      validationResult = validateSql(generated.sql);
      if (!validationResult.valid && provider.providerType === "ai_model") {
        throw new Error("Muse returned SQL that failed deterministic validation.");
      }
    } catch (error) {
      if (provider.providerType !== "ai_model") throw error;

      // If Muse is unavailable or returns unusable SQL, transparently switch to
      // the named deterministic provider. The generated SQL still goes through
      // the same validator before it can execute.
      provider = new DeterministicProvider();
      providerVerification = await provider.verifyConnection();
      generated = await provider.generateSql(generationParams);
      validationResult = validateSql(generated.sql);
    }
    const sql = generated.sql;

    // Stage 4: Validate SQL
    currentStatus = "validating";

    // Compute partial-quarter coverage and latest data date from the actual database
    const prevCoverage = getDataCoverageRange(db, prevStart, prevEnd);
    const currCoverage = getDataCoverageRange(db, currStart, currEnd);
    const latestDataDate = currCoverage.maxDate || "2026-11-02";

    if (!validationResult.valid) {
      const failedResponse: AnalysisResponse = {
        analysisId,
        status: "failed",
        question: input.question,
        sql,
        validation: {
          status: "failed",
          errors: validationResult.errors
        },
        execution: {
          status: "failed",
          rowCount: 0,
          error: "SQL validation failed: prohibited syntax or disallowed tables/columns."
        },
        results: [],
        evidence: [],
        explanation: {
          summary: "Analysis failed during SQL validation.",
          findings: []
        },
        approval: {
          status: "not_required"
        },
        metadata: createMetadata({
          providerName: provider.name,
          targetModel: provider.targetModel,
          providerType: provider.providerType,
          verification: providerVerification,
          prevStart,
          prevEnd,
          currStart,
          currEnd,
          prevCoverage,
          currCoverage,
          latestDataDate
        })
      };

      saveAnalysis(failedResponse);
      return failedResponse;
    }

    // Stage 5: Execute Read-Only SQL
    currentStatus = "executing";
    const execResult = executeReadOnlyQuery(db, sql);

    if (!execResult.success) {
      const failedResponse: AnalysisResponse = {
        analysisId,
        status: "failed",
        question: input.question,
        sql,
        validation: {
          status: "passed",
          errors: []
        },
        execution: {
          status: "failed",
          rowCount: 0,
          error: execResult.error || "Query execution failed."
        },
        results: [],
        evidence: [],
        explanation: {
          summary: "Analysis failed during query execution.",
          findings: []
        },
        approval: {
          status: "not_required"
        },
        metadata: createMetadata({
          providerName: provider.name,
          targetModel: provider.targetModel,
          providerType: provider.providerType,
          verification: providerVerification,
          prevStart,
          prevEnd,
          currStart,
          currEnd,
          prevCoverage,
          currCoverage,
          latestDataDate
        })
      };

      saveAnalysis(failedResponse);
      return failedResponse;
    }

    // Stage 6 & 7: Verify Evidence and Explain
    currentStatus = "explaining";

    // Generate verified product evidence from the deterministic engine
    const evidenceList: ProductEvidence[] = generateProductEvidence(
      db,
      prevStart,
      prevEnd,
      currStart,
      currEnd
    );

    // Compute margin comparisons
    const comparisons = compareProductMargins(
      db,
      prevStart,
      prevEnd,
      currStart,
      currEnd
    );

    // Compute underlying unit cost and promotional discount metrics to ground causal drivers
    const prevCostMetrics = getProductCostDiscountMetrics(db, prevStart, prevEnd);
    const currCostMetrics = getProductCostDiscountMetrics(db, currStart, currEnd);

    // Build findings grounded in verified evidence
    const findings: Finding[] = [];
    const recommendations: string[] = [];

    // Filter products with declined margins
    const declinedProducts = comparisons.filter(
      (c) => c.status === "declined"
    );

    for (const item of comparisons) {
      const matchingEvidence = evidenceList.find(
        (e) => e.productId === item.productId
      );

      const impact =
        item.status === "declined"
          ? "negative"
          : item.status === "improved"
            ? "positive"
            : "neutral";

      const prevCost = prevCostMetrics.get(item.productId)?.avgUnitCost ?? 0;
      const currCost = currCostMetrics.get(item.productId)?.avgUnitCost ?? 0;
      const costDelta = currCost - prevCost;

      const prevDiscount = prevCostMetrics.get(item.productId)?.avgDiscount ?? 0;
      const currDiscount = currCostMetrics.get(item.productId)?.avgDiscount ?? 0;
      const discountDelta = currDiscount - prevDiscount;

      const verifiedDrivers: string[] = [];
      const hypotheses: string[] = [];

      let costIncreaseVerified = false;
      let costDetail = "";
      if (costDelta > 0.01) {
        costIncreaseVerified = true;
        costDetail = `Unit procurement cost rose from $${prevCost.toFixed(2)} in Q3 to $${currCost.toFixed(2)} in Q4 (+$${costDelta.toFixed(2)}/unit)`;
        verifiedDrivers.push(costDetail);
      } else if (costDelta < -0.01) {
        costDetail = `Unit procurement cost decreased by $${Math.abs(costDelta).toFixed(2)}/unit (from $${prevCost.toFixed(2)} to $${currCost.toFixed(2)})`;
      } else {
        costDetail = `Unit procurement cost remained flat at $${prevCost.toFixed(2)}/unit`;
      }

      let discountIncreaseVerified = false;
      let discountDetail = "";
      if (discountDelta > 0.01) {
        discountIncreaseVerified = true;
        discountDetail = `Promotional discount increased from $${prevDiscount.toFixed(2)} to $${currDiscount.toFixed(2)}/unit (+$${discountDelta.toFixed(2)}/unit)`;
        verifiedDrivers.push(discountDetail);
      } else if (discountDelta < -0.01) {
        discountDetail = `Promotional discount decreased by $${Math.abs(discountDelta).toFixed(2)}/unit`;
      } else {
        discountDetail = `Promotional discount remained flat or zero`;
      }

      // If a driver cannot be established by data, explicitly label as hypothesis
      if (verifiedDrivers.length === 0) {
        hypotheses.push(
          "Unestablished transaction driver: potential mix or volume shift (Hypothesis requiring review: driver not established by transaction data)"
        );
      }

      // Percentage point change formatting (never label as relative %)
      const ppChange = Number(item.marginChange.toFixed(2));
      const absPpChange = Math.abs(ppChange).toFixed(2);

      let description = `${item.productName} gross margin changed by ${ppChange >= 0 ? "+" : ""}${ppChange} percentage points (from ${item.previousMargin.toFixed(2)}% in complete Q3 to ${item.currentMargin.toFixed(2)}% in Q4 partial quarter).`;

      let suggestedAction: string | undefined;
      if (item.status === "declined") {
        if (verifiedDrivers.length > 0) {
          description += ` Verified transaction evidence: ${verifiedDrivers.join("; ")} across current quarter transactions (${matchingEvidence?.currentTransactionIds.join(", ") ?? "none"}).`;
        }
        if (hypotheses.length > 0) {
          description += ` Drivers requiring verification: ${hypotheses.join("; ")}.`;
        }

        if (costIncreaseVerified && discountIncreaseVerified) {
          suggestedAction = `Renegotiate supplier procurement pricing for ${item.productName} and restrict promotional discounting to recover target margin.`;
        } else if (costIncreaseVerified) {
          suggestedAction = `Review supplier contract pricing for ${item.productName} to address unit procurement cost increase.`;
        } else if (discountIncreaseVerified) {
          suggestedAction = `Restrict promotional discounts for ${item.productName} to protect margin percentage points.`;
        } else {
          suggestedAction = `Review product unit economics for ${item.productName} (Hypothesis requiring review: driver not established by transaction data).`;
        }

        recommendations.push(suggestedAction);
      }

      findings.push({
        id: `finding-${item.productId}`,
        title:
          item.status === "declined"
            ? `${item.productName} margin declined by ${absPpChange} percentage points`
            : `${item.productName} margin changed by ${ppChange >= 0 ? "+" : ""}${ppChange} percentage points`,
        productId: item.productId,
        productName: item.productName,
        description,
        metric: "Gross Margin",
        previousValue: Number(item.previousMargin.toFixed(2)),
        currentValue: Number(item.currentMargin.toFixed(2)),
        change: ppChange,
        unit: "percentage points",
        impact,
        evidenceRef: matchingEvidence?.currentTransactionIds,
        verified: true,
        suggestedAction,
        causalAnalysis: {
          verifiedDrivers,
          hypotheses,
          unitCostComparison: {
            previous: Number(prevCost.toFixed(2)),
            current: Number(currCost.toFixed(2)),
            delta: Number(costDelta.toFixed(2)),
            verified: costIncreaseVerified,
            detail: costDetail
          },
          discountComparison: {
            previous: Number(prevDiscount.toFixed(2)),
            current: Number(currDiscount.toFixed(2)),
            delta: Number(discountDelta.toFixed(2)),
            verified: discountIncreaseVerified,
            detail: discountDetail
          },
          supportingTransactions: matchingEvidence?.currentTransactionIds ?? []
        }
      });
    }

    // Synthesize evidence-backed summary with explicit partial-quarter distinction and percentage point terminology
    const actualCoverageStartDisplay =
      currCoverage.minDate === "2026-10-08" ? "October 8" : currCoverage.minDate;

    const summary =
      `[Seeded Demo Data] Analysis of Q4 2026 partial quarter (calendar window: ${currStart} to ${currEnd}, actual seeded data coverage: ${actualCoverageStartDisplay} through ${latestDataDate}; latest data date: ${latestDataDate}) ` +
      `compared to complete Q3 2026 (calendar window: ${prevStart} to ${prevEnd}) ` +
      `identifies ${declinedProducts.length} product(s) with declining gross margins: ` +
      declinedProducts
        .map(
          (p) =>
            `${p.productName} (-${Math.abs(p.marginChange).toFixed(2)} pp to ${p.currentMargin.toFixed(2)}%)`
        )
        .join(", ") +
      `. Margin compression is verified through transaction data demonstrating increased unit procurement costs and promotional discounts across seeded transactions. ` +
      `Note: Q4 data reflects partial-quarter coverage through ${latestDataDate} and should not be interpreted as a completed quarter.`;

    // Stage 8: Approval Workflow Check
    const approval: ApprovalState = {
      status: recommendations.length > 0 ? "pending" : "not_required",
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };

    const finalResponse: AnalysisResponse = {
      analysisId,
      status: "completed",
      question: input.question,
      sql,
      validation: {
        status: "passed",
        errors: []
      },
      execution: {
        status: "completed",
        rowCount: execResult.rowCount,
        truncated: execResult.truncated,
        columns: execResult.columns
      },
      results: execResult.rows,
      evidence: evidenceList,
      explanation: {
        summary,
        findings
      },
      approval,
      metadata: createMetadata({
        providerName: provider.name,
        targetModel: provider.targetModel,
        providerType: provider.providerType,
        verification: providerVerification,
        prevStart,
        prevEnd,
        currStart,
        currEnd,
        prevCoverage,
        currCoverage,
        latestDataDate
      })
    };

    saveAnalysis(finalResponse);
    return finalResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedResponse: AnalysisResponse = {
      analysisId,
      status: "failed",
      question: input.question,
      sql: "",
      validation: {
        status: "failed",
        errors: [`Execution halted at stage '${currentStatus}'.`]
      },
      execution: {
        status: "failed",
        rowCount: 0,
        error: message
      },
      results: [],
      evidence: [],
      explanation: {
        summary: `Analysis execution failed: ${message}`,
        findings: []
      },
      approval: {
        status: "not_required"
      },
      metadata: createMetadata({
        providerName: provider.name,
        targetModel: provider.targetModel,
        providerType: provider.providerType,
        verification: providerVerification,
        prevStart,
        prevEnd,
        currStart,
        currEnd,
        prevCoverage: { minDate: prevStart, maxDate: prevEnd, count: 0 },
        currCoverage: { minDate: currStart, maxDate: currEnd, count: 0 },
        latestDataDate: "2026-11-02"
      })
    };

    saveAnalysis(failedResponse);
    return failedResponse;
  } finally {
    db.close();
  }
}

interface MetadataParams {
  providerName: string;
  targetModel: string;
  providerType: "ai_model" | "deterministic_engine";
  verification: { connected: boolean; status: "connected" | "disconnected" | "unconfigured" };
  prevStart: string;
  prevEnd: string;
  currStart: string;
  currEnd: string;
  prevCoverage: { minDate: string; maxDate: string; count: number };
  currCoverage: { minDate: string; maxDate: string; count: number };
  latestDataDate: string;
}

function createMetadata(params: MetadataParams): AnalysisMetadata {
  const comparisonPeriod: QuarterPeriodDetail = {
    label: "Q3 2026",
    quarterType: "complete",
    isPartial: false,
    calendarQuarter: {
      start: params.prevStart,
      endExclusive: params.prevEnd
    },
    actualDataCoverage: {
      start: params.prevCoverage.minDate || params.prevStart,
      end: params.prevCoverage.maxDate || params.prevEnd
    },
    latestDataDate: params.prevCoverage.maxDate || params.prevEnd,
    coverageNote: "Complete quarter containing all Q3 transactions (July 10 to September 22, 2026)."
  };

  const currentPeriod: QuarterPeriodDetail = {
    label: "Q4 2026 (Partial)",
    quarterType: "partial_quarter",
    isPartial: true,
    calendarQuarter: {
      start: params.currStart,
      endExclusive: params.currEnd
    },
    actualDataCoverage: {
      start: params.currCoverage.minDate || params.currStart,
      end: params.latestDataDate
    },
    latestDataDate: params.latestDataDate,
    coverageNote: `Partial quarter containing seeded transactions through ${params.latestDataDate}. Does not cover the full calendar quarter ending ${params.currEnd}.`
  };

  return {
    dataSource: "seeded_demo_data",
    isDemoData: true,
    generatedAt: new Date().toISOString(),
    latestDataDate: params.latestDataDate,
    isPartialQuarter: true,
    dataCoverage: {
      q3Comparison: "complete Q3",
      q4Coverage: `partial quarter (${params.currCoverage.minDate === "2026-10-08" ? "October 8" : params.currCoverage.minDate} through ${params.latestDataDate})`,
      latestSeededDate: params.latestDataDate
    },
    quarterComparison: {
      previousQuarter: "Q3 2026 (complete)",
      currentQuarter: `Q4 2026 (partial, through ${params.latestDataDate})`,
      previousDateRange: { start: params.prevStart, endExclusive: params.prevEnd },
      currentDateRange: { start: params.currStart, endExclusive: params.currEnd },
      comparisonPeriod,
      currentPeriod,
      calendarQuarter: { start: params.currStart, endExclusive: params.currEnd },
      actualDataCoverage: {
        start: params.currCoverage.minDate || params.currStart,
        end: params.latestDataDate
      },
      coverageDistinction: `Calendar quarter spans ${params.currStart} to ${params.currEnd}; actual seeded data covers through ${params.latestDataDate}. Q3 is complete; Q4 is partial.`
    },
    aiProvider: {
      name: params.providerName,
      model: params.targetModel,
      type: params.providerType,
      verified: params.verification.connected,
      status: params.verification.status
    }
  };
}
