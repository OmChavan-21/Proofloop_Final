import { describe, expect, it } from "vitest";
import { MetaAIProvider } from "./ai/meta-provider";
import { DeterministicProvider } from "./ai/deterministic-provider";
import { resolveAIProvider, getProviderStatuses } from "./ai";

describe("AI Provider Abstraction & Compliance Rules", () => {
  it("does not report Meta AI as connected unless verified", async () => {
    // Without credentials
    const unconfiguredMeta = new MetaAIProvider({ apiKey: "" });
    const verification = await unconfiguredMeta.verifyConnection();

    expect(verification.connected).toBe(false);
    expect(verification.status).toBe("unconfigured");
    expect(verification.errorMessage).toContain("META_AI_API_KEY is missing");
  });

  it("refuses to generate SQL from unverified Meta provider", async () => {
    const unconfiguredMeta = new MetaAIProvider({ apiKey: "" });

    await expect(
      unconfiguredMeta.generateSql({
        question: "What is our revenue?",
        schemaDescription: "products"
      })
    ).rejects.toThrow(/not connected/i);
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
    const provider = await resolveAIProvider();

    // In local dev without META_AI_API_KEY set, it should resolve to the deterministic engine
    if (!process.env.META_AI_API_KEY) {
      expect(provider.providerType).toBe("deterministic_engine");
      expect(provider.name).toContain("Deterministic");
    }
  });
});
