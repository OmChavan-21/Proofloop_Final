import initSqlJs, { type Database } from "sql.js";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema";
import { SEED_SQL } from "./seed";
import { getProductMargins, type ProductMargin } from "./metrics";
import { compareProductMargins } from "./comparison";
import type { CategorySnapshot, DemoSnapshot, PeriodTotals, ProductSnapshot } from "../components/dashboard/types";
import type { AuthenticatedTenant } from "../server/auth/session";

const Q3_START = "2026-07-01";
const Q3_END = "2026-10-01";
const Q4_START = "2026-10-01";
const Q4_END = "2026-12-01";

// In-memory workspace database registry
const workspaceDatabases = new Map<string, Database>();
let sqlEnginePromise: ReturnType<typeof initSqlJs> | null = null;

export async function getSqlEngine() {
  if (!sqlEnginePromise) {
    sqlEnginePromise = initSqlJs({
      locateFile: (file) =>
        file.endsWith(".wasm")
          ? join(process.cwd(), "node_modules", "sql.js", "dist", file)
          : file
    });
  }
  return sqlEnginePromise;
}

export function createEmptySnapshot(dataSource: DemoSnapshot["dataSource"] = "seeded_demo_data"): DemoSnapshot {
  return {
    dataSource,
    currency: "USD",
    q3Label: "Q3 2026",
    q4Label: "Q4 2026",
    q3RangeLabel: "July 1 – September 30, 2026",
    q4RangeLabel: "October 1 – December 31, 2026",
    q3Window: "complete",
    q4Window: "partial",
    q4Complete: false,
    lastSaleDate: null,
    q3: { revenue: 0, cost: 0, grossProfit: 0, grossMargin: 0, units: 0, saleCount: 0, saleDates: [] },
    q4: { revenue: 0, cost: 0, grossProfit: 0, grossMargin: 0, units: 0, saleCount: 0, saleDates: [] },
    marginChange: 0,
    products: [],
    categories: [],
    declinedCount: 0,
    higherUnitCostCount: 0,
    lowerNetPriceCount: 0,
    omittedFromQ4: []
  };
}

function getWorkspaceKey(workspaceId?: string, tenant?: AuthenticatedTenant): string {
  if (tenant?.workspaceId) {
    if (workspaceId && tenant.workspaceId !== workspaceId) {
      throw new Error("The selected workspace does not match the authenticated tenant context.");
    }
    return `${tenant.organizationId}:${tenant.workspaceId}`;
  }
  if (!workspaceId || workspaceId === "demo") return "demo";
  if (tenant && tenant.workspaceId !== workspaceId) {
    throw new Error("The selected workspace does not match the authenticated tenant context.");
  }
  return `workspace:${workspaceId}`;
}

function computePeriodTotals(rows: ProductMargin[], saleDates: string[]): PeriodTotals {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const units = rows.reduce((sum, row) => sum + row.unitsSold, 0);
  const grossProfit = revenue - cost;
  return {
    revenue,
    cost,
    grossProfit,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    units,
    saleCount: saleDates.length,
    saleDates,
  };
}

function perUnit(amount: number, units: number): number {
  return units > 0 ? amount / units : 0;
}

function readSaleDates(db: Database): string[] {
  const statement = db.prepare(`
    SELECT order_date AS orderDate
    FROM sales
    WHERE status = 'completed'
    ORDER BY order_date
  `);

  try {
    const dates: string[] = [];
    while (statement.step()) {
      const row = statement.getAsObject();
      dates.push(String(row.orderDate));
    }
    return dates;
  } finally {
    statement.free();
  }
}

/**
 * Retrieves or initializes an in-memory SQLite database for a workspace.
 * When workspaceId is empty, "demo", or undefined, returns the demo catalog.
 * Any newly created workspace receives an isolated, completely empty database.
 */
export async function getWorkspaceDatabase(workspaceId?: string, tenant?: AuthenticatedTenant): Promise<Database> {
  if (process.env.DATABASE_URL) {
    throw new Error("PostgreSQL is configured; use the authenticated PostgreSQL workspace repository.");
  }
  const key = getWorkspaceKey(workspaceId, tenant);

  const existing = workspaceDatabases.get(key);
  if (existing) {
    return existing;
  }

  const SQL = await getSqlEngine();
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);

  // Only the unauthenticated "demo" workspace receives sample seed data.
  // Real tenant workspaces start 100% empty.
  if (key === "demo") {
    db.run(SEED_SQL);
  }

  workspaceDatabases.set(key, db);
  return db;
}

