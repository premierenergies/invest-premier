
import { read, utils } from "xlsx";
import { Investor, FilterOptions, AnalyticsSummary, InvestorComparison } from "@/types";

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
          const boughtOn18 = parseFloat(row["BOUGHT"] || 0);
          const soldOn25 = parseFloat(row["SOLD"] || 0);
          const name = row["NAME"] || "Unknown";
          
          return {
            name,
            boughtOn18,
            soldOn25,
            percentToEquity: parseFloat(row["% to EQUITY"] || 0),
            category: row["CATEGORY"] || "Unknown",
            netChange: soldOn25 - boughtOn18,
            fundGroup: getFundGroup(name)
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

// Extract fund group from investor name (first 2 words)
export const getFundGroup = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`.toUpperCase();
  }
  return words[0]?.toUpperCase() || "UNKNOWN";
};

// Save investors data to localStorage with month identifier
export const saveInvestorsData = (month1Data: Investor[], month2Data: Investor[]): void => {
  localStorage.setItem("investorsDataMonth1", JSON.stringify(month1Data));
  localStorage.setItem("investorsDataMonth2", JSON.stringify(month2Data));
};

// Get investors data from localStorage
export const getInvestorsData = (): { month1: Investor[], month2: Investor[] } => {
  const month1Data = localStorage.getItem("investorsDataMonth1");
  const month2Data = localStorage.getItem("investorsDataMonth2");
  
  return {
    month1: month1Data ? JSON.parse(month1Data) : [],
    month2: month2Data ? JSON.parse(month2Data) : []
  };
};

// Compare investors across two months and analyze behavior
export const compareInvestorBehavior = (month1: Investor[], month2: Investor[]): InvestorComparison[] => {
  const comparisons: InvestorComparison[] = [];
  const month1Map = new Map(month1.map(inv => [inv.name, inv]));
  const month2Map = new Map(month2.map(inv => [inv.name, inv]));
  
  // Get all unique investor names
  const allNames = new Set([...month1Map.keys(), ...month2Map.keys()]);
  
  allNames.forEach(name => {
    const inv1 = month1Map.get(name);
    const inv2 = month2Map.get(name);
    
    if (inv1 && inv2) {
      // Investor present in both months
      const trendChange = (inv2.netChange || 0) - (inv1.netChange || 0);
      let behaviorType: InvestorComparison['behaviorType'] = 'holder';
      
      if (trendChange > 1000) behaviorType = 'buyer';
      else if (trendChange < -1000) behaviorType = 'seller';
      
      comparisons.push({
        name,
        month1: inv1,
        month2: inv2,
        behaviorType,
        trendChange,
        fundGroup: inv1.fundGroup || getFundGroup(name)
      });
    } else if (inv1 && !inv2) {
      // Investor exited
      comparisons.push({
        name,
        month1: inv1,
        month2: { ...inv1, boughtOn18: 0, soldOn25: 0, netChange: 0 },
        behaviorType: 'exited',
        trendChange: -(inv1.netChange || 0),
        fundGroup: inv1.fundGroup || getFundGroup(name)
      });
    } else if (!inv1 && inv2) {
      // New investor
      comparisons.push({
        name,
        month1: { ...inv2, boughtOn18: 0, soldOn25: 0, netChange: 0 },
        month2: inv2,
        behaviorType: 'new',
        trendChange: inv2.netChange || 0,
        fundGroup: inv2.fundGroup || getFundGroup(name)
      });
    }
  });
  
  return comparisons;
};

// Filter and sort investors data
export const filterInvestors = (
  investors: Investor[],
  filters: FilterOptions
): Investor[] => {
  return investors
    .filter((investor) => {
      const matchesCategory = !filters.category || investor.category === filters.category;
      const matchesFundGroup = !filters.fundGroup || investor.fundGroup === filters.fundGroup;
      const matchesSearch = !filters.searchQuery || 
        investor.name.toLowerCase().includes(filters.searchQuery.toLowerCase());
      return matchesCategory && matchesFundGroup && matchesSearch;
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

// Get unique fund groups from investors data
export const getUniqueFundGroups = (investors: Investor[]): string[] => {
  const fundGroups = new Set<string>();
  investors.forEach((investor) => {
    if (investor.fundGroup) {
      fundGroups.add(investor.fundGroup);
    }
  });
  return Array.from(fundGroups).sort();
};

// Generate analytics summary from investors data
export const generateAnalyticsSummary = (month1: Investor[], month2: Investor[]): AnalyticsSummary => {
  if (!month1.length && !month2.length) {
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
  
  // Use month2 data as primary, fallback to month1 if month2 is empty
  const primaryData = month2.length > 0 ? month2 : month1;
  
  // Calculate totals for primary month
  const totalInvestors = primaryData.length;
  const totalBought = primaryData.reduce((sum, investor) => sum + investor.boughtOn18, 0);
  const totalSold = primaryData.reduce((sum, investor) => sum + investor.soldOn25, 0);
  const netPosition = totalSold - totalBought;
  
  // Find top categories by count
  const categoryCount: Record<string, number> = {};
  primaryData.forEach((investor) => {
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
  const sortedByNetChange = [...primaryData].sort((a, b) => 
    (b.netChange || 0) - (a.netChange || 0)
  );
  
  // Monthly comparison if both months have data
  let monthlyComparison;
  if (month1.length > 0 && month2.length > 0) {
    const comparisons = compareInvestorBehavior(month1, month2);
    monthlyComparison = {
      totalInvestorsMonth1: month1.length,
      totalInvestorsMonth2: month2.length,
      newInvestors: comparisons.filter(c => c.behaviorType === 'new').length,
      exitedInvestors: comparisons.filter(c => c.behaviorType === 'exited').length,
      buyerCount: comparisons.filter(c => c.behaviorType === 'buyer').length,
      sellerCount: comparisons.filter(c => c.behaviorType === 'seller').length,
      holderCount: comparisons.filter(c => c.behaviorType === 'holder').length,
    };
  }
  
  return {
    totalInvestors,
    totalBought,
    totalSold,
    netPosition,
    topCategories,
    topGainer: sortedByNetChange[0] || null,
    topSeller: sortedByNetChange[sortedByNetChange.length - 1] || null,
    monthlyComparison,
  };
};
