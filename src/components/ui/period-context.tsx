import { formatDay } from "@/components/dashboard/format";
import { StatusPill } from "@/components/ui/status-pill";

export function PeriodContext({
  firstSaleDate,
  lastSaleDate,
  period,
  onPeriodChange,
}: {
  firstSaleDate: string | null;
  lastSaleDate: string | null;
  period: "q3" | "q4";
  onPeriodChange: (period: "q3" | "q4") => void;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="Reporting period context">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-medium text-ink">
          <span className="text-muted">Period</span>
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as "q3" | "q4")}
            className="min-h-9 cursor-pointer bg-transparent pr-1 text-ink focus-visible:outline-offset-1"
            aria-label="Reporting period"
          >
            <option value="q4">Q4 2026 · partial</option>
            <option value="q3">Q3 2026 · complete</option>
          </select>
        </label>
        {period === "q4" ? <StatusPill tone="partial">Partial quarter</StatusPill> : <StatusPill tone="completed">Complete quarter</StatusPill>}
        <span className="inline-flex min-h-10 items-center rounded-lg border border-line bg-card px-3 text-sm text-ink">
          {period === "q4" ? "Compared with Q3 2026" : "Complete reference period"}
        </span>
        <span className="inline-flex min-h-10 items-center rounded-lg border border-line bg-card px-3 text-sm text-ink">
          USD
        </span>
      </div>
      <p className="text-xs leading-5 text-muted">
        {period === "q4" ? "Q4 calendar window: Oct 1–Dec 31, 2026. Actual seeded sales coverage:" : "Q3 calendar window: Jul 1–Sep 30, 2026. Actual seeded sales coverage:"}
        {firstSaleDate && lastSaleDate
          ? ` ${formatDay(firstSaleDate)} through ${formatDay(lastSaleDate)}.`
          : ` no ${period.toUpperCase()} sales in this seed.`}
        {period === "q4" ? " Q3 covers a complete quarter (Jul 1–Sep 30, 2026)." : ""}
      </p>
    </section>
  );
}
