/**
 * AI Provider Registry and Resolver
 */

import { MetaAIProvider } from "./meta-provider";
import { DeterministicProvider } from "./deterministic-provider";
import type { AIProvider } from "./provider";
import type { AIProviderStatus } from "../types";

export * from "./provider";
export * from "./meta-provider";
export * from "./deterministic-provider";

const metaProvider = new MetaAIProvider();
const deterministicProvider = new DeterministicProvider();

/**
 * Resolves the appropriate provider based on explicit configuration.
 * Never silently pretends a mock or deterministic engine is Meta AI.
 */
export async function resolveAIProvider(): Promise<AIProvider> {
  const metaVerification = await metaProvider.verifyConnection();

  if (metaVerification.connected) {
    return metaProvider;
  }

  // If Meta AI is not verified/configured, explicitly use the deterministic engine.
  // The returned provider explicitly announces itself as the Deterministic Engine.
  return deterministicProvider;
}

/**
 * Returns safe server-side AI provider statuses for inspection/health checks.
 * NEVER leaks API keys or internal credentials.
 */
export async function getProviderStatuses(): Promise<{
  activeProvider: AIProviderStatus;
  metaAI: AIProviderStatus;
  deterministicEngine: AIProviderStatus;
}> {
  const metaStatus = await metaProvider.getStatus();
  const deterministicStatus = await deterministicProvider.getStatus();

  const activeProvider = metaStatus.connected ? metaStatus : deterministicStatus;

  return {
    activeProvider,
    metaAI: metaStatus,
    deterministicEngine: deterministicStatus
  };
}
