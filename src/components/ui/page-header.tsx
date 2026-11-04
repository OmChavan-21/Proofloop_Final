import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="flex flex-col items-start gap-3 lg:items-end">
        {actions}
        {meta}
      </div>
    </div>
  );
}
