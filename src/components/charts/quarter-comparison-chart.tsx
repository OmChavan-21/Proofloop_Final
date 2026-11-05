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
import { formatDayList, formatMoney } from "@/components/dashboard/format";
import type { DemoSnapshot } from "@/components/dashboard/types";

export function QuarterComparisonChart({
  snapshot,
}: {
  snapshot: DemoSnapshot;
}) {
  const data = [
    {
      name: "Q3 2026",
      caption: "Complete quarter",
      revenue: snapshot.q3.revenue,
      grossProfit: snapshot.q3.grossProfit,
    },
    {
      name: "Q4 2026",
      caption: "Partial quarter",
      revenue: snapshot.q4.revenue,
      grossProfit: snapshot.q4.grossProfit,
    },
  ];

  const isEmpty = snapshot.q3.revenue === 0 && snapshot.q4.revenue === 0;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Q3 versus partial Q4
          </h2>
          <p className="mt-1 text-sm text-muted">
            Two period totals. Not a daily or monthly trend.
          </p>
        </div>
        <p className="text-xs text-muted">USD · revenue & profit</p>
      </div>

      {isEmpty ? (
        <div className="mt-4 flex h-64 items-center justify-center rounded-xl bg-canvas text-sm text-muted">
          No revenue or profit recorded in this workspace yet.
        </div>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={6} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#e6e6ed" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#707280", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#707280", fontSize: 12 }}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`
                }
              />
              <Tooltip
                cursor={{ fill: "#f6f8f9" }}
                formatter={(value) => formatMoney(Number(value ?? 0))}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#6b50cf"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="grossProfit"
                name="Gross profit"
                fill="#c4b8ef"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-muted">
        The workspace has {snapshot.q3.saleCount} completed Q3 sales (
        {formatDayList(snapshot.q3.saleDates)}) and {snapshot.q4.saleCount}{" "}
        completed Q4 sales ({formatDayList(snapshot.q4.saleDates) || "none"}).
      </p>
      <details className="mt-3 border-t border-line pt-3 text-sm">
        <summary className="min-h-8 cursor-pointer font-medium text-brand">View exact chart values</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-72 text-left text-sm">
            <caption className="sr-only">Revenue and gross profit totals shown in the chart</caption>
            <thead className="text-xs text-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Period</th><th scope="col" className="py-2 pr-3 text-right font-medium">Revenue</th><th scope="col" className="py-2 text-right font-medium">Gross profit</th></tr></thead>
            <tbody>{data.map((row) => <tr key={row.name} className="border-t border-line"><th scope="row" className="py-2 pr-3 font-medium">{row.name} · {row.caption}</th><td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.revenue)}</td><td className="py-2 text-right tabular-nums">{formatMoney(row.grossProfit)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <table className="sr-only !w-px !max-w-px table-fixed">
        <caption>Q3 and partial Q4 revenue and gross profit</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Revenue</th>
            <th>Gross profit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td>
                {row.name} · {row.caption}
              </td>
              <td>{formatMoney(row.revenue)}</td>
              <td>{formatMoney(row.grossProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
