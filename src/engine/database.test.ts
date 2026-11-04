
import { describe, expect, it } from "vitest";
import { createDemoDatabase } from "./database";

describe("Proofloop demo database", () => {
  it("creates all tables and loads demo records", async () => {
    const db = await createDemoDatabase();

    try {
      const products = db.exec("SELECT COUNT(*) FROM products");
      const sales = db.exec("SELECT COUNT(*) FROM sales");
      const items = db.exec("SELECT COUNT(*) FROM sale_items");

      expect(products[0].values[0][0]).toBe(6);
      expect(sales[0].values[0][0]).toBe(10);
      expect(items[0].values[0][0]).toBe(20);
    } finally {
      db.close();
    }
  });
});
