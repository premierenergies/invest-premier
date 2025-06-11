
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
          // Handle the exact format from the image
          const keys = Object.keys(row);
          
          // Find the date columns dynamically - looking for "As on" pattern
          const startDateKey = keys.find(key => 
            key.includes('As on') && 
            !key.toLowerCase().includes('sold') && 
            !key.toLowerCase().includes('bought') &&
            keys.indexOf(key) < keys.findIndex(k => k.toLowerCase().includes('sold'))
          );
          
          const endDateKey = keys.find(key => 
            key.includes('As on') && 
            !key.toLowerCase().includes('sold') && 
            !key.toLowerCase().includes('bought') &&
            keys.indexOf(key) > keys.findIndex(k => k.toLowerCase().includes('bought'))
          );
          
          // Parse numeric values, handling commas
          const parseNumber = (value: any): number => {
            if (!value) return 0;
            const str = value.toString().replace(/,/g, '');
            return parseFloat(str) || 0;
          };
          
          const startPosition = parseNumber(row[startDateKey || 'As on 02 May 2025']);
          const endPosition = parseNumber(row[endDateKey || 'As on 30 May 2025']);
          const sold = parseNumber(row["Sold"]);
          const bought = parseNumber(row["Bought"]);
          const name = row["Name"] || "Unknown";
          
          return {
            name,
            boughtOn18: bought,
            soldOn25: sold,
            percentToEquity: endPosition, // Using end position as % to equity
            category: row["Category"] || "Unknown",
            netChange: bought - sold, // Net change calculation
            fundGroup: getFundGroup(name),
            startPosition,
            endPosition
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
    totalStartPosition: number;
    totalEndPosition: number;
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
        totalStartPosition: 0,
        totalEndPosition: 0,
        category: investor.category
      };
    }
    
    groupedData[group].investors.push(investor);
    groupedData[group].totalBought += investor.boughtOn18;
    groupedData[group].totalSold += investor.soldOn25;
    groupedData[group].totalStartPosition += investor.startPosition || 0;
    groupedData[group].totalEndPosition += investor.endPosition || 0;
  });

  // Create merged investor records
  return Object.entries(groupedData).map(([group, data]) => ({
    name: group,
    boughtOn18: data.totalBought,
    soldOn25: data.totalSold,
    percentToEquity: data.totalEndPosition,
    category: data.category,
    netChange: data.totalBought - data.totalSold,
    fundGroup: group,
    startPosition: data.totalStartPosition,
    endPosition: data.totalEndPosition,
    individualInvestors: data.investors // Store individual investors for breakdown
  }));
};

// Save investors data to localStorage
export const saveInvestorsData = (investorData: Investor[]): void => {
  // Merge by fund groups before saving
  const mergedData = mergeInvestorsByFundGroup(investorData);
  
  localStorage.setItem("investorsData", JSON.stringify(mergedData));
  
  // Also save original data for detailed breakdown if needed
  localStorage.setItem("originalInvestorsData", JSON.stringify(investorData));
};

// Get investors data from localStorage
export const getInvestorsData = (): Investor[] => {
  const data = localStorage.getItem("investorsData");
  return data ? JSON.parse(data) : [];
};

// Get original (unmerged) investors data from localStorage
export const getOriginalInvestorsData = (): Investor[] => {
  const data = localStorage.getItem("originalInvestorsData");
  return data ? JSON.parse(data) : [];
};

// Analyze investor behavior based on position changes
export const analyzeInvestorBehavior = (investors: Investor[]): InvestorComparison[] => {
  return investors.map(investor => {
    const positionChange = (investor.endPosition || 0) - (investor.startPosition || 0);
    const netActivity = investor.boughtOn18 - investor.soldOn25;
    
    let behaviorType: InvestorComparison['behaviorType'] = 'holder';
    
    if (netActivity > 1000) behaviorType = 'buyer';
    else if (netActivity < -1000) behaviorType = 'seller';
    else if ((investor.startPosition || 0) === 0 && (investor.endPosition || 0) > 0) behaviorType = 'new';
    else if ((investor.startPosition || 0) > 0 && (investor.endPosition || 0) === 0) behaviorType = 'exited';
    
    return {
      name: investor.name,
      month1: {
        ...investor,
        percentToEquity: investor.startPosition || 0,
        netChange: 0
      },
      month2: {
        ...investor,
        percentToEquity: investor.endPosition || 0,
        netChange: netActivity
      },
      behaviorType,
      trendChange: positionChange,
      fundGroup: investor.fundGroup || getFundGroup(investor.name)
    };
  });
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
  
  const totalInvestors = investors.length;
  const totalBought = investors.reduce((sum, investor) => sum + investor.boughtOn18, 0);
  const totalSold = investors.reduce((sum, investor) => sum + investor.soldOn25, 0);
  const netPosition = totalBought - totalSold;
  
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
