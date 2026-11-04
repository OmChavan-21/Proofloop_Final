export function PeriodContext({
  lastSaleDate,
}: {
  lastSaleDate: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink">
          Q4 2026 · partial
        </span>
        <span className="inline-flex items-center rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink">
          All products
        </span>
        <span className="inline-flex items-center rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink">
          USD
        </span>
      </div>
      <p className="text-xs leading-5 text-muted">
        Compared with Q3 2026 (Jul 1 – Sep 30), a complete quarter in this
        seed. Q4 is in progress
        {lastSaleDate ? ` and the latest seeded sale is ${lastSaleDate}` : ""}.
      </p>
    </div>
  );
}
