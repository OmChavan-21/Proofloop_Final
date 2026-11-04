
import { describe, expect, it } from "vitest";
import { validateSql } from "./sql-validator";

describe("SQL validator", () => {
  it("allows a basic SELECT query", () => {
    const result = validateSql("SELECT * FROM products");
    expect(result.valid).toBe(true);
  });

  it("allows an aggregate query", () => {
    const result = validateSql(
      "SELECT category, COUNT(*) FROM products GROUP BY category"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects DELETE statements", () => {
    const result = validateSql("DELETE FROM products");
    expect(result.valid).toBe(false);
  });

  it("rejects DROP statements", () => {
    const result = validateSql("DROP TABLE products");
    expect(result.valid).toBe(false);
  });

  it("rejects unapproved tables", () => {
    const result = validateSql("SELECT * FROM secrets");
    expect(result.valid).toBe(false);
  });

  it("rejects multiple SQL statements", () => {
    const result = validateSql(
      "SELECT * FROM products; SELECT * FROM sales"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty SQL", () => {
    const result = validateSql("");
    expect(result.valid).toBe(false);
  });

  it("rejects an unknown column", () => {
    const result = validateSql("SELECT password FROM products");
    expect(result.valid).toBe(false);
  });

  it("rejects an unapproved table inside a JOIN", () => {
    const result = validateSql(
      "SELECT p.name FROM products p JOIN secrets s ON p.id = s.id"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unapproved table inside a CTE", () => {
    const result = validateSql(
      "WITH x AS (SELECT * FROM secrets) SELECT * FROM x"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unapproved table inside a nested query", () => {
    const result = validateSql(
      "SELECT * FROM products WHERE id IN (SELECT product_id FROM secrets)"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects unknown table aliases", () => {
    const result = validateSql(
      "SELECT x.name FROM products p"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects SQL comments", () => {
    const result = validateSql(
      "SELECT name FROM products -- comment"
    );
    expect(result.valid).toBe(false);
  });

  it("allows an approved JOIN with valid aliases", () => {
    const result = validateSql(
      "SELECT p.name FROM products p JOIN sale_items si ON p.id = si.product_id"
    );
    expect(result.valid).toBe(true);
  });
});
