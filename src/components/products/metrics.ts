import type { ProductSnapshot } from "@/components/dashboard/types";

export type ProductPeriod = "q3" | "q4";

export function productPeriodMetrics(product: ProductSnapshot, period: ProductPeriod) {
  const revenue = period === "q3" ? product.q3Revenue : product.q4Revenue;
  const units = period === "q3" ? product.q3Units : product.q4Units;
  const unitCost = period === "q3" ? product.q3UnitCost : product.q4UnitCost;
  const productCost = Math.round(unitCost * units * 100) / 100;
  const grossProfit = Math.round((revenue - productCost) * 100) / 100;
  const grossMargin = period === "q3" ? product.q3Margin : product.q4Margin;

  return { revenue, units, unitCost, productCost, grossProfit, grossMargin };
}
