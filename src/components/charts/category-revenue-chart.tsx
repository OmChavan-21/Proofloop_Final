"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatPercent } from "@/components/dashboard/format";
import type { CategorySnapshot } from "@/components/dashboard/types";

export function CategoryRevenueChart({
  categories,
  periodLabel = "Q4 2026 to date",
}: {
  categories: CategorySnapshot[];
  periodLabel?: string;
}) {
  const data = categories.map((category) => ({
    name: category.category,
    revenue: category.revenue,
    share: category.share,
  }));

  return (
    <section className="min-w-0 rounded-xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)] sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Revenue by category</h2>
        <p className="mt-1 text-sm text-muted">
          {periodLabel} · USD
        </p>
      </div>
      {data.length === 0 ? (
        <p className="mt-6 rounded-lg bg-canvas px-4 py-6 text-sm text-muted">
          No category revenue is available for this selected period.
        </p>
      ) : (
        <>
          <div className="mt-4 h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke="#e6e6ed" />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#707280", fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#212331", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "#f6f8f9" }}
                  formatter={(value) => formatMoney(Number(value ?? 0))}
                  labelFormatter={(label) => String(label)}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#6b50cf"
                  radius={[0, 5, 5, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 border-t border-line pt-3 text-sm">
            <summary className="min-h-8 cursor-pointer font-medium text-brand">
              View category values
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-64 text-left text-sm">
                <caption className="sr-only">
                  {periodLabel} revenue by category
                </caption>
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium" scope="col">Category</th>
                    <th className="py-2 pr-4 text-right font-medium" scope="col">Revenue</th>
                    <th className="py-2 text-right font-medium" scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.category} className="border-t border-line">
                      <th className="py-2 pr-4 font-medium" scope="row">
                        {category.category}
                      </th>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatMoney(category.revenue)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatPercent(category.share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
