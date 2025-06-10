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
          // Handle new format - extract dates dynamically
          const keys = Object.keys(row);
          
          // Find the date columns (they contain dates in the format)
          const startDateKey = keys.find(key => key.includes('As on') && key.includes('May') && !key.includes('30'));
          const endDateKey = keys.find(key => key.includes('As on') && key.includes('30 May'));
          
          const startPosition = parseFloat(row[startDateKey || 'As on 02 May 2025'] || 0);
          const endPosition = parseFloat(row[endDateKey || 'As on 30 May 2025'] || 0);
          const bought = parseFloat(row["Bought"] || 0);
          const sold = parseFloat(row["Sold"] || 0);
          const name = row["Name"] || "Unknown";
          
          return {
            name,
            boughtOn18: bought,
            soldOn25: sold,
            percentToEquity: parseFloat(row["% to Equity"] || row["Percentage"] || 0),
            category: row["Category"] || "Unknown",
            netChange: sold - bought,
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

// Merge investors by fund group (first 2 words)
export const mergeInvestorsByFundGroup = (investors: Investor[]): Investor[] => {
  const groupedData: Record<string, {
    investors: Investor[];
    totalBought: number;
    totalSold: number;
    totalEquity: number;
    category: string;
  }> = {};

  // Group investors by fund group
  investors.forEach(investor => {
    const group = investor.fundGroup || getFundGroup(investor.name);
    
    if (!groupedData[group]) {
      groupedData[group] = {
        investors: [],
        totalBought: 0,
        totalSold: 0,
        totalEquity: 0,
        category: investor.category
      };
    }
    
    groupedData[group].investors.push(investor);
    groupedData[group].totalBought += investor.boughtOn18;
    groupedData[group].totalSold += investor.soldOn25;
    groupedData[group].totalEquity += investor.percentToEquity;
  });

  // Create merged investor records
  return Object.entries(groupedData).map(([group, data]) => ({
    name: group,
    boughtOn18: data.totalBought,
    soldOn25: data.totalSold,
    percentToEquity: data.totalEquity,
    category: data.category,
    netChange: data.totalSold - data.totalBought,
    fundGroup: group,
    individualInvestors: data.investors // Store individual investors for breakdown
  }));
};

// Save investors data to localStorage with month identifier
export const saveInvestorsData = (month1Data: Investor[], month2Data: Investor[]): void => {
  // Merge by fund groups before saving
  const mergedMonth1 = mergeInvestorsByFundGroup(month1Data);
  const mergedMonth2 = mergeInvestorsByFundGroup(month2Data);
  
  localStorage.setItem("investorsDataMonth1", JSON.stringify(mergedMonth1));
  localStorage.setItem("investorsDataMonth2", JSON.stringify(mergedMonth2));
  
  // Also save original data for detailed breakdown if needed
  localStorage.setItem("originalInvestorsDataMonth1", JSON.stringify(month1Data));
  localStorage.setItem("originalInvestorsDataMonth2", JSON.stringify(month2Data));
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

// Get original (unmerged) investors data from localStorage
export const getOriginalInvestorsData = (): { month1: Investor[], month2: Investor[] } => {
  const month1Data = localStorage.getItem("originalInvestorsDataMonth1");
  const month2Data = localStorage.getItem("originalInvestorsDataMonth2");
  
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
