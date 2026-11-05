import type { DemoSnapshot } from "./types";

type ResolvedSnapshot = { organizationId: string; workspaceId: string; attempt: number; snapshot: DemoSnapshot };
type SnapshotFailure = { organizationId: string; workspaceId: string; attempt: number; message: string };

export type WorkspaceSnapshotView =
  | { status: "loading"; snapshot: null; error: "" }
  | { status: "select-workspace"; snapshot: null; error: "" }
  | { status: "demo"; snapshot: DemoSnapshot; error: "" }
  | { status: "ready"; snapshot: DemoSnapshot; error: "" }
  | { status: "error"; snapshot: null; error: string };

export function resolveWorkspaceSnapshotView(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  organizationId: string;
  workspaceId: string;
  initialOrganizationId?: string;
  initialWorkspaceId?: string;
  attempt: number;
  initialSnapshot: DemoSnapshot;
  resolved: ResolvedSnapshot | null;
  failure: SnapshotFailure | null;
}): WorkspaceSnapshotView {
  if (input.sessionLoading) return { status: "loading", snapshot: null, error: "" };
  if (!input.hasSession) return { status: "demo", snapshot: input.initialSnapshot, error: "" };
  if (!input.workspaceId) return { status: "select-workspace", snapshot: null, error: "" };
  if (input.failure?.organizationId === input.organizationId && input.failure.workspaceId === input.workspaceId && input.failure.attempt === input.attempt) {
    return { status: "error", snapshot: null, error: input.failure.message };
  }
  if (input.resolved?.organizationId === input.organizationId && input.resolved.workspaceId === input.workspaceId && input.resolved.attempt === input.attempt) {
    return { status: "ready", snapshot: input.resolved.snapshot, error: "" };
  }
  if (input.attempt === 0 && input.initialOrganizationId === input.organizationId && input.initialWorkspaceId === input.workspaceId) {
    return { status: "ready", snapshot: input.initialSnapshot, error: "" };
  }
  return { status: "loading", snapshot: null, error: "" };
}
