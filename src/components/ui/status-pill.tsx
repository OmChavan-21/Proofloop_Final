const tones = {
  declined: "bg-negative-soft text-negative",
  improved: "bg-positive-soft text-positive",
  unchanged: "bg-canvas text-muted",
  new: "bg-brand-soft text-brand",
  passed: "bg-positive-soft text-positive",
  failed: "bg-negative-soft text-negative",
  completed: "bg-positive-soft text-positive",
  pending: "bg-warning-soft text-warning",
  partial: "bg-warning-soft text-warning",
  neutral: "bg-canvas text-muted",
} as const;

export function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
