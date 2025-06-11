
export interface Investor {
  name: string;
  boughtOn18: number;
  soldOn25: number;
  percentToEquity: number;
  category: string;
  netChange?: number;
  fundGroup?: string;
  startPosition?: number;
  endPosition?: number;
  individualInvestors?: Investor[]; // For merged fund groups, store individual investors
}

export interface InvestorComparison {
  name: string;
  month1: Investor;
  month2: Investor;
  behaviorType: 'buyer' | 'seller' | 'holder' | 'new' | 'exited';
  trendChange: number; // Change in net position between dates
  fundGroup: string;
}

export interface FilterOptions {
  category: string | null;
  sortBy: 'name' | 'boughtOn18' | 'soldOn25' | 'percentToEquity' | 'netChange';
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
  fundGroup: string | null;
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
