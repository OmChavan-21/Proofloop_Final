
import { describe, expect, it } from "vitest";
import { createDemoDatabase } from "./database";
import { generateProductEvidence } from "./evidence";

describe("Product evidence generation", () => {
  it("provides transaction IDs for a declining product", async () => {
    const db = await createDemoDatabase();

    try {
      const results = generateProductEvidence(
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
      expect(backpack?.previousTransactionIds).toEqual([
        "S001",
        "S004"
      ]);
      expect(backpack?.currentTransactionIds).toEqual([
        "S007",
        "S010"
      ]);
      expect(backpack?.previousTransactionCount).toBe(2);
      expect(backpack?.currentTransactionCount).toBe(2);
      expect(backpack?.currentDateRange.endExclusive).toBe(
        "2026-12-01"
      );
    } finally {
      db.close();
    }
  });
});
