import { MonthlyInvestorData, MonthlyDataFile } from '@/types';
import { hybridStorage, largeDataStorage } from './storageUtils';

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
        
        // Extract date from "SHARES AS ON {date}" header
        const headers = Object.keys(json[0] || {});
        const sharesHeader = headers.find(h => h.includes('SHARES AS ON'));
        const dateMatch = sharesHeader?.match(/SHARES AS ON\s+(.+)/i);
        const extractedDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
        
        // Convert to readable format and store both formats
        const { dateKey, displayDate } = formatDateToReadable(extractedDate);
        
        const monthlyData: MonthlyInvestorData[] = json.map((row: any, index: number) => {
          const parseNumber = (value: any): number => {
            if (!value || value === '') return 0;
            const str = value.toString().replace(/,/g, '');
            const num = parseFloat(str);
            return isNaN(num) ? 0 : num;
          };
          
          const name = row["NAME"] || `Unknown-${index}`;
          const shares = parseNumber(row[sharesHeader || "SHARES AS ON"]);
          const category = row["Category"] || row["CATEGORY"] || "Unknown";
          const description = row["DESCRIPTION"] || row["Description"] || ""; // Optional field
          
          return {
            name,
            category,
            description,
            monthlyShares: { [dateKey]: shares },
            fundGroup: getFundGroup(name)
          };
        });
        
        console.log(`Processed monthly data for ${displayDate}:`, monthlyData.length, "records");
        resolve({ date: dateKey, data: monthlyData });
      } catch (error) {
        console.error("Error parsing monthly Excel file:", error);
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

// Format date string to readable format and return both key and display - UPDATED for cross-year support
const formatDateToReadable = (dateStr: string): { dateKey: string; displayDate: string } => {
  try {
    // Handle various date formats including "May 30th 2024"
    const cleanDate = dateStr.replace(/st|nd|rd|th/g, '').trim();
    
    // Try parsing the date directly
    let date = new Date(cleanDate);
    
    // If direct parsing fails, try manual parsing for formats like "May 30 2024"
    if (isNaN(date.getTime())) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                         'july', 'august', 'september', 'october', 'november', 'december'];
      const parts = cleanDate.toLowerCase().split(/\s+/);
      const monthIndex = monthNames.findIndex(month => parts.some(part => part.includes(month.slice(0, 3))));
      const day = parts.find(part => /^\d{1,2}$/.test(part));
      const year = parts.find(part => /^\d{4}$/.test(part));
      
      if (monthIndex !== -1) {
        // Use the extracted year or default to current year
        const parsedYear = year ? parseInt(year) : new Date().getFullYear();
        date = new Date(parsedYear, monthIndex, parseInt(day || '1'));
      } else {
        date = new Date(); // Default to current date
      }
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const displayDate = `${monthNames[month]} ${day}, ${year}`;
    
    return { dateKey, displayDate };
  } catch {
    // Default to current date
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      dateKey: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      displayDate: `${monthNames[month]} ${day}, ${year}`
    };
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

// Save monthly data using hybrid storage for large datasets
export const saveMonthlyData = async (newDate: string, newData: MonthlyInvestorData[], fileName: string, shouldGroup: boolean = true): Promise<void> => {
  const existingData = await getMonthlyCSVData();
  const existingFiles = await getUploadedFiles();
  
  // Merge new data with existing
  const mergedData = mergeMonthlyData(existingData, newData, newDate);
  
  // Optionally group by fund groups
  const finalData = shouldGroup ? groupInvestorsByFund(mergedData) : mergedData;
  
  // Save merged data using hybrid storage
  await hybridStorage.setItem("monthlyCSVData", finalData);
  
  // Track uploaded files
  const newFile: MonthlyDataFile = {
    date: newDate,
    fileName,
    uploadDate: new Date().toISOString(),
    recordCount: newData.length
  };
  
  const updatedFiles = [...existingFiles.filter(f => f.date !== newDate), newFile];
  await largeDataStorage.setItem('uploadedFiles', 'uploadedFiles', updatedFiles);
  
  console.log(`Saved monthly data for ${newDate}. Total investors:`, finalData.length);
};

// Get monthly CSV data using hybrid storage
export const getMonthlyCSVData = async (): Promise<MonthlyInvestorData[]> => {
  const data = await hybridStorage.getItem("monthlyCSVData");
  return data || [];
};

// Get list of uploaded files using IndexedDB
export const getUploadedFiles = async (): Promise<MonthlyDataFile[]> => {
  const data = await largeDataStorage.getItem('uploadedFiles', 'uploadedFiles');
  return data || [];
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

// Export data to Excel with FIXED color formatting
export const exportToExcel = async (): Promise<void> => {
  const data = await getMonthlyCSVData();
  if (data.length === 0) return;
  
  const { utils, write } = await import('xlsx');
  
  // Get all unique months and sort them properly
  const allMonths = Array.from(new Set(
    data.flatMap(investor => Object.keys(investor.monthlyShares))
  )).sort();
  
  // Convert date keys to display format for headers
  const displayHeaders = getMonthDisplayLabels(allMonths);
  
  // Create header row
  const headers = ['Name', 'Category', 'Description', 'Fund Group', ...displayHeaders];
  
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
  
  // FIXED: Proper Excel color formatting
  const range = utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Color code data cells based on month-over-month changes
  for (let row = 1; row <= range.e.r; row++) {
    for (let col = 4; col < headers.length; col++) { // Start from month columns
      const cellAddress = utils.encode_cell({ r: row, c: col });
      
      if (!worksheet[cellAddress]) {
        worksheet[cellAddress] = { t: 'n', v: 0 };
      }
      
      // Apply color based on comparison with previous month
      if (col > 4) { // Only compare if there's a previous month
        const prevCellAddress = utils.encode_cell({ r: row, c: col - 1 });
        const currentValue = Number(worksheet[cellAddress].v) || 0;
        const prevValue = Number(worksheet[prevCellAddress]?.v) || 0;
        
        if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
        
        if (currentValue > prevValue) {
          worksheet[cellAddress].s.fill = { fgColor: { rgb: "90EE90" } }; // Light green
        } else if (currentValue < prevValue) {
          worksheet[cellAddress].s.fill = { fgColor: { rgb: "FFB6C1" } }; // Light red
        } else {
          worksheet[cellAddress].s.fill = { fgColor: { rgb: "ADD8E6" } }; // Light blue
        }
      }
    }
  }
  
  // Style header row
  for (let col = 0; col < headers.length; col++) {
    const cellAddress = utils.encode_cell({ r: 0, c: col });
    if (!worksheet[cellAddress]) worksheet[cellAddress] = { t: 's', v: headers[col] };
    if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
    worksheet[cellAddress].s.fill = { fgColor: { rgb: "D3D3D3" } };
    worksheet[cellAddress].s.font = { bold: true };
  }
  
  // Set column widths
  worksheet['!cols'] = [
    { wch: 30 }, // Name
    { wch: 15 }, // Category  
    { wch: 25 }, // Description
    { wch: 15 }, // Fund Group
    ...allMonths.map(() => ({ wch: 15 })) // Month columns
  ];
  
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
export const exportToCSV = async (): Promise<void> => {
  const data = await getMonthlyCSVData();
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

// Get available months for filtering with proper display format
export const getAvailableMonths = async (): Promise<string[]> => {
  const data = await getMonthlyCSVData();
  const months = new Set<string>();
  
  data.forEach(investor => {
    Object.keys(investor.monthlyShares).forEach(month => {
      months.add(month);
    });
  });
  
  return Array.from(months).sort();
};

// Get display labels for months
export const getMonthDisplayLabels = (months: string[]): string[] => {
  return months.map(dateKey => {
    const date = new Date(dateKey);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  });
};

// Filter monthly data based on criteria - FIXED search functionality
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
    
    // FIXED: Search filter - properly handle empty strings
    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase().trim();
      const nameMatch = investor.name.toLowerCase().includes(query);
      const descriptionMatch = investor.description?.toLowerCase().includes(query) || false;
      if (!nameMatch && !descriptionMatch) {
        return false;
      }
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
