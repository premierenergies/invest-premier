
import { read, utils } from "xlsx";
import { Investor, FilterOptions, AnalyticsSummary } from "@/types";

// Parse the xlsx file and return the data
export const parseExcelFile = async (file: File): Promise<Investor[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = utils.sheet_to_json(worksheet);
        
        const investors: Investor[] = json.map((row: any) => {
          // Access columns with the exact column names from Excel
          // Convert values to appropriate types
          const boughtOn18 = parseFloat(row["AS ON 18/04/2025 BOUGHT"] || 0);
          const soldOn25 = parseFloat(row["SOLD AS ON 25/04/2025"] || 0);
          
          return {
            name: row["NAME"] || "Unknown",
            boughtOn18,
            soldOn25,
            percentToEquity: parseFloat(row["% to EQUITY"] || 0),
            category: row["CATEGORY"] || "Unknown",
            netChange: soldOn25 - boughtOn18
          };
        });
        
        resolve(investors);
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

// Save investors data to localStorage
export const saveInvestorsData = (investors: Investor[]): void => {
  localStorage.setItem("investorsData", JSON.stringify(investors));
};

// Get investors data from localStorage
export const getInvestorsData = (): Investor[] => {
  const data = localStorage.getItem("investorsData");
  if (!data) return [];
  return JSON.parse(data);
};

// Filter and sort investors data
export const filterInvestors = (
  investors: Investor[],
  filters: FilterOptions
): Investor[] => {
  return investors
    .filter((investor) => {
      const matchesCategory = !filters.category || investor.category === filters.category;
      const matchesSearch = !filters.searchQuery || 
        investor.name.toLowerCase().includes(filters.searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      const sortField = filters.sortBy;
      const sortOrder = filters.sortOrder === "asc" ? 1 : -1;
      
      if (a[sortField] < b[sortField]) return -1 * sortOrder;
      if (a[sortField] > b[sortField]) return 1 * sortOrder;
      return 0;
    });
};

// Get unique categories from investors data
export const getUniqueCategories = (investors: Investor[]): string[] => {
  const categories = new Set<string>();
  investors.forEach((investor) => {
    if (investor.category) {
      categories.add(investor.category);
    }
  });
  return Array.from(categories);
};

// Generate analytics summary from investors data
export const generateAnalyticsSummary = (investors: Investor[]): AnalyticsSummary => {
  if (!investors.length) {
    return {
      totalInvestors: 0,
      totalBought: 0,
      totalSold: 0,
      netPosition: 0,
      topCategories: [],
      topGainer: null,
      topSeller: null,
    };
  }
  
  // Calculate totals
  const totalInvestors = investors.length;
  const totalBought = investors.reduce((sum, investor) => sum + investor.boughtOn18, 0);
  const totalSold = investors.reduce((sum, investor) => sum + investor.soldOn25, 0);
  const netPosition = totalSold - totalBought;
  
  // Find top categories by count
  const categoryCount: Record<string, number> = {};
  investors.forEach((investor) => {
    categoryCount[investor.category] = (categoryCount[investor.category] || 0) + 1;
  });
  
  const topCategories = Object.keys(categoryCount)
    .map((category) => ({
      category,
      count: categoryCount[category],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Find top gainer and seller
  const sortedByNetChange = [...investors].sort((a, b) => 
    (b.netChange || 0) - (a.netChange || 0)
  );
  
  return {
    totalInvestors,
    totalBought,
    totalSold,
    netPosition,
    topCategories,
    topGainer: sortedByNetChange[0] || null,
    topSeller: sortedByNetChange[sortedByNetChange.length - 1] || null,
  };
};
