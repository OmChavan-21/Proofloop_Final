"use client";

import type { WorkspaceSnapshotView } from "./snapshot-view";

export function WorkspaceSnapshotState({
  view,
  title,
}: {
  view: WorkspaceSnapshotView & { retry: () => void };
  title: string;
}) {
  const isLoading = view.status === "loading";
  const heading = view.status === "select-workspace"
    ? "Select a workspace"
    : view.status === "error"
      ? "Workspace data unavailable"
      : `Loading ${title.toLowerCase()} data`;

  return (
    <section
      className="rounded-xl border border-line bg-card p-6"
      role={view.status === "error" ? "alert" : "status"}
      aria-busy={isLoading}
    >
      <h1 className="font-semibold text-ink">{heading}</h1>
      <p className="mt-1 text-sm text-muted">
        {view.status === "select-workspace"
          ? "Choose an organization workspace to view its data."
          : view.status === "error"
            ? view.error
            : `Resolving the selected workspace before showing ${title.toLowerCase()} metrics.`}
      </p>
      {view.status === "error" ? (
        <button
          type="button"
          onClick={view.retry}
          className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90"
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}
