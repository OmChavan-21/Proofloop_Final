export function PartialNote({ lastSaleDate }: { lastSaleDate: string | null }) {
  return (
    <p className="text-xs leading-5 text-warning">
      Q4 2026 is not complete.
      {lastSaleDate
        ? ` Seeded sales in this quarter stop on ${lastSaleDate}.`
        : " This seed has no Q4 sales."}{" "}
      Revenue and profit totals cover that sample only. Margin rates can be
      compared with Q3; sales volume cannot.
    </p>
  );
}
