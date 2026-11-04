import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthenticatedTenant } from "./session";

const context = new AsyncLocalStorage<AuthenticatedTenant | null>();

export function withTenantContext<T>(tenant: AuthenticatedTenant | null, callback: () => T): T {
  return context.run(tenant, callback);
}

export function currentTenantScope(): string {
  const tenant = context.getStore();
  return tenant ? `${tenant.organizationId}:${tenant.workspaceId ?? ""}` : "demo";
}

export function currentTenant() {
  return context.getStore() ?? null;
}

export function currentReviewerIdentity(): string {
  return context.getStore()?.userId ?? "Demo reviewer (unverified)";
}
