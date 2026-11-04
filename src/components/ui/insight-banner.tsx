import Link from "next/link";
import { Sparkles } from "lucide-react";

export function InsightBanner({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#e3dcfb] bg-brand-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/80">{body}</p>
        </div>
      </div>
      <Link
        href="/analysis"
        className="inline-flex shrink-0 items-center text-sm font-medium text-brand hover:underline"
      >
        Open AI Analysis
      </Link>
    </section>
  );
}
