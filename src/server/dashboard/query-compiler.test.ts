import { describe, expect, it } from "vitest";
import { createDemoDatabase } from "../../engine/database";
import { executeReadOnlyQuery } from "../../engine/query-executor";
import { compileDashboardSpecification } from "./query-compiler";

const validSpec = {
  schemaVersion: 1,
  title: "Quarterly performance",
  components: [
    { id: "revenue-by-category", type: "bar", metricId: "revenue", dimensionId: "category", filters: [{ dimensionId: "category", operator: "eq", value: "Accessories' OR 1=1 --" }], limit: 10 },
    { id: "margin-kpi", type: "kpi", metricId: "margin", filters: [], limit: 1 }
  ]
};

describe("dashboard query compiler", () => {
  it("compiles only catalog references and executes filters as bound values", async () => {
    const compiled = compileDashboardSpecification(validSpec);
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;
    expect(compiled.queries[0].sql).not.toContain("Accessories");
    expect(compiled.queries[0].parameters).toEqual(["Accessories' OR 1=1 --"]);
    const db = await createDemoDatabase();
    try {
      const result = executeReadOnlyQuery(db, compiled.queries[0].sql, compiled.queries[0].parameters);
      expect(result.success).toBe(true);
      expect(result.rows).toEqual([]);
    } finally { db.close(); }
  });

  it("rejects unsupported fields, types, duplicate IDs, and incompatible filters", () => {
    expect(compileDashboardSpecification({ ...validSpec, components: [{ ...validSpec.components[0], sql: "DROP TABLE sales" }] }).success).toBe(false);
    expect(compileDashboardSpecification({ ...validSpec, components: [validSpec.components[0], { ...validSpec.components[0] }] }).success).toBe(false);
    expect(compileDashboardSpecification({ ...validSpec, components: [{ ...validSpec.components[0], filters: [{ dimensionId: "product", operator: "gte", value: "x" }] }] }).success).toBe(false);
  });

  it("bounds output rows and includes a stable query fingerprint", () => {
    const first = compileDashboardSpecification(validSpec);
    const second = compileDashboardSpecification(validSpec);
    expect(first.success && first.queries[0].sql).toContain("LIMIT 10");
    expect(first.success && first.queries[0].queryHash).toBe(second.success ? second.queries[0].queryHash : "");
  });
});
