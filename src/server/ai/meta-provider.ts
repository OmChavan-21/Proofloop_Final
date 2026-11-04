/**
 * Meta Models Provider Implementation (Llama)
 * Target integration per CONTRACT.md Section 2
 *
 * Strict Rules:
 * - SQL execution remains read-only.
 * - Never report connected unless verified against endpoint.
 * - Never silently fall back to another provider pretending to be Meta.
 * - Never expose secrets or keys.
 */

import type {
  AIProvider,
  ProviderVerificationResult,
  SqlGenerationParams,
  SqlGenerationResult
} from "./provider";
import type { AIProviderStatus } from "../types";

export interface MetaProviderConfig {
  apiKey?: string;
  endpointUrl?: string;
  modelName?: string;
}

export class MetaAIProvider implements AIProvider {
  readonly name = "Meta AI (Llama)";
  readonly targetModel: string;
  readonly providerType = "ai_model" as const;

  private readonly apiKey?: string;
  private readonly endpointUrl: string;
  private verifiedStatus: ProviderVerificationResult | null = null;

  constructor(config?: MetaProviderConfig) {
    this.apiKey =
      config?.apiKey ||
      process.env.META_AI_API_KEY ||
      process.env.LLAMA_API_KEY;
    this.endpointUrl =
      config?.endpointUrl ||
      process.env.META_AI_ENDPOINT ||
      "https://api.meta.ai/v1/chat/completions";
    this.targetModel =
      config?.modelName ||
      process.env.META_AI_MODEL ||
      "llama-3.3-70b-instruct";
  }

  async verifyConnection(): Promise<ProviderVerificationResult> {
    if (!this.apiKey || this.apiKey.trim() === "") {
      const result: ProviderVerificationResult = {
        connected: false,
        status: "unconfigured",
        errorMessage:
          "Meta AI credentials are not configured. META_AI_API_KEY is missing from server environment."
      };
      this.verifiedStatus = result;
      return result;
    }

    try {
      // Perform active verification handshake against the configured endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.targetModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const result: ProviderVerificationResult = {
          connected: false,
          status: "disconnected",
          errorMessage: `Meta AI endpoint responded with status ${response.status}: ${errorText.slice(0, 100)}`
        };
        this.verifiedStatus = result;
        return result;
      }

      const result: ProviderVerificationResult = {
        connected: true,
        status: "connected",
        verifiedAt: new Date().toISOString()
      };
      this.verifiedStatus = result;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result: ProviderVerificationResult = {
        connected: false,
        status: "disconnected",
        errorMessage: `Failed to reach Meta AI endpoint: ${message}`
      };
      this.verifiedStatus = result;
      return result;
    }
  }

  async generateSql(params: SqlGenerationParams): Promise<SqlGenerationResult> {
    const verification = this.verifiedStatus || (await this.verifyConnection());

    if (!verification.connected) {
      throw new Error(
        `Meta AI provider is not connected: ${verification.errorMessage || "Verification required"}. ` +
          "Per CONTRACT.md rules, requests cannot be processed by an unverified AI provider."
      );
    }

    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.targetModel,
        messages: [
          {
            role: "system",
            content:
              "You are Proofloop's SQL generator. Output ONLY a valid single SQLite read-only SELECT query. " +
              "Never include multiple statements, comments, or modifications. " +
              `Allowed schema:\n${params.schemaDescription}`
          },
          {
            role: "user",
            content: params.question
          }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(
        `Meta AI generation failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean SQL markdown code block fences if present
    const cleanSql = content
      .replace(/^```(sql)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    return {
      sql: cleanSql,
      confidence: 0.95,
      reasoning: "Generated by Meta Llama model via verified server-side endpoint."
    };
  }

  async getStatus(): Promise<AIProviderStatus> {
    const verification = this.verifiedStatus || (await this.verifyConnection());
    return {
      name: this.name,
      targetModel: this.targetModel,
      connected: verification.connected,
      status: verification.status,
      lastVerifiedAt: verification.verifiedAt,
      errorMessage: verification.errorMessage
    };
  }
}
