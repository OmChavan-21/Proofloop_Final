export const SEMANTIC_CATALOG_VERSION = "demo-v1" as const;

export const metricCatalog = {
  revenue: { label: "Revenue", unit: "currency", expression: "SUM(si.quantity * si.unit_price * (1 - si.discount))" },
  profit: { label: "Gross profit", unit: "currency", expression: "SUM(si.quantity * (si.unit_price * (1 - si.discount) - si.unit_cost))" },
  margin: { label: "Gross margin", unit: "percentage", expression: "CASE WHEN SUM(si.quantity * si.unit_price * (1 - si.discount)) = 0 THEN 0 ELSE SUM(si.quantity * (si.unit_price * (1 - si.discount) - si.unit_cost)) * 100.0 / SUM(si.quantity * si.unit_price * (1 - si.discount)) END" },
  units_sold: { label: "Units sold", unit: "count", expression: "SUM(si.quantity)" }
} as const;

export const dimensionCatalog = {
  product: { label: "Product", select: "p.name", group: "p.name", filters: ["eq"] as const },
  category: { label: "Category", select: "p.category", group: "p.category", filters: ["eq"] as const },
  month: { label: "Month", select: "substr(s.order_date, 1, 7)", group: "substr(s.order_date, 1, 7)", filters: ["eq", "gte", "lte"] as const },
  status: { label: "Order status", select: "s.status", group: "s.status", filters: ["eq"] as const }
} as const;

export type MetricId = keyof typeof metricCatalog;
export type DimensionId = keyof typeof dimensionCatalog;
