"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { requestJson, type AuthSession, type OrganizationItem, type WorkspaceItem } from "@/lib/auth-api";
import { tenantRequestInit } from "@/lib/tenant-api";

type TenantState = {
  session: AuthSession | null;
  sessionLoading: boolean;
  authError: string;
  organizations: OrganizationItem[];
  activeOrganizationId: string;
  workspaces: WorkspaceItem[];
  workspaceId: string;
  role: string;
  tenantFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshSession: () => Promise<void>;
  chooseOrganization: (id: string) => Promise<void>;
  chooseWorkspace: (id: string) => void;
  createOrganization: (name: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
};

const TenantContext = createContext<TenantState | null>(null);

async function loadOrganizationContext(organizationId: string) {
  const payload = await requestJson<{ workspaces: WorkspaceItem[] }>("/api/workspaces");
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(`proofloop-workspace:${organizationId}`) || "" : "";
  const chosen = payload.workspaces.find((item) => item.id === saved)?.id
    ?? (payload.workspaces.length > 0 ? payload.workspaces[0].id : "");
  if (chosen && typeof document !== "undefined") {
    document.cookie = `proofloop_workspace_id=${chosen}; Path=/; SameSite=Lax`;
  }
  return { workspaces: payload.workspaces, workspaceId: chosen };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [role, setRole] = useState("");

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setAuthError("");
    try {
      const next = await requestJson<AuthSession | null>("/api/auth/get-session");
      setSession(next);
      if (!next || !next.user.emailVerified) {
        setOrganizations([]); setActiveOrganizationId(""); setWorkspaces([]); setWorkspaceId(""); setRole("");
        return;
      }
      const orgResult = await requestJson<OrganizationItem[]>("/api/auth/organization/list");
      setOrganizations(orgResult);
      const activeId = next.session.activeOrganizationId || "";
      setActiveOrganizationId(activeId);
      if (activeId) {
        const [context, member] = await Promise.all([
          loadOrganizationContext(activeId),
          requestJson<{ role: string }>("/api/auth/organization/get-active-member-role"),
        ]);
        setWorkspaces(context.workspaces); setWorkspaceId(context.workspaceId);
        setRole(member.role);
      } else {
        setWorkspaces([]); setWorkspaceId(""); setRole("");
      }
    } catch (error) {
      setSession(null); setOrganizations([]); setActiveOrganizationId(""); setWorkspaces([]); setWorkspaceId(""); setRole("");
      setAuthError(error instanceof Error ? error.message : "Authentication service is unavailable.");
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSession]);

  const chooseOrganization = useCallback(async (id: string) => {
    setAuthError("");
    try {
      await requestJson("/api/auth/organization/set-active", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: id }),
      });
      setActiveOrganizationId(id);
      const [context, member] = await Promise.all([
        loadOrganizationContext(id),
        requestJson<{ role: string }>("/api/auth/organization/get-active-member-role"),
      ]);
      setWorkspaces(context.workspaces); setWorkspaceId(context.workspaceId);
      setRole(member.role);
      await loadSession();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not switch organization.");
    }
  }, [loadSession]);

  const chooseWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    if (id && typeof document !== "undefined") {
      document.cookie = `proofloop_workspace_id=${id}; Path=/; SameSite=Lax`;
    }
    if (activeOrganizationId && id && typeof window !== "undefined") {
      window.localStorage.setItem(`proofloop-workspace:${activeOrganizationId}`, id);
    }
  }, [activeOrganizationId]);

  const createOrganization = useCallback(async (name: string) => {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || `proofloop-${Date.now()}`;
    await requestJson("/api/auth/organization/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug }),
    });
    await loadSession();
  }, [loadSession]);

  const createWorkspace = useCallback(async (name: string) => {
    const result = await requestJson<{ workspace: WorkspaceItem }>("/api/workspaces", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const updated = [...workspaces, result.workspace];
    setWorkspaces(updated); chooseWorkspace(result.workspace.id);
  }, [chooseWorkspace, workspaces]);

  const tenantFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    return fetch(input, tenantRequestInit(init, workspaceId));
  }, [workspaceId]);

  const value = useMemo<TenantState>(() => ({
    session, sessionLoading, authError, organizations, activeOrganizationId, workspaces, workspaceId, role,
    tenantFetch, refreshSession: loadSession, chooseOrganization, chooseWorkspace, createOrganization, createWorkspace,
  }), [session, sessionLoading, authError, organizations, activeOrganizationId, workspaces, workspaceId, role, tenantFetch, loadSession, chooseOrganization, chooseWorkspace, createOrganization, createWorkspace]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const value = useContext(TenantContext);
  if (!value) throw new Error("useTenant must be used within TenantProvider.");
  return value;
}
