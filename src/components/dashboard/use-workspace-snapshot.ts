"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/components/shell/tenant-context";
import type { DemoSnapshot } from "@/components/dashboard/types";
import { resolveWorkspaceSnapshotView } from "./snapshot-view";
export type { WorkspaceSnapshotView } from "./snapshot-view";

type ResolvedSnapshot = { organizationId: string; workspaceId: string; attempt: number; snapshot: DemoSnapshot };
type SnapshotFailure = { organizationId: string; workspaceId: string; attempt: number; message: string };

function isSnapshot(value: unknown): value is DemoSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoSnapshot>;
  return Array.isArray(candidate.products)
    && Array.isArray(candidate.categories)
    && Boolean(candidate.q3 && typeof candidate.q3.revenue === "number" && Array.isArray(candidate.q3.saleDates))
    && Boolean(candidate.q4 && typeof candidate.q4.revenue === "number" && Array.isArray(candidate.q4.saleDates))
    && typeof candidate.lastSaleDate !== "undefined";
}

export function useWorkspaceSnapshot(initialSnapshot: DemoSnapshot, initialWorkspaceId?: string, initialOrganizationId?: string) {
  const { session, sessionLoading, workspaceId, activeOrganizationId, tenantFetch } = useTenant();
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<ResolvedSnapshot | null>(null);
  const [failure, setFailure] = useState<SnapshotFailure | null>(null);

  useEffect(() => {
    if (sessionLoading || !session || !workspaceId || (attempt === 0 && initialWorkspaceId === workspaceId && initialOrganizationId === activeOrganizationId)) return;
    const controller = new AbortController();
    const requestWorkspaceId = workspaceId;
    const requestAttempt = attempt;

    void tenantFetch("/api/dashboard", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Dashboard request failed (${response.status}).`;
          throw new Error(message);
        }
        if (!isSnapshot(payload)) throw new Error("The dashboard API returned an invalid workspace snapshot.");
        return payload;
      })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setResolved({ organizationId: activeOrganizationId, workspaceId: requestWorkspaceId, attempt: requestAttempt, snapshot });
          setFailure(null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          organizationId: activeOrganizationId,
          workspaceId: requestWorkspaceId,
          attempt: requestAttempt,
          message: error instanceof Error ? error.message : "Could not load this workspace dashboard.",
        });
      });

    return () => controller.abort();
  }, [session, sessionLoading, workspaceId, activeOrganizationId, tenantFetch, attempt, initialWorkspaceId, initialOrganizationId]);

  const view = resolveWorkspaceSnapshotView({
    sessionLoading,
    hasSession: Boolean(session),
    organizationId: activeOrganizationId,
    workspaceId,
    attempt,
    initialSnapshot,
    initialWorkspaceId,
    initialOrganizationId,
    resolved,
    failure,
  });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...view, retry, workspaceId };
}
