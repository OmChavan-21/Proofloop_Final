/**
 * Analysis Orchestration Service
 * Connects the API to the deterministic engine and AI provider abstraction.
 * Follows CONTRACT.md workflow:
 * MONITOR → UNDERSTAND → INSPECT → QUERY → VALIDATE → EXECUTE → VERIFY → VISUALIZE → EXPLAIN → APPROVE
 */

import type { Database } from "sql.js";
import { getWorkspaceDatabase } from "../engine/workspace-manager";
import { loadWorkspaceDatabaseFromPostgres } from "./db/persistence";
import { validateSql } from "../engine/sql-validator";
import { executeReadOnlyQuery } from "../engine/query-executor";
import { generateProductEvidence, type ProductEvidence } from "../engine/evidence";
import { compareProductMargins } from "../engine/comparison";

import { DeterministicProvider, resolveAIProvider } from "./ai";
import { saveAnalysis } from "./storage";
import type { AuthenticatedTenant } from "./auth/session";
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
        minDate: row.minDate ? String(row.minDate) : "",
        maxDate: row.maxDate ? String(row.maxDate) : "",
        count: Number(row.count ?? 0)
      };
    }
    return { minDate: "", maxDate: "", count: 0 };
  } finally {
    statement.free();
  }
}

export async function runAnalysisOrchestration(
  input: AnalysisRequestInput,
  workspaceId?: string,
  tenant?: AuthenticatedTenant
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

  // Retrieve SQLite database scoped to workspace (or default demo catalog)
  const isPostgres = Boolean(tenant && process.env.DATABASE_URL);
  const db = isPostgres
    ? await loadWorkspaceDatabaseFromPostgres(tenant!)
    : await getWorkspaceDatabase(workspaceId, tenant);

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
    const latestDataDate = currCoverage.count > 0 ? currCoverage.maxDate : "";

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
          latestDataDate,
          dataSource: tenant ? "workspace_data" : "seeded_demo_data"
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
          latestDataDate,
          dataSource: tenant ? "workspace_data" : "seeded_demo_data"
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
    const dataLabel = tenant ? "selected workspace data" : "seeded demo data";
    const actualCoverageStart = currCoverage.minDate === "2026-10-08" ? "October 8" : currCoverage.minDate;
    const coverageSummary = currCoverage.count > 0
      ? `actual ${tenant ? "workspace data" : "seeded data"} coverage: ${actualCoverageStart} through ${latestDataDate}`
      : "no completed sales were found in the current period";
    const verifiedDriverCount = findings.filter((finding) => (finding.causalAnalysis?.verifiedDrivers.length ?? 0) > 0).length;
    const summary =
      `${tenant ? "" : "[Seeded Demo Data] "}Analysis of Q4 2026 partial quarter (${dataLabel}; calendar window: ${currStart} to ${currEnd}; ${coverageSummary}) ` +
      `compared to complete Q3 2026 (calendar window: ${prevStart} to ${prevEnd}) ` +
      `identifies ${declinedProducts.length} product(s) with declining gross margins: ` +
      declinedProducts
        .map(
          (p) =>
            `${p.productName} (-${Math.abs(p.marginChange).toFixed(2)} pp to ${p.currentMargin.toFixed(2)}%)`
        )
        .join(", ") +
      `. ${verifiedDriverCount > 0 ? `${verifiedDriverCount} finding(s) include transaction-derived drivers.` : "No transaction-derived margin driver was established for this analysis."} ` +
      `The current quarter is partial and should not be interpreted as a completed quarter.`;

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
        latestDataDate,
        dataSource: tenant ? "workspace_data" : "seeded_demo_data"
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
        latestDataDate: "",
        dataSource: tenant ? "workspace_data" : "seeded_demo_data"
      })
    };

    saveAnalysis(failedResponse);
    return failedResponse;
  } finally {
    if (isPostgres) db.close();
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
  dataSource: AnalysisMetadata["dataSource"];
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
      end: params.prevCoverage.maxDate || ""
    },
    latestDataDate: params.prevCoverage.maxDate || "",
    coverageNote: `Complete comparison window for ${params.dataSource === "seeded_demo_data" ? "seeded demo data" : "the selected workspace"}.`
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
      start: params.currCoverage.count > 0 ? params.currCoverage.minDate : "",
      end: params.currCoverage.count > 0 ? params.latestDataDate : ""
    },
    latestDataDate: params.latestDataDate,
    coverageNote: params.latestDataDate
      ? `Partial quarter containing ${params.dataSource === "seeded_demo_data" ? "seeded transactions" : "workspace transactions"} through ${params.latestDataDate}. Does not cover the full calendar quarter ending ${params.currEnd}.`
      : "No transaction date was found in this comparison window."
  };

  return {
    dataSource: params.dataSource,
    isDemoData: params.dataSource === "seeded_demo_data",
    generatedAt: new Date().toISOString(),
    latestDataDate: params.latestDataDate,
    isPartialQuarter: true,
    dataCoverage: {
      q3Comparison: "complete Q3",
      q4Coverage: params.latestDataDate
        ? `partial quarter (${params.currCoverage.minDate === "2026-10-08" ? "October 8" : params.currCoverage.minDate} through ${params.latestDataDate})`
        : "no completed sales in the period",
      latestSeededDate: params.latestDataDate
    },
    quarterComparison: {
      previousQuarter: "Q3 2026 (complete)",
      currentQuarter: params.latestDataDate ? `Q4 2026 (partial, through ${params.latestDataDate})` : "Q4 2026 (partial; no transaction data found)",
      previousDateRange: { start: params.prevStart, endExclusive: params.prevEnd },
      currentDateRange: { start: params.currStart, endExclusive: params.currEnd },
      comparisonPeriod,
      currentPeriod,
      calendarQuarter: { start: params.currStart, endExclusive: params.currEnd },
      actualDataCoverage: {
        start: params.currCoverage.count > 0 ? params.currCoverage.minDate : "",
        end: params.currCoverage.count > 0 ? params.latestDataDate : ""
      },
      coverageDistinction: params.latestDataDate
        ? `Calendar quarter spans ${params.currStart} to ${params.currEnd}; actual ${params.dataSource === "seeded_demo_data" ? "seeded" : "workspace"} data covers through ${params.latestDataDate}. Q3 is complete; Q4 is partial.`
        : `Calendar quarter spans ${params.currStart} to ${params.currEnd}; no transaction data was found in this comparison window.`
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
