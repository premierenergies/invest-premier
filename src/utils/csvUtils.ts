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
        const sharesHeader = headers.find(h => h.includes('SHARES') || h.includes('AS ON'));
        const dateMatch = sharesHeader?.match(/(?:SHARES (?:AS )?ON|AS ON)\s+(.+)/i);
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
    // Handle various date formats
    const cleanDate = dateStr.replace(/st|nd|rd|th/g, '').trim();
    const date = new Date(cleanDate);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 7);
    }
    
    // Fallback: try to extract month and year
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const parts = cleanDate.toLowerCase().split(/\s+/);
    const monthIndex = monthNames.findIndex(month => parts.some(part => part.includes(month.slice(0, 3))));
    const year = parts.find(part => /20\d{2}/.test(part));
    
    if (monthIndex !== -1 && year) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    }
    
    // Final fallback
    return new Date().toISOString().slice(0, 7);
  } catch {
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

// Group investors by fund group (first two words of name)
export const groupInvestorsByFund = (investors: MonthlyInvestorData[]): MonthlyInvestorData[] => {
  const grouped = new Map<string, MonthlyInvestorData[]>();
  
  // Group by fund group
  investors.forEach(investor => {
    const fundGroup = getFundGroup(investor.name);
    if (!grouped.has(fundGroup)) {
      grouped.set(fundGroup, []);
    }
    grouped.get(fundGroup)!.push(investor);
  });
  
  // Create grouped investors
  const result: MonthlyInvestorData[] = [];
  
  grouped.forEach((groupInvestors, fundGroup) => {
    if (groupInvestors.length === 1) {
      // Single investor, keep as is
      result.push(groupInvestors[0]);
    } else {
      // Multiple investors, create grouped entry
      const combinedShares: Record<string, number> = {};
      
      // Combine shares across all months
      groupInvestors.forEach(investor => {
        Object.entries(investor.monthlyShares).forEach(([month, shares]) => {
          if (!combinedShares[month]) {
            combinedShares[month] = 0;
          }
          combinedShares[month] += shares;
        });
      });
      
      // Use the category and description from the first investor
      const mainInvestor = groupInvestors[0];
      
      result.push({
        name: fundGroup,
        category: mainInvestor.category,
        description: `Grouped fund (${groupInvestors.length} entities)`,
        monthlyShares: combinedShares,
        fundGroup,
        individualInvestors: groupInvestors
      });
    }
  });
  
  return result;
};

// Save monthly data to localStorage and merge with existing CSV data
export const saveMonthlyData = (newDate: string, newData: MonthlyInvestorData[], fileName: string): void => {
  const existingData = getMonthlyCSVData();
  const existingFiles = getUploadedFiles();
  
  // Merge new data with existing
  const mergedData = mergeMonthlyData(existingData, newData, newDate);
  
  // Group by fund groups
  const groupedData = groupInvestorsByFund(mergedData);
  
  // Save merged data
  localStorage.setItem("monthlyCSVData", JSON.stringify(groupedData));
  
  // Track uploaded files
  const newFile: MonthlyDataFile = {
    date: newDate,
    fileName,
    uploadDate: new Date().toISOString(),
    recordCount: newData.length
  };
  
  const updatedFiles = [...existingFiles.filter(f => f.date !== newDate), newFile];
  localStorage.setItem("uploadedFiles", JSON.stringify(updatedFiles));
  
  console.log(`Saved monthly data for ${newDate}. Total investors:`, groupedData.length);
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

// Export data to Excel with color formatting
export const exportToExcel = async (): Promise<void> => {
  const data = getMonthlyCSVData();
  if (data.length === 0) return;
  
  const { utils, write } = await import('xlsx');
  
  // Get all unique months
  const allMonths = Array.from(new Set(
    data.flatMap(investor => Object.keys(investor.monthlyShares))
  )).sort();
  
  // Create header row
  const headers = ['Name', 'Category', 'Description', 'Fund Group', ...allMonths];
  
  // Create data rows
  const rows = data.map(investor => [
    investor.name,
    investor.category,
    investor.description,
    investor.fundGroup || '',
    ...allMonths.map(month => investor.monthlyShares[month] || 0)
  ]);
  
  // Create worksheet
  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  
  // Add color formatting to month columns
  const range = utils.decode_range(worksheet['!ref'] || 'A1');
  for (let row = 1; row <= range.e.r; row++) {
    for (let col = 4; col < headers.length; col++) { // Start from month columns
      const monthIndex = col - 4;
      if (monthIndex > 0) {
        const cellAddress = utils.encode_cell({ r: row, c: col });
        const prevCellAddress = utils.encode_cell({ r: row, c: col - 1 });
        
        const currentValue = worksheet[cellAddress]?.v || 0;
        const prevValue = worksheet[prevCellAddress]?.v || 0;
        
        let fill;
        if (currentValue > prevValue) {
          fill = { fgColor: { rgb: "DCFCE7" } }; // Light green
        } else if (currentValue < prevValue) {
          fill = { fgColor: { rgb: "FEE2E2" } }; // Light red
        } else {
          fill = { fgColor: { rgb: "E0F2FE" } }; // Light blue
        }
        
        if (!worksheet[cellAddress]) worksheet[cellAddress] = {};
        worksheet[cellAddress].s = { fill };
      }
    }
  }
  
  // Create workbook and download
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Investor Data');
  
  const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `investor_data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Export CSV data as downloadable file
export const exportToCSV = (): void => {
  const data = getMonthlyCSVData();
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
