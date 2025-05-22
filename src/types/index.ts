
export interface Investor {
  name: string;
  boughtOn18: number;
  soldOn25: number;
  percentToEquity: number;
  category: string;
  netChange?: number;
}

export interface FilterOptions {
  category: string | null;
  sortBy: 'name' | 'boughtOn18' | 'soldOn25' | 'percentToEquity' | 'netChange';
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string[];
    borderColor?: string[];
    borderWidth?: number;
  }[];
}

export interface AnalyticsSummary {
  totalInvestors: number;
  totalBought: number;
  totalSold: number;
  netPosition: number;
  topCategories: {
    category: string;
    count: number;
  }[];
  topGainer: Investor | null;
  topSeller: Investor | null;
}
