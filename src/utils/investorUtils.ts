import { MonthlyInvestorData } from '@/types';

// Get unique investor count (excluding duplicates across uploads)
export const getUniqueInvestorCount = (data: MonthlyInvestorData[]): number => {
  const uniqueNames = new Set(data.map(investor => investor.name));
  return uniqueNames.size;
};

// Toggle grouping for monthly data
export const toggleGrouping = async (shouldGroup: boolean): Promise<void> => {
  const { getMonthlyCSVData, saveMonthlyData, groupInvestorsByFund } = await import('./csvUtils');
  const { hybridStorage } = await import('./storageUtils');
  
  const currentData = await getMonthlyCSVData();
  
  if (shouldGroup) {
    // Group the data
    const groupedData = groupInvestorsByFund(currentData);
    await hybridStorage.setItem("monthlyCSVData", groupedData);
  } else {
    // Ungroup the data - expand individual investors from grouped entries
    const ungroupedData: MonthlyInvestorData[] = [];
    
    currentData.forEach(investor => {
      if (investor.individualInvestors && investor.individualInvestors.length > 0) {
        // This is a grouped entry, expand it
        ungroupedData.push(...investor.individualInvestors);
      } else {
        // This is already an individual investor
        ungroupedData.push(investor);
      }
    });
    
    await hybridStorage.setItem("monthlyCSVData", ungroupedData);
  }
};