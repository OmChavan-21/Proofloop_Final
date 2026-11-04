import { z } from "zod";
import { dimensionCatalog, metricCatalog } from "./catalog";

const metricIds = Object.keys(metricCatalog) as [keyof typeof metricCatalog, ...(keyof typeof metricCatalog)[]];
const dimensionIds = Object.keys(dimensionCatalog) as [keyof typeof dimensionCatalog, ...(keyof typeof dimensionCatalog)[]];
const filterSchema = z.object({
  dimensionId: z.enum(dimensionIds),
  operator: z.enum(["eq", "gte", "lte"]),
  value: z.string().trim().min(1).max(100)
}).strict();

export const dashboardSpecificationSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  components: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    type: z.enum(["kpi", "bar", "line", "table"]),
    metricId: z.enum(metricIds),
    dimensionId: z.enum(dimensionIds).optional(),
    filters: z.array(filterSchema).max(20).default([]),
    limit: z.number().int().min(1).max(100).default(20)
  }).strict()).min(1).max(12)
}).strict().superRefine((spec, ctx) => {
  const ids = new Set<string>();
  spec.components.forEach((component, index) => {
    if (ids.has(component.id)) ctx.addIssue({ code: "custom", path: ["components", index, "id"], message: "Component IDs must be unique." });
    ids.add(component.id);
    if (component.type === "kpi" && component.dimensionId) ctx.addIssue({ code: "custom", path: ["components", index, "dimensionId"], message: "KPI components cannot use a grouping dimension." });
    if (component.type !== "kpi" && !component.dimensionId) ctx.addIssue({ code: "custom", path: ["components", index, "dimensionId"], message: "Chart and table components require a grouping dimension." });
    for (const [filterIndex, filter] of component.filters.entries()) {
      if (!(dimensionCatalog[filter.dimensionId].filters as readonly string[]).includes(filter.operator)) {
        ctx.addIssue({ code: "custom", path: ["components", index, "filters", filterIndex, "operator"], message: "This filter operator is not supported for the selected dimension." });
      }
    }
  });
});

export type DashboardSpecification = z.infer<typeof dashboardSpecificationSchema>;
