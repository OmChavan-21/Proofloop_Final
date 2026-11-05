"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Asterisk, BadgeCheck, LayoutDashboard, LogOut, Package, PanelsTopLeft, ScrollText, Sparkles } from "lucide-react";
import { TenantProvider, useTenant } from "@/components/shell/tenant-context";
import { requestJson } from "@/lib/auth-api";
import { canDecideApprovals } from "@/lib/frontend-access";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

const nav = [
  { href: "/", label: "Business Overview", shortLabel: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Product Performance", shortLabel: "Products", icon: Package },
  { href: "/analysis", label: "AI Analysis", shortLabel: "Analysis", icon: Sparkles },
  { href: "/dashboards", label: "Dashboards", shortLabel: "Dashboards", icon: PanelsTopLeft },
  { href: "/approvals", label: "Approvals", shortLabel: "Approvals", icon: BadgeCheck },
  { href: "/audit", label: "Audit history", shortLabel: "Audit", icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-flex items-center justify-center rounded-lg bg-brand text-white ${compact ? "size-8" : "size-9"}`}>
        <Asterisk className={compact ? "size-4" : "size-[18px]"} aria-hidden="true" />
      </span>
      <span className="text-base font-semibold tracking-tight text-ink">Proofloop</span>
    </span>
  );
}

function NavigationItems({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { role, session } = useTenant();
  const visibleNav = nav.filter((item) => item.href !== "/approvals" || !session || (!!role && canDecideApprovals(role)));

  return (
    <ul className={mobile ? (visibleNav.length === 3 ? "grid grid-cols-3" : visibleNav.length === 4 ? "grid grid-cols-4" : visibleNav.length === 5 ? "grid grid-cols-5" : "grid grid-cols-6") : "mt-2 space-y-1"}>
      {visibleNav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const label = mobile ? item.shortLabel : item.label;
        const className = mobile
          ? `flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] ${active ? "font-semibold text-brand" : "text-muted"}`
          : `flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm ${active ? "bg-brand-soft font-medium text-brand" : "text-ink/80 transition-colors hover:bg-canvas"}`;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={className}
              aria-current={active ? "page" : undefined}
            >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <TenantProvider><ShellContent>{children}</ShellContent></TenantProvider>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = nav.find((item) => isActive(pathname, item.href));
  const { session, sessionLoading, authError, organizations, activeOrganizationId, workspaces, workspaceId, role, chooseOrganization, chooseWorkspace, createOrganization, createWorkspace, refreshSession } = useTenant();
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/verify-email";

  async function submitContextForm(event: FormEvent<HTMLFormElement>, kind: "organization" | "workspace") {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    setFormBusy(true); setFormError("");
    try {
      if (kind === "organization") await createOrganization(name);
      else await createWorkspace(name);
      form.reset();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `Could not create ${kind}.`);
    } finally { setFormBusy(false); }
  }

  async function signOut() {
    try { await requestJson("/api/auth/sign-out", { method: "POST" }); await refreshSession(); }
    catch (error) { setFormError(error instanceof Error ? error.message : "Could not sign out."); }
  }

  if (isAuthPage) {
    return <div className="min-h-screen bg-canvas text-ink"><main id="main-content" className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">{children}</main></div>;
  }

  if (session?.user && !session.user.emailVerified) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <main id="main-content" className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
          <VerifyEmailForm
            initialEmail={session.user.email}
            onSuccess={async () => {
              await refreshSession();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-card px-4 py-3 text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-card lg:flex">
          <div className="px-5 pt-5">
            <Brand />
          </div>

          <div className="mx-3 mt-6 rounded-xl border border-line px-3 py-3">
            <p className="text-sm font-medium">{session ? organizations.find((item) => item.id === activeOrganizationId)?.name ?? "Choose organization" : "Demo catalog"}</p>
            <p className="mt-0.5 text-xs text-muted">{session ? workspaces.find((item) => item.id === workspaceId)?.name ?? "Choose workspace" : "Seeded workspace"}</p>
          </div>

          {session ? <WorkspaceControls onSubmit={submitContextForm} formBusy={formBusy} error={formError || authError} organizations={organizations} activeOrganizationId={activeOrganizationId} workspaces={workspaces} workspaceId={workspaceId} role={role} onOrganizationChange={(id) => void chooseOrganization(id)} onWorkspaceChange={chooseWorkspace} /> : null}

          <nav className="mt-7 px-3" aria-label="Workspace">
            <p className="px-3 text-[11px] font-semibold tracking-[0.14em] text-muted">
              WORKSPACE
            </p>
            <NavigationItems />
          </nav>

          <div className="mt-auto px-4 pb-5">
            {session ? <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2"><span className="min-w-0"><span className="block truncate text-xs font-medium">{session.user.name || session.user.email}</span><span className="text-[11px] capitalize text-muted">{role || "Member"}</span></span><button type="button" onClick={() => void signOut()} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas" aria-label="Sign out"><LogOut className="size-4" aria-hidden="true" /></button></div> : <div className="mb-3 flex gap-2">{sessionLoading ? <span className="text-xs text-muted">Checking session…</span> : <><Link href="/login" className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-medium">Sign in</Link><Link href="/signup" className="inline-flex min-h-9 items-center rounded-lg bg-brand px-3 text-xs font-medium text-white">Create account</Link></>}</div>}
            {authError ? <p className="mb-2 text-xs leading-5 text-warning" role="status">Auth unavailable: {authError}</p> : null}
            <div className="rounded-xl bg-canvas px-3 py-3.5">
              <p className="text-xs font-semibold text-ink">Seeded demo data</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Not a connected store. Q4 2026 contains partial-quarter data.
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="border-b border-line bg-card/95 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-h-8 items-center justify-between gap-3">
              <div className="lg:hidden">
                <Brand compact />
              </div>
              <p className="hidden text-sm text-muted lg:block">
                <span>Workspace</span>
                <span className="px-2 text-line" aria-hidden="true">/</span>
                <span className="font-medium text-ink">{current?.label ?? "Proofloop"}</span>
              </p>
              <div className="flex items-center gap-2">
              {session ? <><span className="hidden max-w-40 truncate text-xs text-muted sm:inline">{session.user.name || session.user.email}</span><button type="button" onClick={() => void signOut()} aria-label="Sign out" className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-canvas lg:hidden"><LogOut className="size-4" aria-hidden="true" /></button></> : <Link href="/login" className="text-xs font-medium text-brand">Sign in</Link>}
              <span className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                Seeded demo data
              </span>
              </div>
            </div>
            {session ? <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
              <label className="sr-only" htmlFor="mobile-organization-select">Organization</label>
              <select id="mobile-organization-select" value={activeOrganizationId} onChange={(event) => void chooseOrganization(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-line bg-white px-2 text-xs"><option value="">Select organization</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <label className="sr-only" htmlFor="mobile-workspace-select">Workspace</label>
              <select id="mobile-workspace-select" value={workspaceId} onChange={(event) => chooseWorkspace(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-line bg-white px-2 text-xs"><option value="">Select workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </div> : null}
            {session && (role === "owner" || role === "admin" || organizations.length === 0) ? <details className="mt-2 lg:hidden"><summary className="cursor-pointer text-xs font-medium text-brand">Create {organizations.length ? "workspace" : "organization"}</summary><form onSubmit={(event) => submitContextForm(event, organizations.length ? "workspace" : "organization")} className="mt-2 flex gap-2"><label className="sr-only" htmlFor="mobile-tenant-name">Name</label><input id="mobile-tenant-name" name="name" required maxLength={120} placeholder={organizations.length ? "Workspace name" : "Organization name"} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line px-2 text-xs"/><button type="submit" disabled={formBusy} className="min-h-10 rounded-lg bg-brand px-3 text-xs font-medium text-white disabled:opacity-60">{formBusy ? "Creating…" : "Create"}</button></form>{formError ? <p className="mt-2 text-xs text-negative" role="alert">{formError}</p> : null}</details> : null}
            {session && role === "owner" && organizations.length > 0 ? <details className="mt-2 lg:hidden"><summary className="cursor-pointer text-xs font-medium text-brand">Create another organization</summary><form onSubmit={(event) => submitContextForm(event, "organization")} className="mt-2 flex gap-2"><label className="sr-only" htmlFor="mobile-organization-name">Organization name</label><input id="mobile-organization-name" name="name" required maxLength={120} placeholder="Organization name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-line px-2 text-xs"/><button type="submit" disabled={formBusy} className="min-h-10 rounded-lg bg-brand px-3 text-xs font-medium text-white disabled:opacity-60">{formBusy ? "Creating…" : "Create"}</button></form></details> : null}
          </header>

          <main
            id="main-content"
            className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10"
          >
            {!session && authError && pathname !== "/login" && pathname !== "/signup" ? <p className="mb-4 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-5 text-ink lg:hidden" role="status">Account access is unavailable in this deployment: {authError}</p> : null}
            {session && !workspaceId && (pathname === "/" || pathname === "/products" || pathname.startsWith("/products/")) ? <p className="mb-4 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-5 text-ink" role="note">Select a workspace in the header to view its independent dashboard.</p> : null}
            <div key={`${session?.user.id ?? "demo"}:${activeOrganizationId || "no-organization"}:${workspaceId || "no-workspace"}`}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Workspace"
      >
        <NavigationItems mobile />
      </nav>
    </div>
  );
}

function WorkspaceControls({ onSubmit, formBusy, error, organizations, activeOrganizationId, workspaces, workspaceId, role, onOrganizationChange, onWorkspaceChange }: {
  onSubmit: (event: FormEvent<HTMLFormElement>, kind: "organization" | "workspace") => void;
  formBusy: boolean; error: string; organizations: { id: string; name: string }[]; activeOrganizationId: string;
  workspaces: { id: string; name: string }[]; workspaceId: string; role: string;
  onOrganizationChange: (id: string) => void; onWorkspaceChange: (id: string) => void;
}) {
  const canManage = canDecideApprovals(role);
  return <div className="mx-3 mt-3 space-y-2">
    <label className="block text-[11px] font-medium text-muted" htmlFor="organization-select">Organization</label>
    <select id="organization-select" value={activeOrganizationId} onChange={(event) => onOrganizationChange(event.target.value)} className="min-h-10 w-full rounded-lg border border-line bg-white px-2 text-xs text-ink">
      <option value="">Select organization</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {activeOrganizationId ? <><label className="block pt-1 text-[11px] font-medium text-muted" htmlFor="workspace-select">Workspace</label><select id="workspace-select" value={workspaceId} onChange={(event) => onWorkspaceChange(event.target.value)} className="min-h-10 w-full rounded-lg border border-line bg-white px-2 text-xs text-ink"><option value="">Select workspace</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : null}
    {canManage || organizations.length === 0 ? <details className="rounded-lg bg-canvas px-2 py-2"><summary className="cursor-pointer text-xs font-medium text-brand">Create {organizations.length ? "workspace" : "organization"}</summary><form onSubmit={(event) => onSubmit(event, organizations.length ? "workspace" : "organization")} className="mt-2 space-y-2"><label className="sr-only" htmlFor="tenant-name">Name</label><input id="tenant-name" name="name" required maxLength={120} placeholder={organizations.length ? "Workspace name" : "Organization name"} className="min-h-10 w-full rounded-lg border border-line px-2 text-xs"/><button type="submit" disabled={formBusy} className="min-h-9 w-full rounded-lg bg-brand px-2 text-xs font-medium text-white disabled:opacity-60">{formBusy ? "Creating…" : "Create"}</button></form></details> : null}
    {role === "owner" && organizations.length > 0 ? <details className="rounded-lg bg-canvas px-2 py-2"><summary className="cursor-pointer text-xs font-medium text-brand">Create another organization</summary><form onSubmit={(event) => onSubmit(event, "organization")} className="mt-2 space-y-2"><label className="sr-only" htmlFor="organization-name">Organization name</label><input id="organization-name" name="name" required maxLength={120} placeholder="Organization name" className="min-h-10 w-full rounded-lg border border-line px-2 text-xs"/><button type="submit" disabled={formBusy} className="min-h-9 w-full rounded-lg bg-brand px-2 text-xs font-medium text-white disabled:opacity-60">{formBusy ? "Creating…" : "Create organization"}</button></form></details> : null}
    {error ? <p className="text-xs leading-5 text-negative" role="alert">{error}</p> : null}
  </div>;
}
