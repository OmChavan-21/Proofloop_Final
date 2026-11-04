import { formatDay } from "@/components/dashboard/format";

export function PartialNote({
  firstSaleDate,
  lastSaleDate,
}: {
  firstSaleDate: string | null;
  lastSaleDate: string | null;
}) {
  return (
    <aside
      className="rounded-xl border border-[#e6d9b8] bg-warning-soft px-4 py-3"
      aria-label="Partial quarter data notice"
    >
      <p className="text-sm font-medium text-warning">Q4 2026 is a partial quarter.</p>
      <p className="mt-1 text-sm leading-5 text-ink/80">
        {firstSaleDate && lastSaleDate
          ? `This seeded sample includes sales from ${formatDay(firstSaleDate)} through ${formatDay(lastSaleDate)}. Revenue, gross profit, and units cover that sample only; Q3 covers a full quarter.`
          : "There are no seeded Q4 sales to summarize. Q3 contains a complete quarter."}
      </p>
    </aside>
  );
}
