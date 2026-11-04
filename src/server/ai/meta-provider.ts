/**
 * Meta Model API provider for Muse Spark.
 * All calls are server-side. API generation requests are only made for analyses;
 * status verification uses Meta's unauthenticated service health endpoint.
 */

import type {
  AIProvider,
  ProviderVerificationResult,
  SqlGenerationParams,
  SqlGenerationResult
} from "./provider";
import type { AIProviderStatus } from "../types";

const DEFAULT_ENDPOINT = "https://api.meta.ai/v1/chat/completions";
const DEFAULT_STATUS_ENDPOINT = "https://api.meta.ai/v1/status";
const REQUEST_TIMEOUT_MS = 12_000;

export interface MetaProviderConfig {
  apiKey?: string;
  endpointUrl?: string;
  statusUrl?: string;
  modelName?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const SQL_OUTPUT_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "proofloop_sql_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        reasoning: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["sql", "reasoning", "confidence"],
      additionalProperties: false
    }
  }
} as const;

export class MetaAIProvider implements AIProvider {
  readonly name = "Meta Muse (Muse Spark)";
  readonly targetModel: string;
  readonly providerType = "ai_model" as const;

  private readonly apiKey?: string;
  private readonly endpointUrl: string;
  private readonly statusUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private verifiedStatus: ProviderVerificationResult | null = null;

  constructor(config?: MetaProviderConfig) {
    this.apiKey = config?.apiKey ?? process.env.MODEL_API_KEY;
    this.endpointUrl = config?.endpointUrl ?? process.env.META_MODEL_API_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.statusUrl = config?.statusUrl ?? DEFAULT_STATUS_ENDPOINT;
    this.targetModel = config?.modelName ?? process.env.META_MODEL_ID ?? "muse-spark-1.3";
    this.timeoutMs = config?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.fetcher = config?.fetcher ?? fetch;
  }

  async verifyConnection(): Promise<ProviderVerificationResult> {
    if (!this.apiKey?.trim()) {
      const result: ProviderVerificationResult = {
        connected: false,
        status: "unconfigured",
        errorMessage: "Meta Model API credentials are not configured. MODEL_API_KEY is missing from the server environment."
      };
      this.verifiedStatus = result;
      return result;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // The documented status endpoint is unauthenticated and does not consume
      // model credits. This confirms service reachability, not key validity.
      const response = await this.fetcher(this.statusUrl, {
        method: "GET",
        signal: controller.signal
      });
      const result: ProviderVerificationResult = response.ok
        ? { connected: true, status: "connected", verifiedAt: new Date().toISOString() }
        : { connected: false, status: "disconnected", errorMessage: `Meta Model API health check returned HTTP ${response.status}.` };
      this.verifiedStatus = result;
      return result;
    } catch (error) {
      const result: ProviderVerificationResult = {
        connected: false,
        status: "disconnected",
        errorMessage: controller.signal.aborted
          ? "Meta Model API health check timed out."
          : `Meta Model API health check failed: ${error instanceof Error ? error.message : "unknown error"}`
      };
      this.verifiedStatus = result;
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateSql(params: SqlGenerationParams): Promise<SqlGenerationResult> {
    const verification = this.verifiedStatus ?? await this.verifyConnection();
    if (!verification.connected) {
      throw new Error(`Meta Muse provider is unavailable: ${verification.errorMessage ?? "verification required"}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.targetModel,
          messages: [
            {
              role: "developer",
              content:
                "Return a compact SQL analysis plan as the requested JSON object. " +
                "The sql field must contain exactly one SQLite SELECT query, with no comments or markdown. " +
                "Only use the listed schema. Never propose writes, approvals, or unsupported claims.\n" +
                `Allowed schema: ${params.schemaDescription}`
            },
            {
              role: "user",
              content: `Business question: ${params.question}\nCurrent period is start-inclusive ${params.currentStart ?? "unspecified"} and end-exclusive ${params.currentEnd ?? "unspecified"}.`
            }
          ],
          response_format: SQL_OUTPUT_FORMAT
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Meta Model API authentication failed (HTTP ${response.status}).`);
        }
        throw new Error(`Meta Model API generation failed (HTTP ${response.status}).`);
      }

      const data: unknown = await response.json();
      const content = getMessageContent(data);
      if (!content) throw new Error("Meta Model API returned an empty or invalid completion.");

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Meta Model API returned invalid structured output.");
      }
      if (
        !isRecord(parsed) ||
        typeof parsed.sql !== "string" ||
        !parsed.sql.trim() ||
        typeof parsed.reasoning !== "string" ||
        typeof parsed.confidence !== "number" ||
        !Number.isFinite(parsed.confidence) ||
        parsed.confidence < 0 || parsed.confidence > 1
      ) {
        throw new Error("Meta Model API structured output did not match the SQL generation schema.");
      }
      return { sql: parsed.sql.trim(), reasoning: parsed.reasoning, confidence: parsed.confidence };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Meta Model API generation timed out.");
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getStatus(): Promise<AIProviderStatus> {
    const verification = this.verifiedStatus ?? await this.verifyConnection();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMessageContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === "string" ? first.message.content.trim() : null;
}
