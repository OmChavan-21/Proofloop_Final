/**
 * AI Provider Abstraction Interface
 * Implements strict verification and boundary rules per CONTRACT.md
 */

import type { AIProviderStatus } from "../types";

export interface ProviderVerificationResult {
  connected: boolean;
  status: "connected" | "disconnected" | "unconfigured";
  errorMessage?: string;
  verifiedAt?: string;
}

export interface SqlGenerationResult {
  sql: string;
  reasoning?: string;
  confidence?: number;
}

export interface SqlGenerationParams {
  question: string;
  schemaDescription: string;
  currentStart?: string;
  currentEnd?: string;
}

export interface AIProvider {
  readonly name: string;
  readonly targetModel: string;
  readonly providerType: "ai_model" | "deterministic_engine";

  /**
   * Verifies connectivity to the model endpoint.
   * MUST NOT report connected unless verified against actual credentials/endpoint.
   */
  verifyConnection(): Promise<ProviderVerificationResult>;

  /**
   * Generates a read-only SQL query for the natural-language question.
   */
  generateSql(params: SqlGenerationParams): Promise<SqlGenerationResult>;

  /**
   * Gets safe public status without exposing API keys or secrets.
   */
  getStatus(): Promise<AIProviderStatus>;
}
