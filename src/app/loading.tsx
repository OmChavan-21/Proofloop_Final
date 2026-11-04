export default function Loading() {
  return (
    <div
      className="space-y-6 sm:space-y-8"
      role="status"
      aria-label="Loading Proofloop workspace"
      aria-busy="true"
    >
      <span className="sr-only">Loading Proofloop workspace…</span>
      <div className="h-16 max-w-lg animate-pulse rounded-lg bg-line/60" />
      <div className="h-16 animate-pulse rounded-xl bg-line/60" />
      <div className="h-24 animate-pulse rounded-xl bg-line/60" />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-line/60" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-line/60" />
    </div>
  );
}
