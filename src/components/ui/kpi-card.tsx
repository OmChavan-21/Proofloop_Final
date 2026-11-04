import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  detail,
  footnote,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  footnote: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const detailClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-muted";

  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">{label}</h2>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-warning uppercase">
          Partial Q4
        </span>
      </div>
      <p className="mt-3 text-[1.65rem] font-semibold tracking-tight text-ink">
        {value}
      </p>
      {detail ? (
        <p className={`mt-2 text-sm font-medium ${detailClass}`}>{detail}</p>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-muted">{footnote}</p>
    </article>
  );
}
