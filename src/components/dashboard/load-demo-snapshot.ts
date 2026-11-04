import { cacheLife } from "next/cache";
import type { Database } from "sql.js";
import { compareProductMargins } from "@/engine/comparison";
import { createDemoDatabase } from "@/engine/database";
import { getProductMargins, type ProductMargin } from "@/engine/metrics";
import type {
  CategorySnapshot,
  DemoSnapshot,
  PeriodTotals,
  ProductSnapshot,
} from "./types";

const Q3_START = "2026-07-01";
const Q3_END = "2026-10-01";
const Q4_START = "2026-10-01";
const Q4_END = "2026-12-01";

function totals(rows: ProductMargin[], saleDates: string[]): PeriodTotals {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const units = rows.reduce((sum, row) => sum + row.unitsSold, 0);
  const grossProfit = revenue - cost;
  return {
    revenue,
    cost,
    grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    units,
    saleCount: saleDates.length,
    saleDates,
  };
}

function perUnit(amount: number, units: number): number {
  return units > 0 ? amount / units : 0;
}

function readSaleDates(db: Database): string[] {
  const statement = db.prepare(`
    SELECT order_date AS orderDate
    FROM sales
    WHERE status = 'completed'
    ORDER BY order_date
  `);

  try {
    const dates: string[] = [];
    while (statement.step()) {
      const row = statement.getAsObject();
      dates.push(String(row.orderDate));
    }
    return dates;
  } finally {
    statement.free();
  }
}

export async function loadDemoSnapshot(): Promise<DemoSnapshot> {
  "use cache";
  cacheLife("max");

  const db = await createDemoDatabase();

  try {
    const q3Rows = getProductMargins(db, Q3_START, Q3_END);
    const q4Rows = getProductMargins(db, Q4_START, Q4_END);
    const comparisons = compareProductMargins(
      db,
      Q3_START,
      Q3_END,
      Q4_START,
      Q4_END,
    );
    const saleDates = readSaleDates(db);
    const q3Dates = saleDates.filter((date) => date < Q3_END);
    const q4Dates = saleDates.filter((date) => date >= Q4_START);
    const q3 = totals(q3Rows, q3Dates);
    const q4 = totals(q4Rows, q4Dates);
    const q3Map = new Map(q3Rows.map((row) => [row.productId, row]));
    const q4Map = new Map(q4Rows.map((row) => [row.productId, row]));

    const products: ProductSnapshot[] = comparisons
      .map((item) => {
        const previous = q3Map.get(item.productId);
        const current = q4Map.get(item.productId);
        return {
          productId: item.productId,
          productName: item.productName,
          category: current?.category ?? previous?.category ?? "Uncategorized",
          q3Revenue: previous?.revenue ?? 0,
          q4Revenue: current?.revenue ?? 0,
          q3Units: previous?.unitsSold ?? 0,
          q4Units: current?.unitsSold ?? 0,
          q3Margin: item.previousMargin,
          q4Margin: item.currentMargin,
          marginChange: item.marginChange,
          q3UnitCost: perUnit(previous?.cost ?? 0, previous?.unitsSold ?? 0),
          q4UnitCost: perUnit(current?.cost ?? 0, current?.unitsSold ?? 0),
          q3NetPrice: perUnit(previous?.revenue ?? 0, previous?.unitsSold ?? 0),
          q4NetPrice: perUnit(current?.revenue ?? 0, current?.unitsSold ?? 0),
          status: item.status,
        };
      })
      .sort((a, b) => a.marginChange - b.marginChange);

    const q4Ids = new Set(q4Rows.map((row) => row.productId));
    const omittedFromQ4 = q3Rows
      .filter((row) => !q4Ids.has(row.productId))
      .map((row) => row.productName);

    const categoryMap = new Map<string, CategorySnapshot>();
    for (const row of q4Rows) {
      const current = categoryMap.get(row.category) ?? {
        category: row.category,
        revenue: 0,
        grossProfit: 0,
        grossMargin: 0,
        units: 0,
        share: 0,
      };
      current.revenue += row.revenue;
      current.grossProfit += row.grossProfit;
      current.units += row.unitsSold;
      categoryMap.set(row.category, current);
    }

    const categories = Array.from(categoryMap.values())
      .map((category) => ({
        ...category,
        grossMargin:
          category.revenue > 0
            ? (category.grossProfit / category.revenue) * 100
            : 0,
        share: q4.revenue > 0 ? (category.revenue / q4.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const lastSaleDate = q4Dates.at(-1) ?? null;

    return {
      dataSource: "seeded_demo_data",
      currency: "USD",
      q3Label: "Q3 2026",
      q4Label: "Q4 2026",
      q3RangeLabel: "Jul 1 – Sep 30, 2026",
      q4RangeLabel: lastSaleDate
        ? `Oct 1 – ${lastSaleDate} · partial`
        : "No seeded Q4 sales",
      q3Window: `${Q3_START} inclusive to ${Q3_END} exclusive`,
      q4Window: `${Q4_START} inclusive to ${Q4_END} exclusive`,
      q4Complete: false,
      lastSaleDate,
      q3,
      q4,
      marginChange: q4.grossMargin - q3.grossMargin,
      products,
      categories,
      declinedCount: products.filter((product) => product.status === "declined")
        .length,
      higherUnitCostCount: products.filter(
        (product) => product.q4UnitCost > product.q3UnitCost + 0.009,
      ).length,
      lowerNetPriceCount: products.filter(
        (product) => product.q4NetPrice < product.q3NetPrice - 0.009,
      ).length,
      omittedFromQ4,
    };
  } finally {
    db.close();
  }
}
