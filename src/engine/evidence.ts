
import type { Database } from "sql.js";
import {
  compareProductMargins,
  type MarginComparison
} from "./comparison";

export interface ProductEvidence {
  productId: string;
  productName: string;
  previousMargin: number;
  currentMargin: number;
  marginChange: number;
  status: MarginComparison["status"];
  previousTransactionIds: string[];
  currentTransactionIds: string[];
  previousTransactionCount: number;
  currentTransactionCount: number;
  previousDateRange: {
    start: string;
    endExclusive: string;
  };
  currentDateRange: {
    start: string;
    endExclusive: string;
  };
}

function getTransactionIds(
  db: Database,
  productId: string,
  startDate: string,
  endDate: string
): string[] {
  const statement = db.prepare(`
    SELECT DISTINCT s.id AS transactionId
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE si.product_id = $productId
      AND s.status = 'completed'
      AND s.order_date >= $startDate
      AND s.order_date < $endDate
    ORDER BY s.id
  `);

  try {
    statement.bind({
      $productId: productId,
      $startDate: startDate,
      $endDate: endDate
    });

    const ids: string[] = [];

    while (statement.step()) {
      const row = statement.getAsObject();
      ids.push(String(row.transactionId));
    }

    return ids;
  } finally {
    statement.free();
  }
}

export function generateProductEvidence(
  db: Database,
  previousStart: string,
  previousEnd: string,
  currentStart: string,
  currentEnd: string
): ProductEvidence[] {
  const comparisons = compareProductMargins(
    db,
    previousStart,
    previousEnd,
    currentStart,
    currentEnd
  );

  return comparisons.map((item) => {
    const previousTransactionIds = getTransactionIds(
      db,
      item.productId,
      previousStart,
      previousEnd
    );

    const currentTransactionIds = getTransactionIds(
      db,
      item.productId,
      currentStart,
      currentEnd
    );

    return {
      productId: item.productId,
      productName: item.productName,
      previousMargin: item.previousMargin,
      currentMargin: item.currentMargin,
      marginChange: item.marginChange,
      status: item.status,
      previousTransactionIds,
      currentTransactionIds,
      previousTransactionCount: previousTransactionIds.length,
      currentTransactionCount: currentTransactionIds.length,
      previousDateRange: {
        start: previousStart,
        endExclusive: previousEnd
      },
      currentDateRange: {
        start: currentStart,
        endExclusive: currentEnd
      }
    };
  });
}
