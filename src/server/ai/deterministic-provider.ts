/**
 * Deterministic Engine Provider
 *
 * Provides verified, rule-based SQL generation for deterministic orchestration.
 * Transparently identifies itself as a deterministic engine, NEVER claiming to be Meta AI.
 */

import type {
  AIProvider,
  ProviderVerificationResult,
  SqlGenerationParams,
  SqlGenerationResult
} from "./provider";
import type { AIProviderStatus } from "../types";

export class DeterministicProvider implements AIProvider {
  readonly name = "Deterministic Engine (Rule-based)";
  readonly targetModel = "deterministic-rules-v1";
  readonly providerType = "deterministic_engine" as const;

  async verifyConnection(): Promise<ProviderVerificationResult> {
    return {
      connected: true,
      status: "connected",
      verifiedAt: new Date().toISOString()
    };
  }

  async generateSql(params: SqlGenerationParams): Promise<SqlGenerationResult> {
    const q = params.question.toLowerCase();
    const currStart = params.currentStart || "2026-10-01";
    const currEnd = params.currentEnd || "2026-12-01";

    // Check for margin / profit questions (including the primary demonstration question)
    if (
      q.includes("margin") ||
      q.includes("profit") ||
      q.includes("quarter") ||
      q.includes("affecting") ||
      q.includes("why")
    ) {
      return {
        sql: `SELECT p.id, p.name, p.category, SUM(si.quantity * (si.unit_price - si.discount)) AS revenue, SUM(si.quantity * si.unit_cost) AS total_cost FROM products p JOIN sale_items si ON p.id = si.product_id JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed' AND s.order_date >= '${currStart}' AND s.order_date < '${currEnd}' GROUP BY p.id, p.name, p.category`,
        confidence: 1.0,
        reasoning: `Target query calculates product-level revenue and costs enforcing start-inclusive ('${currStart}') and end-exclusive ('${currEnd}') quarter boundaries.`
      };
    }

    // Check for category questions
    if (q.includes("category") || q.includes("categories")) {
      return {
        sql: `SELECT p.category, COUNT(DISTINCT p.id) AS product_count, SUM(si.quantity) AS units_sold FROM products p JOIN sale_items si ON p.id = si.product_id GROUP BY p.category`,
        confidence: 0.9,
        reasoning: "Aggregate products and units sold grouped by category."
      };
    }

    // Check for sales / orders questions
    if (q.includes("sales") || q.includes("order") || q.includes("transactions")) {
      return {
        sql: `SELECT s.id, s.order_date, s.status, COUNT(si.id) AS item_count FROM sales s JOIN sale_items si ON s.id = si.sale_id WHERE s.status = 'completed' GROUP BY s.id, s.order_date, s.status`,
        confidence: 0.9,
        reasoning: "Lists completed sales transactions with item counts."
      };
    }

    // Default to product catalog overview
    return {
      sql: `SELECT p.id, p.name, p.category FROM products p`,
      confidence: 0.85,
      reasoning: "Overview of all active products in the demo catalog."
    };
  }

  async getStatus(): Promise<AIProviderStatus> {
    return {
      name: this.name,
      targetModel: this.targetModel,
      connected: true,
      status: "connected",
      lastVerifiedAt: new Date().toISOString()
    };
  }
}
