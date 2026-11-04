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
    <article className="min-w-0 rounded-xl border border-line bg-card px-4 py-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)] sm:px-5">
      <h2 className="text-sm font-medium text-muted">{label}</h2>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-ink sm:text-[1.75rem]">
        {value}
      </p>
      {detail ? (
        <p className={`mt-2 text-sm font-medium ${detailClass}`}>{detail}</p>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-muted">{footnote}</p>
    </article>
  );
}