export interface AddProductParams {
  id?: string;
  name: string;
  category: string;
  price?: number;
  cost?: number;
  quantity?: number;
  orderDate?: string;
}

/**
 * Adds a product and optional initial sale item to a specific workspace.
 */
export async function addWorkspaceProduct(workspaceId: string, params: AddProductParams, tenant?: AuthenticatedTenant): Promise<ProductSnapshot> {
  if (process.env.DATABASE_URL) {
    throw new Error("PostgreSQL is configured; use the authenticated PostgreSQL workspace repository.");
  }

  const db = await getWorkspaceDatabase(workspaceId, tenant);
  const productId = params.id || `P-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const productName = params.name.trim();
  const category = params.category.trim() || "General";

  // Insert product
  const stmt = db.prepare("INSERT OR IGNORE INTO products (id, name, category) VALUES ($id, $name, $category)");
  try {
    stmt.bind({ $id: productId, $name: productName, $category: category });
    stmt.step();
  } finally {
    stmt.free();
  }

  // If initial units and pricing are provided, create sale and sale_item in Q4
  const quantity = params.quantity && params.quantity > 0 ? params.quantity : 0;
  const unitPrice = params.price && params.price >= 0 ? params.price : 0;
  const unitCost = params.cost && params.cost >= 0 ? params.cost : 0;
  const orderDate = params.orderDate || "2026-10-15";

  if (quantity > 0 && unitPrice > 0) {
    const saleId = `S-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const saleStmt = db.prepare("INSERT INTO sales (id, order_date, status) VALUES ($id, $orderDate, 'completed')");
    try {
      saleStmt.bind({ $id: saleId, $orderDate: orderDate });
      saleStmt.step();
    } finally {
      saleStmt.free();
    }

    const itemStmt = db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, unit_cost, discount)
      VALUES ($id, $saleId, $productId, $quantity, $unitPrice, $unitCost, 0)
    `);
    try {
      itemStmt.bind({
        $id: `I-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        $saleId: saleId,
        $productId: productId,
        $quantity: quantity,
        $unitPrice: unitPrice,
        $unitCost: unitCost,
      });
      itemStmt.step();
    } finally {
      itemStmt.free();
    }
  }

  const revenue = quantity * unitPrice;
  const cost = quantity * unitCost;
  const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;

  return {
    productId,
    productName,
    category,
    q3Revenue: 0,
    q4Revenue: revenue,
    q3Units: 0,
    q4Units: quantity,
    q3Margin: 0,
    q4Margin: margin,
    marginChange: 0,
    q3UnitCost: 0,
    q4UnitCost: unitCost,
    q3NetPrice: 0,
    q4NetPrice: unitPrice,
    status: "new",
  };
}

