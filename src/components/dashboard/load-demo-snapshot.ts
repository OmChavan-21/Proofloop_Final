import { loadWorkspaceSnapshot, createEmptySnapshot } from "@/engine/workspace-manager";
import type { DemoSnapshot } from "./types";

export { createEmptySnapshot };

export async function loadDemoSnapshot(workspaceId?: string): Promise<DemoSnapshot> {
  return loadWorkspaceSnapshot(workspaceId);
}
