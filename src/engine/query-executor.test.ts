
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach
} from "vitest";

import type { Database } from "sql.js";
import { createDemoDatabase } from "./database";
import { executeReadOnlyQuery } from "./query-executor";

describe("Read-only query executor", () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDemoDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("executes a valid SELECT query", () => {
    const result = executeReadOnlyQuery(
      db,
      "SELECT * FROM products"
    );

    expect(result.success).toBe(true);
    expect(result.rows.length).toBe(6);
    expect(result.columns).toContain("name");
    expect(result.error).toBeNull();
  });

  it("rejects an invalid SQL query", () => {
    const result = executeReadOnlyQuery(
      db,
      "DELETE FROM products"
    );

    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.rows).toHaveLength(0);
  });

  it("rejects malformed and syntactically invalid queries", () => {
    for (const sql of ["SELECT FROM", "SELECT * FROM products WHERE ("]) {
      const result = executeReadOnlyQuery(db, sql);
      expect(result.success).toBe(false);
      expect(result.rows).toHaveLength(0);
    }
  });

  it("returns structured results for aggregate queries", () => {
    const result = executeReadOnlyQuery(
      db,
      "SELECT category, COUNT(*) AS total FROM products GROUP BY category"
    );

    expect(result.success).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.columns).toContain("total");
  });

  it("does not modify database data", () => {
    const before = db.exec(
      "SELECT COUNT(*) AS total FROM products"
    )[0].values[0][0];

    const result = executeReadOnlyQuery(
      db,
      "SELECT * FROM products"
    );

    const after = db.exec(
      "SELECT COUNT(*) AS total FROM products"
    )[0].values[0][0];

    expect(result.success).toBe(true);
    expect(after).toBe(before);
  });

  it("limits returned results to 100 rows", () => {
    const result = executeReadOnlyQuery(
      db,
      `SELECT p.id
       FROM products p
       JOIN products q ON 1 = 1
       JOIN products r ON 1 = 1`
    );

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(100);
    expect(result.truncated).toBe(true);
  });

  it("does not mark a result truncated when it has exactly 100 rows", () => {
    const result = executeReadOnlyQuery(
      db,
      `SELECT p.id FROM products p JOIN products q ON 1 = 1
       JOIN products r ON 1 = 1 LIMIT 100`
    );

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(100);
    expect(result.truncated).toBe(false);
  });

});
