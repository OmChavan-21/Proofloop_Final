"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent, formatPoints } from "@/components/dashboard/format";
import type { ProductSnapshot } from "@/components/dashboard/types";

export function MarginComparisonChart({
  products,
}: {
  products: ProductSnapshot[];
}) {
  const data = products.map((product) => ({
    name: product.productName,
    change: Number(product.marginChange.toFixed(2)),
  }));

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(33,35,49,0.04)] md:p-5">
      <h2 className="text-base font-semibold text-ink">Margin change by product</h2>
      <p className="mt-1 text-sm text-muted">
        Partial Q4 gross margin minus Q3 gross margin, in percentage points.
        All {products.length} seeded products are shown.
      </p>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 12 }}>
            <CartesianGrid horizontal={false} stroke="#e6e6ed" />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#707280", fontSize: 12 }}
              tickFormatter={(value: number) => `${value}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={118}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#212331", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "#f6f8f9" }}
              formatter={(value) => formatPoints(Number(value ?? 0))}
            />
            <Bar dataKey="change" name="Margin change" isAnimationActive={false} radius={[0, 6, 6, 0]}>
              {data.map((row) => (
                <Cell
                  key={row.name}
                  fill={row.change < 0 ? "#b42318" : "#23755b"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 border-t border-line pt-3 text-sm">
        <summary className="min-h-8 cursor-pointer font-medium text-brand">View product margin values</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-96 text-left text-sm">
            <caption className="sr-only">Complete Q3 and partial Q4 gross margins for each product</caption>
            <thead className="text-xs text-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Product</th><th scope="col" className="py-2 pr-3 text-right font-medium">Q3 margin</th><th scope="col" className="py-2 pr-3 text-right font-medium">Q4 to date</th><th scope="col" className="py-2 text-right font-medium">Change</th></tr></thead>
            <tbody>{products.map((product) => <tr key={product.productId} className="border-t border-line"><th scope="row" className="py-2 pr-3 font-medium">{product.productName}</th><td className="py-2 pr-3 text-right tabular-nums">{formatPercent(product.q3Margin)}</td><td className="py-2 pr-3 text-right tabular-nums">{formatPercent(product.q4Margin)}</td><td className="py-2 text-right tabular-nums">{formatPoints(product.marginChange)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      <table className="sr-only !w-px !max-w-px table-fixed">
        <caption>Gross margin change for every seeded product</caption>
        <tbody>
          {products.map((product) => (
            <tr key={product.productId}>
              <td>{product.productName}</td>
              <td>
                {formatPercent(product.q3Margin)} to{" "}
                {formatPercent(product.q4Margin)}
              </td>
              <td>{formatPoints(product.marginChange)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
