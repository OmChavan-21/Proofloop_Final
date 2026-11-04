import { validateSql } from "../../engine/sql-validator";
import { dimensionCatalog, metricCatalog, SEMANTIC_CATALOG_VERSION, type DimensionId, type MetricId } from "./catalog";
import { dashboardSpecificationSchema, type DashboardSpecification } from "./specification";

export type CompiledDashboardQuery = {
  componentId: string;
  metricId: MetricId;
  catalogVersion: typeof SEMANTIC_CATALOG_VERSION;
  sql: string;
  parameters: string[];
  queryHash: string;
};

function digest(value: string): string {
  // Stable non-cryptographic identifier for traceability, not an integrity signature.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function compileDashboardSpecification(input: unknown): { success: true; queries: CompiledDashboardQuery[] } | { success: false; errors: string[] } {
  const parsed = dashboardSpecificationSchema.safeParse(input);
  if (!parsed.success) return { success: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const queries: CompiledDashboardQuery[] = [];
  for (const component of parsed.data.components) {
    const parameters: string[] = [];
    const clauses: string[] = [];
    for (const filter of component.filters) {
      const dimension = dimensionCatalog[filter.dimensionId as DimensionId];
      const operator = filter.operator === "eq" ? "=" : filter.operator === "gte" ? ">=" : "<=";
      clauses.push(`${dimension.select} ${operator} ?`);
      parameters.push(filter.value);
    }
    const metric = metricCatalog[component.metricId as MetricId];
    const dimension = component.dimensionId ? dimensionCatalog[component.dimensionId as DimensionId] : undefined;
    const select = dimension ? `${dimension.select} AS label, ${metric.expression} AS value` : `${metric.expression} AS value`;
    const group = dimension ? ` GROUP BY ${dimension.group} ORDER BY ${dimension.group} ASC` : "";
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const sql = `SELECT ${select} FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id${where}${group} LIMIT ${component.limit}`;
    const validation = validateSql(sql);
    if (!validation.valid) return { success: false, errors: [`Compiler produced a query rejected by SQL policy: ${validation.errors.join(" ")}`] };
    queries.push({ componentId: component.id, metricId: component.metricId, catalogVersion: SEMANTIC_CATALOG_VERSION, sql, parameters, queryHash: digest(`${sql}\n${JSON.stringify(parameters)}`) });
  }
  return { success: true, queries };
}

export type { DashboardSpecification };
