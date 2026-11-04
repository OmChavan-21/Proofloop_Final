export interface PeriodTotals {
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
  saleCount: number;
  saleDates: string[];
}

export interface ProductSnapshot {
  productId: string;
  productName: string;
  category: string;
  q3Revenue: number;
  q4Revenue: number;
  q3Units: number;
  q4Units: number;
  q3Margin: number;
  q4Margin: number;
  marginChange: number;
  q3UnitCost: number;
  q4UnitCost: number;
  q3NetPrice: number;
  q4NetPrice: number;
  status: "declined" | "improved" | "unchanged" | "new";
}

export interface CategorySnapshot {
  category: string;
  revenue: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
  share: number;
}

export interface DemoSnapshot {
  dataSource: "seeded_demo_data";
  currency: "USD";
  q3Label: "Q3 2026";
  q4Label: "Q4 2026";
  q3RangeLabel: string;
  q4RangeLabel: string;
  q3Window: string;
  q4Window: string;
  q4Complete: false;
  lastSaleDate: string | null;
  q3: PeriodTotals;
  q4: PeriodTotals;
  marginChange: number;
  products: ProductSnapshot[];
  categories: CategorySnapshot[];
  declinedCount: number;
  higherUnitCostCount: number;
  lowerNetPriceCount: number;
  omittedFromQ4: string[];
}
