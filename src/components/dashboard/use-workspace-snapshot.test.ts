import { afterEach, describe, expect, it } from "vitest";
import { clearAllWorkspaceDatabases, loadWorkspaceSnapshot } from "../../engine/workspace-manager";
import { resolveWorkspaceSnapshotView } from "./snapshot-view";

afterEach(() => clearAllWorkspaceDatabases());

describe("workspace snapshot boundary", () => {
  it("does not expose demo data while auth or workspace data is unresolved", async () => {
    const demo = await loadWorkspaceSnapshot();
    expect(demo.products.length).toBeGreaterThan(0);
    const empty = await loadWorkspaceSnapshot("workspace-new");
    expect(empty.products).toEqual([]);
    expect(empty.q3.saleCount).toBe(0);
    expect(empty.q4.revenue).toBe(0);
    expect(empty.dataSource).toBe("workspace_data");

    const authLoading = resolveWorkspaceSnapshotView({
      sessionLoading: true, hasSession: false, organizationId: "", workspaceId: "", attempt: 0,
      initialSnapshot: demo, resolved: null, failure: null,
    });
    expect(authLoading).toMatchObject({ status: "loading", snapshot: null });

    const workspaceLoading = resolveWorkspaceSnapshotView({
      sessionLoading: false, hasSession: true, organizationId: "org-a", workspaceId: "workspace-new", attempt: 0,
      initialSnapshot: demo, resolved: null, failure: null,
    });
    expect(workspaceLoading).toMatchObject({ status: "loading", snapshot: null });
  });

  it("does not reuse a resolved snapshot from the previously selected workspace", async () => {
    const demo = await loadWorkspaceSnapshot();
    const view = resolveWorkspaceSnapshotView({
      sessionLoading: false, hasSession: true, organizationId: "org-a", workspaceId: "workspace-b", attempt: 0,
      initialSnapshot: demo,
      resolved: { organizationId: "org-a", workspaceId: "workspace-a", attempt: 0, snapshot: demo },
      failure: null,
    });
    expect(view).toMatchObject({ status: "loading", snapshot: null });
  });

  it("preserves the seeded demo view when there is no authenticated session", async () => {
    const demo = await loadWorkspaceSnapshot();
    const view = resolveWorkspaceSnapshotView({
      sessionLoading: false, hasSession: false, organizationId: "", workspaceId: "", attempt: 0,
      initialSnapshot: demo, resolved: null, failure: null,
    });
    expect(view).toMatchObject({ status: "demo", snapshot: demo });
  });

  it("reuses a server snapshot only for its exact organization and workspace", async () => {
    const demo = await loadWorkspaceSnapshot();
    expect(resolveWorkspaceSnapshotView({
      sessionLoading: false, hasSession: true, organizationId: "org-a", workspaceId: "workspace-a", attempt: 0,
      initialSnapshot: demo, initialOrganizationId: "org-a", initialWorkspaceId: "workspace-a", resolved: null, failure: null,
    })).toMatchObject({ status: "ready", snapshot: demo });

    expect(resolveWorkspaceSnapshotView({
      sessionLoading: false, hasSession: true, organizationId: "org-b", workspaceId: "workspace-a", attempt: 0,
      initialSnapshot: demo, initialOrganizationId: "org-a", initialWorkspaceId: "workspace-a", resolved: null, failure: null,
    })).toMatchObject({ status: "loading", snapshot: null });
  });
});
