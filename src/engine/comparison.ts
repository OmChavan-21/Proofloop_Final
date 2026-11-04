
import type { Database } from "sql.js";
import { getProductMargins } from "./metrics";

export interface MarginComparison {
  productId: string;
  productName: string;
  previousMargin: number;
  currentMargin: number;
  marginChange: number;
  status: "declined" | "improved" | "unchanged" | "new";
}

export function compareProductMargins(
  db: Database,
  previousStart: string,
  previousEnd: string,
  currentStart: string,
  currentEnd: string
): MarginComparison[] {
  const previous = getProductMargins(db, previousStart, previousEnd);
  const current = getProductMargins(db, currentStart, currentEnd);

  const previousMap = new Map(
    previous.map((item) => [item.productId, item])
  );

  return current.map((item) => {
    const oldItem = previousMap.get(item.productId);

    if (!oldItem) {
      return {
        productId: item.productId,
        productName: item.productName,
        previousMargin: 0,
        currentMargin: item.grossMargin,
        marginChange: 0,
        status: "new"
      };
    }

    const change = item.grossMargin - oldItem.grossMargin;

    return {
      productId: item.productId,
      productName: item.productName,
      previousMargin: oldItem.grossMargin,
      currentMargin: item.grossMargin,
      marginChange: change,
      status:
        change < -0.01
          ? "declined"
          : change > 0.01
            ? "improved"
            : "unchanged"
    };
  });
}
