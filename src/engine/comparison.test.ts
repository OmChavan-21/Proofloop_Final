
import { describe, expect, it } from "vitest";
import { createDemoDatabase } from "./database";
import { compareProductMargins } from "./comparison";

describe("Product margin comparison", () => {
  it("identifies products with declining margins", async () => {
    const db = await createDemoDatabase();

    try {
      const results = compareProductMargins(
        db,
        "2026-07-01",
        "2026-10-01",
        "2026-10-01",
        "2026-12-01"
      );

      const backpack = results.find(
        (item) => item.productId === "P001"
      );

      expect(backpack).toBeDefined();
      expect(backpack?.status).toBe("declined");
      expect(backpack?.previousMargin).toBeCloseTo(55);
      expect(backpack?.currentMargin).toBeCloseTo(36.84, 1);
      expect(backpack?.marginChange).toBeLessThan(0);
    } finally {
      db.close();
    }
  });

  it("identifies multiple declining products", async () => {
    const db = await createDemoDatabase();

    try {
      const results = compareProductMargins(
        db,
        "2026-07-01",
        "2026-10-01",
        "2026-10-01",
        "2026-12-01"
      );

      expect(
        results.filter((item) => item.status === "declined").length
      ).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
