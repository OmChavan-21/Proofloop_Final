
import type { Database } from "sql.js";

export interface ProductMargin {
  productId: string;
  productName: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  unitsSold: number;
}

export function getProductMargins(
  db: Database,
  startDate: string,
  endDate: string
): ProductMargin[] {
  const statement = db.prepare(`
    SELECT
      p.id AS productId,
      p.name AS productName,
      p.category,
      SUM(si.quantity * (si.unit_price - si.discount)) AS revenue,
      SUM(si.quantity * si.unit_cost) AS cost,
      SUM(si.quantity) AS unitsSold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE s.status = 'completed'
      AND s.order_date >= $startDate
      AND s.order_date < $endDate
    GROUP BY p.id, p.name, p.category
    ORDER BY revenue DESC
  `);

  try {
    statement.bind({
      $startDate: startDate,
      $endDate: endDate
    });

    const results: ProductMargin[] = [];

    while (statement.step()) {
      const row = statement.getAsObject();

      const revenue = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);
      const grossProfit = revenue - cost;

      results.push({
        productId: String(row.productId),
        productName: String(row.productName),
        category: String(row.category),
        revenue,
        cost,
        grossProfit,
        grossMargin:
          revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        unitsSold: Number(row.unitsSold ?? 0)
      });
    }

    return results;
  } finally {
    statement.free();
  }
}
