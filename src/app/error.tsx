"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-xl rounded-xl border border-negative/25 bg-card px-5 py-6 sm:px-6"
      role="alert"
      aria-labelledby="overview-error-title"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-negative">
        Page unavailable
      </p>
      <h1 id="overview-error-title" className="mt-2 text-xl font-semibold text-ink">
        We couldn’t load this page.
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        A page-level problem prevented this view from loading. Try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90"
      >
        Try again
      </button>
    </section>
  );
}
