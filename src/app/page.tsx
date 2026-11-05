import { headers } from "next/headers";
import { resolveRequestTenant } from "@/server/auth/session";
import { createEmptySnapshot, loadWorkspaceSnapshot } from "@/engine/workspace-manager";
import { getPersistedWorkspaceSnapshot } from "@/server/db/persistence";
import { BusinessOverview } from "@/components/dashboard/business-overview";

export default async function Home() {
  const reqHeaders = await headers();
  let snapshot;
  let initialWorkspaceId: string | undefined;
  let initialOrganizationId: string | undefined;
  try {
    const tenant = await resolveRequestTenant(reqHeaders, "analysis:read");
    if (tenant && process.env.DATABASE_URL) {
      snapshot = await getPersistedWorkspaceSnapshot(tenant);
    } else if (tenant?.workspaceId) {
      snapshot = await loadWorkspaceSnapshot(tenant.workspaceId, tenant);
    } else if (process.env.DATABASE_URL) {
      snapshot = createEmptySnapshot("workspace_data");
    } else {
      snapshot = await loadWorkspaceSnapshot("demo");
    }
    if (tenant?.workspaceId) {
      initialWorkspaceId = tenant.workspaceId;
      initialOrganizationId = tenant.organizationId;
    }
  } catch {
    snapshot = process.env.DATABASE_URL
      ? createEmptySnapshot("workspace_data")
      : await loadWorkspaceSnapshot("demo");
  }

  return <BusinessOverview snapshot={snapshot} initialWorkspaceId={initialWorkspaceId} initialOrganizationId={initialOrganizationId} />;
}