export function computeSnapshotFromDb(db: Database, isDemo = false): DemoSnapshot {
  // Check product count
  const countStmt = db.prepare("SELECT COUNT(*) AS count FROM products");
  let productCount = 0;
  try {
    if (countStmt.step()) {
      productCount = Number(countStmt.getAsObject().count ?? 0);
    }
  } finally {
    countStmt.free();
  }

  if (productCount === 0) {
    return createEmptySnapshot(isDemo ? "seeded_demo_data" : "workspace_data");
  }

  const q3Rows = getProductMargins(db, Q3_START, Q3_END);
  const q4Rows = getProductMargins(db, Q4_START, Q4_END);
  const comparisons = compareProductMargins(db, Q3_START, Q3_END, Q4_START, Q4_END);
  const saleDates = readSaleDates(db);
  const q3Dates = saleDates.filter((date) => date < Q3_END);
  const q4Dates = saleDates.filter((date) => date >= Q4_START);
  const q3 = computePeriodTotals(q3Rows, q3Dates);
  const q4 = computePeriodTotals(q4Rows, q4Dates);
  const q3Map = new Map(q3Rows.map((row) => [row.productId, row]));
  const q4Map = new Map(q4Rows.map((row) => [row.productId, row]));

  const products: ProductSnapshot[] = comparisons.map((item) => {
    const previous = q3Map.get(item.productId);
    const current = q4Map.get(item.productId);
    return {
      productId: item.productId,
      productName: item.productName,
      category: current?.category ?? previous?.category ?? "Uncategorized",
      q3Revenue: previous?.revenue ?? 0,
      q4Revenue: current?.revenue ?? 0,
      q3Units: previous?.unitsSold ?? 0,
      q4Units: current?.unitsSold ?? 0,
      q3Margin: item.previousMargin,
      q4Margin: item.currentMargin,
      marginChange: item.marginChange,
      q3UnitCost: perUnit(previous?.cost ?? 0, previous?.unitsSold ?? 0),
      q4UnitCost: perUnit(current?.cost ?? 0, current?.unitsSold ?? 0),
      q3NetPrice: perUnit(previous?.revenue ?? 0, previous?.unitsSold ?? 0),
      q4NetPrice: perUnit(current?.revenue ?? 0, current?.unitsSold ?? 0),
      status: item.status,
    };
  });

  const categoryTotals = new Map<string, { revenue: number; grossProfit: number; units: number }>();
  for (const product of products) {
    const current = categoryTotals.get(product.category) ?? { revenue: 0, grossProfit: 0, units: 0 };
    current.revenue += product.q4Revenue;
    current.grossProfit += product.q4Revenue - product.q4UnitCost * product.q4Units;
    current.units += product.q4Units;
    categoryTotals.set(product.category, current);
  }

  const categories: CategorySnapshot[] = [...categoryTotals.entries()]
    .map(([category, value]) => ({
      category,
      revenue: value.revenue,
      grossProfit: value.grossProfit,
      grossMargin: value.revenue > 0 ? (value.grossProfit / value.revenue) * 100 : 0,
      units: value.units,
      share: q4.revenue > 0 ? (value.revenue / q4.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const declinedProducts = products.filter((p) => p.status === "declined");
  const higherUnitCostProducts = products.filter((p) => p.q4UnitCost > p.q3UnitCost && p.q3Units > 0 && p.q4Units > 0);
  const lowerNetPriceProducts = products.filter((p) => p.q4NetPrice < p.q3NetPrice && p.q3Units > 0 && p.q4Units > 0);
  const omittedFromQ4 = products.filter((p) => p.q3Units > 0 && p.q4Units === 0).map((p) => p.productName);

  return {
    dataSource: isDemo ? "seeded_demo_data" : "workspace_data",
    currency: "USD",
    q3Label: "Q3 2026",
    q4Label: "Q4 2026",
    q3RangeLabel: "July 1 – September 30, 2026",
    q4RangeLabel: "October 1 – December 31, 2026",
    q3Window: "complete",
    q4Window: "partial",
    q4Complete: false,
    lastSaleDate: q4Dates.at(-1) ?? null,
    q3,
    q4,
    marginChange: q4.grossMargin - q3.grossMargin,
    products,
    categories,
    declinedCount: declinedProducts.length,
    higherUnitCostCount: higherUnitCostProducts.length,
    lowerNetPriceCount: lowerNetPriceProducts.length,
    omittedFromQ4,
  };
}

/**
 * Loads the calculated snapshot for a specific workspace.
 * If the workspace has 0 products, returns a complete empty snapshot.
 */
export async function loadWorkspaceSnapshot(workspaceId?: string, tenant?: AuthenticatedTenant): Promise<DemoSnapshot> {
  if (process.env.DATABASE_URL) {
    throw new Error("PostgreSQL is configured; use the authenticated PostgreSQL workspace repository.");
  }
  const key = getWorkspaceKey(workspaceId, tenant);
  const isDemo = key === "demo";
  const db = await getWorkspaceDatabase(workspaceId, tenant);
  return computeSnapshotFromDb(db, isDemo);
}

/**
 * Resets a single workspace or clears all workspace databases.
 * Used for testing lifecycle cleanup.
 */
export function resetWorkspaceDatabase(workspaceId?: string): void {
  const key = getWorkspaceKey(workspaceId);
  const db = workspaceDatabases.get(key);
  if (db) {
    db.close();
    workspaceDatabases.delete(key);
  }
}

export function clearAllWorkspaceDatabases(): void {
  for (const db of workspaceDatabases.values()) {
    try {
      db.close();
    } catch {
      // Ignore already closed instances
    }
  }
  workspaceDatabases.clear();
}
