"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Asterisk, LayoutDashboard, Package, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Business Overview", icon: LayoutDashboard },
  { href: "/products", label: "Product Performance", icon: Package },
  { href: "/analysis", label: "AI Analysis", icon: Sparkles },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = nav.find((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-card md:flex">
          <div className="flex items-center gap-2 px-5 pt-5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
              <Asterisk className="size-4" aria-hidden />
            </span>
            <span className="text-base font-semibold tracking-tight">
              Proofloop
            </span>
          </div>

          <div className="mx-3 mt-5 rounded-xl border border-line px-3 py-2.5">
            <p className="text-sm font-medium">Demo catalog</p>
            <p className="text-xs text-muted">Seeded workspace</p>
          </div>

          <nav className="mt-6 px-3" aria-label="Workspace">
            <p className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted">
              WORKSPACE
            </p>
            <ul className="mt-2 space-y-1">
              {nav.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${
                        active
                          ? "bg-brand-soft font-medium text-brand"
                          : "text-ink/80 hover:bg-canvas"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto px-4 pb-5">
            <div className="rounded-xl bg-canvas px-3 py-3">
              <p className="text-xs font-medium text-ink">Seeded demo data</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Not a connected store. Q4 2026 is a partial quarter.
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-line bg-card/90 px-4 py-3 md:px-8">
            <div className="flex items-center justify-between gap-3 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-white">
                  <Asterisk className="size-3.5" aria-hidden />
                </span>
                <span className="text-sm font-semibold">Proofloop</span>
              </Link>
              <span className="rounded-full bg-warning-soft px-2 py-1 text-[11px] font-medium text-warning">
                Demo data
              </span>
            </div>
            <p className="hidden text-sm text-muted md:block">
              <span>Workspace</span>
              <span className="px-1.5 text-line">/</span>
              <span className="text-ink">{current?.label ?? "Proofloop"}</span>
            </p>
          </header>
          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 pb-28 md:px-8 md:pb-10">
            {children}
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card md:hidden"
        aria-label="Workspace"
      >
        <ul className="grid grid-cols-3">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] ${
                    active ? "font-medium text-brand" : "text-muted"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label === "Business Overview"
                    ? "Overview"
                    : item.label === "Product Performance"
                      ? "Products"
                      : "AI Analysis"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
