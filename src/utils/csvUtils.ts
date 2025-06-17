
import { MonthlyInvestorData, MonthlyDataFile } from '@/types';

// Parse monthly Excel file and extract data
export const parseMonthlyExcelFile = async (file: File): Promise<{
  date: string;
  data: MonthlyInvestorData[];
}> => {
  const { read, utils } = await import('xlsx');
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = utils.sheet_to_json(worksheet);
        
        console.log("Raw monthly Excel data:", json.slice(0, 3));
        
        // Extract date from filename or first column header
        const headers = Object.keys(json[0] || {});
        const sharesHeader = headers.find(h => h.includes('SHARES on'));
        const dateMatch = sharesHeader?.match(/SHARES on (.+)/);
        const extractedDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 7);
        
        // Convert to YYYY-MM format
        const date = formatDateToYYYYMM(extractedDate);
        
        const monthlyData: MonthlyInvestorData[] = json.map((row: any, index: number) => {
          const parseNumber = (value: any): number => {
            if (!value || value === '') return 0;
            const str = value.toString().replace(/,/g, '');
            const num = parseFloat(str);
            return isNaN(num) ? 0 : num;
          };
          
          const name = row["NAME"] || `Unknown-${index}`;
          const shares = parseNumber(row[sharesHeader || "SHARES"]);
          const category = row["CATEGORY"] || "Unknown";
          const description = row["DESCRIPTION"] || "";
          
          return {
            name,
            category,
            description,
            monthlyShares: { [date]: shares },
            fundGroup: getFundGroup(name)
          };
        });
        
        console.log(`Processed monthly data for ${date}:`, monthlyData.length, "records");
        resolve({ date, data: monthlyData });
      } catch (error) {
        console.error("Error parsing monthly Excel file:", error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

// Format date string to YYYY-MM
const formatDateToYYYYMM = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toISOString().slice(0, 7);
  } catch {
    // Fallback to current month if parsing fails
    return new Date().toISOString().slice(0, 7);
  }
};

// Get fund group from name (first 2 words)
const getFundGroup = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`.toUpperCase();
  }
  return words[0]?.toUpperCase() || "UNKNOWN";
};

// Save monthly data to localStorage and merge with existing CSV data
export const saveMonthlyData = (newDate: string, newData: MonthlyInvestorData[], fileName: string): void => {
  const existingData = getMonthlyCSVData();
  const existingFiles = getUploadedFiles();
  
  // Merge new data with existing
  const mergedData = mergeMonthlyData(existingData, newData, newDate);
  
  // Save merged data
  localStorage.setItem("monthlyCSVData", JSON.stringify(mergedData));
  
  // Track uploaded files
  const newFile: MonthlyDataFile = {
    date: newDate,
    fileName,
    uploadDate: new Date().toISOString(),
    recordCount: newData.length
  };
  
  const updatedFiles = [...existingFiles.filter(f => f.date !== newDate), newFile];
  localStorage.setItem("uploadedFiles", JSON.stringify(updatedFiles));
  
  console.log(`Saved monthly data for ${newDate}. Total investors:`, mergedData.length);
};

// Get monthly CSV data from localStorage
export const getMonthlyCSVData = (): MonthlyInvestorData[] => {
  const data = localStorage.getItem("monthlyCSVData");
  return data ? JSON.parse(data) : [];
};

// Get list of uploaded files
export const getUploadedFiles = (): MonthlyDataFile[] => {
  const data = localStorage.getItem("uploadedFiles");
  return data ? JSON.parse(data) : [];
};

// Merge new monthly data with existing data
const mergeMonthlyData = (
  existingData: MonthlyInvestorData[], 
  newData: MonthlyInvestorData[], 
  newDate: string
): MonthlyInvestorData[] => {
  const merged = new Map<string, MonthlyInvestorData>();
  
  // Add existing data to map
  existingData.forEach(investor => {
    merged.set(investor.name, { ...investor });
  });
  
  // Merge new data
  newData.forEach(newInvestor => {
    const existing = merged.get(newInvestor.name);
    if (existing) {
      // Update existing investor with new month data
      existing.monthlyShares[newDate] = newInvestor.monthlyShares[newDate];
      // Update category and description if they've changed
      existing.category = newInvestor.category;
      existing.description = newInvestor.description;
    } else {
      // Add new investor
      merged.set(newInvestor.name, newInvestor);
    }
  });
  
  return Array.from(merged.values());
};

// Export CSV data as downloadable file
export const exportToCSV = (): void => {
  const data = getMonthlyCSVData();
  const files = getUploadedFiles();
  
  if (data.length === 0) return;
  
  // Get all unique months
  const allMonths = Array.from(new Set(
    data.flatMap(investor => Object.keys(investor.monthlyShares))
  )).sort();
  
  // Create CSV header
  const headers = ['Name', 'Category', 'Description', 'Fund Group', ...allMonths];
  
  // Create CSV rows
  const rows = data.map(investor => [
    investor.name,
    investor.category,
    investor.description,
    investor.fundGroup || '',
    ...allMonths.map(month => investor.monthlyShares[month] || 0)
  ]);
  
  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  
  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `investor_data_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Get available months for filtering
export const getAvailableMonths = (): string[] => {
  const data = getMonthlyCSVData();
  const months = new Set<string>();
  
  data.forEach(investor => {
    Object.keys(investor.monthlyShares).forEach(month => {
      months.add(month);
    });
  });
  
  return Array.from(months).sort();
};

// Filter monthly data based on criteria
export const filterMonthlyData = (
  data: MonthlyInvestorData[],
  filters: {
    category?: string;
    searchQuery?: string;
    minShares?: number;
    maxShares?: number;
    selectedMonths?: string[];
  }
): MonthlyInvestorData[] => {
  return data.filter(investor => {
    // Category filter
    if (filters.category && filters.category !== 'all' && investor.category !== filters.category) {
      return false;
    }
    
    // Search filter
    if (filters.searchQuery && !investor.name.toLowerCase().includes(filters.searchQuery.toLowerCase())) {
      return false;
    }
    
    // Share count filters
    if (filters.selectedMonths && filters.selectedMonths.length > 0) {
      const relevantShares = filters.selectedMonths.map(month => investor.monthlyShares[month] || 0);
      const maxShares = Math.max(...relevantShares);
      const minShares = Math.min(...relevantShares);
      
      if (filters.minShares !== undefined && maxShares < filters.minShares) {
        return false;
      }
      
      if (filters.maxShares !== undefined && minShares > filters.maxShares) {
        return false;
      }
    }
    
    return true;
  });
};
