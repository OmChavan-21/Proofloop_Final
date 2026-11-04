import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaAIProvider } from "./ai/meta-provider";
import { DeterministicProvider } from "./ai/deterministic-provider";
import { resolveAIProvider, getProviderStatuses } from "./ai";
import { runAnalysisOrchestration } from "./orchestration";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function completion(sql = "SELECT * FROM products") {
  return {
    choices: [{ message: { content: JSON.stringify({ sql, reasoning: "Plan: inspect approved product data.", confidence: 0.9 }) } }]
  };
}

describe("AI Provider Abstraction & Compliance Rules", () => {
  it("does not report Meta AI as connected unless verified", async () => {
    // Without credentials
    const unconfiguredMeta = new MetaAIProvider({ apiKey: "" });
    const verification = await unconfiguredMeta.verifyConnection();

    expect(verification.connected).toBe(false);
    expect(verification.status).toBe("unconfigured");
    expect(verification.errorMessage).toContain("MODEL_API_KEY is missing");
  });

  it("refuses to generate SQL from unverified Meta provider", async () => {
    const unconfiguredMeta = new MetaAIProvider({ apiKey: "" });

    await expect(
      unconfiguredMeta.generateSql({
        question: "What is our revenue?",
        schemaDescription: "products"
      })
    ).rejects.toThrow(/unavailable/i);
  });

  it("deterministic provider explicitly identifies as deterministic engine", async () => {
    const deterministic = new DeterministicProvider();
    expect(deterministic.providerType).toBe("deterministic_engine");
    expect(deterministic.name).toContain("Deterministic Engine");

    const status = await deterministic.getStatus();
    expect(status.connected).toBe(true);
    expect(status.status).toBe("connected");
  });

  it("provider statuses return safe public info without leaking secrets", async () => {
    const statuses = await getProviderStatuses();

    expect(statuses.activeProvider).toBeDefined();
    expect(statuses.metaAI).toBeDefined();
    expect(statuses.deterministicEngine).toBeDefined();

    // Verify no secret leakage
    const jsonString = JSON.stringify(statuses);
    expect(jsonString).not.toContain("api_key");
    expect(jsonString).not.toContain("secret");
  });

  it("resolveAIProvider does not falsely claim Meta AI when unconfigured", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const provider = await resolveAIProvider();

    expect(provider.providerType).toBe("deterministic_engine");
    expect(provider.name).toContain("Deterministic");
  });

  it("uses the official Muse Spark endpoint and structured SQL output", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(jsonResponse(completion()));
    const provider = new MetaAIProvider({ apiKey: "test-token", fetcher });
    expect((await provider.verifyConnection()).connected).toBe(true);

    const generated = await provider.generateSql({
      question: "List products",
      schemaDescription: "products(id, name, category)"
    });

    expect(generated.sql).toBe("SELECT * FROM products");
    expect(provider.targetModel).toBe("muse-spark-1.3");
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    const body = JSON.parse(String(init?.body));
    expect(body.response_format.type).toBe("json_schema");
    expect(body.model).toBe("muse-spark-1.3");
  });

  it("rejects invalid structured responses", async () => {
    const provider = new MetaAIProvider({
      apiKey: "test-token",
      fetcher: vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }))
    });
    await provider.verifyConnection();
    await expect(provider.generateSql({ question: "q", schemaDescription: "products" }))
      .rejects.toThrow(/structured output/i);
  });

  it("reports authentication errors without leaking the key", async () => {
    const provider = new MetaAIProvider({
      apiKey: "secret-test-token",
      fetcher: vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
    });
    await provider.verifyConnection();
    await expect(provider.generateSql({ question: "q", schemaDescription: "products" }))
      .rejects.toThrow("authentication failed (HTTP 401)");
  });

  it("aborts generation requests that exceed the configured timeout", async () => {
    const fetcher: typeof fetch = vi.fn(((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return Promise.resolve(jsonResponse({ status: "ok" }));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }) as typeof fetch);
    const provider = new MetaAIProvider({ apiKey: "test-token", fetcher, timeoutMs: 5 });
    await provider.verifyConnection();
    await expect(provider.generateSql({ question: "q", schemaDescription: "products" }))
      .rejects.toThrow(/timed out/i);
  });

  it("falls back to deterministic SQL after Muse authentication failure", async () => {
    vi.stubEnv("MODEL_API_KEY", "test-token");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401)));

    const result = await runAnalysisOrchestration({ question: "Which products are affecting profit margin this quarter?" });
    expect(result.status).toBe("completed");
    expect(result.validation.status).toBe("passed");
    expect(result.metadata?.aiProvider.type).toBe("deterministic_engine");
    expect(result.metadata?.aiProvider.name).toContain("Deterministic Engine");
    expect(result.approval.status).not.toBe("approved");
  });
});
