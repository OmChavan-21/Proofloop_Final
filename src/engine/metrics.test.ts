
import { describe, expect, it } from "vitest";
import { createDemoDatabase } from "./database";
import { getProductMargins } from "./metrics";

describe("Product margin calculations", () => {
  it("calculates revenue, cost and gross margin correctly", async () => {
    const db = await createDemoDatabase();

    try {
      const results = getProductMargins(
        db,
        "2026-07-01",
        "2026-10-01"
      );

      const backpack = results.find(
        (item) => item.productId === "P001"
      );

      expect(backpack).toBeDefined();
      expect(backpack?.revenue).toBe(3800);
      expect(backpack?.cost).toBe(1710);
      expect(backpack?.grossProfit).toBe(2090);
      expect(backpack?.grossMargin).toBeCloseTo(55);
      expect(backpack?.unitsSold).toBe(38);
    } finally {
      db.close();
    }
  });

  it("returns no products outside the selected date range", async () => {
    const db = await createDemoDatabase();

    try {
      const results = getProductMargins(
        db,
        "2027-01-01",
        "2027-04-01"
      );

      expect(results).toHaveLength(0);
    } finally {
      db.close();
    }
  });
});
