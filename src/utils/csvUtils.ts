import { MonthlyInvestorData, MonthlyDataFile } from "@/types";
import { hybridStorage, largeDataStorage } from "./storageUtils";

// Parse monthly Excel file and extract data
// CMD+F: export const parseMonthlyExcelFile = async (file: File): Promise<{
// CMD+F: export const parseMonthlyExcelFile
export const parseMonthlyExcelFile = async (
  file: File
): Promise<{ date: string; data: MonthlyInvestorData[] }> => {
  // ✅ Use namespace import to avoid "read is not defined" in browser builds
  const XLSX = await import("xlsx");

  // --- helpers ---
  const pick = (row: any, keys: string[]) => {
    for (const k of keys) {
      if (
        row?.[k] !== undefined &&
        row?.[k] !== null &&
        String(row[k]).trim() !== ""
      )
        return row[k];
    }
    return null;
  };

  const parseNumber = (value: any): number => {
    if (value === null || value === undefined || value === "") return 0;
    const s = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizePAN = (v: any): string | null => {
    const s = String(v ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    return s ? s : null;
  };

  const extractDateFromText = (txt: string): string | null => {
    if (!txt) return null;

    // 1) "November 1st 2024" / "Nov 1 2024"
    const m1 = txt.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\b/i
    );
    if (m1) return m1[0];

    // 2) ISO "2024-11-01" or "2024_11_01"
    const m2 = txt.match(/\b\d{4}[-_/]\d{1,2}[-_/]\d{1,2}\b/);
    if (m2) return m2[0].replace(/_/g, "-").replace(/\//g, "-");

    // 3) "01-11-2024" (common in India; treat as DD-MM-YYYY)
    const m3 = txt.match(/\b\d{1,2}[-_/]\d{1,2}[-_/]\d{4}\b/);
    if (m3) return m3[0].replace(/_/g, "-").replace(/\//g, "-");

    return null;
  };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buf = e.target?.result;
        if (!buf) throw new Error("Empty file data");

        // ✅ ArrayBuffer path is most reliable in browsers
        const workbook = XLSX.read(buf, { type: "array" });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) throw new Error("No sheets found in file");

        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!json.length) throw new Error("Sheet has no rows");

        const headers = Object.keys(json[0] || {}).map((h) => String(h).trim());
        console.log("Monthly headers:", headers);

        // --- OLD format detection: "SHARES AS ON {date}" ---
        const sharesHeader =
          headers.find((h) => /SHARES\s+AS\s+ON/i.test(h)) || null;

        // Date extraction:
        // - OLD: from "SHARES AS ON {date}"
        // - NEW: from filename/sheetname (since the new format has no date column)
        let extractedDate = "";
        if (sharesHeader) {
          const dm = sharesHeader.match(/SHARES\s+AS\s+ON\s+(.+)/i);
          extractedDate = dm?.[1]?.trim() || "";
        } else {
          extractedDate =
            extractDateFromText(file.name) ||
            extractDateFromText(sheetName) ||
            new Date().toISOString().slice(0, 10);
        }

        const { dateKey, displayDate } = formatDateToReadable(extractedDate);

        const monthlyData: MonthlyInvestorData[] = json.map(
          (row: any, index: number) => {
            // NEW format columns (case-insensitive-ish via pick list):
            const nameRaw = pick(row, ["Name", "NAME"]);
            const name = String(nameRaw || `Unknown-${index}`).trim();

            const pan = normalizePAN(pick(row, ["PAN", "Pan", "pan"]));
            const dpid = pick(row, ["DPID", "Dpid", "dpid"]);
            const clientId = pick(row, [
              "Client Id/Folio",
              "ClientId/Folio",
              "Client Id",
              "ClientId",
              "Folio",
            ]);

            const categoryRaw = pick(row, ["Category", "CATEGORY"]);
            const category = categoryRaw
              ? String(categoryRaw).trim()
              : "Unknown";

            const description = String(
              pick(row, ["DESCRIPTION", "Description"]) || ""
            ).trim();

            // Shares:
            // - OLD: value under the dynamic SHARES AS ON header
            // - NEW: value under "Shares"
            const shares = sharesHeader
              ? parseNumber(row[sharesHeader])
              : parseNumber(pick(row, ["Shares", "SHARES"]));

            // % to Equity (NEW)
            const percentToEquity = parseNumber(
              pick(row, [
                "% to Equity",
                "% To Equity",
                "% to equity",
                "Percent to Equity",
                "PercentEquity",
              ])
            );

            // Build base shape (keep old behaviour intact)
            const base = {
              name,
              category,
              description,
              monthlyShares: { [dateKey]: shares },
              fundGroup: getFundGroup(name),
            } as any;

            // Add NEW optional fields (won’t break old consumers)
            base.pan = pan;
            base.dpid = dpid ? String(dpid).trim() : null;
            base.clientId = clientId ? String(clientId).trim() : null;
            base.percentToEquity = percentToEquity || null;

            return base as MonthlyInvestorData;
          }
        );

        console.log(
          `Processed monthly data for ${displayDate}:`,
          monthlyData.length,
          "records"
        );
        resolve({ date: dateKey, data: monthlyData });
      } catch (error) {
        console.error("Error parsing monthly Excel file:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);

    // ✅ must match XLSX.read({type:"array"})
    reader.readAsArrayBuffer(file);
  });
};

// Format date string to readable format and return both key and display - UPDATED for cross-year support
const formatDateToReadable = (
  dateStr: string
): { dateKey: string; displayDate: string } => {
  try {
    // Handle various date formats including "May 30th 2024"
    const cleanDate = dateStr.replace(/st|nd|rd|th/g, "").trim();

    // Try parsing the date directly
    let date = new Date(cleanDate);

    // If direct parsing fails, try manual parsing for formats like "May 30 2024"
    if (isNaN(date.getTime())) {
      const monthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];
      const parts = cleanDate.toLowerCase().split(/\s+/);
      const monthIndex = monthNames.findIndex((month) =>
        parts.some((part) => part.includes(month.slice(0, 3)))
      );
      const day = parts.find((part) => /^\d{1,2}$/.test(part));
      const year = parts.find((part) => /^\d{4}$/.test(part));

      if (monthIndex !== -1) {
        // Use the extracted year or default to current year
        const parsedYear = year ? parseInt(year) : new Date().getFullYear();
        date = new Date(parsedYear, monthIndex, parseInt(day || "1"));
      } else {
        date = new Date(); // Default to current date
      }
    }

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const displayDate = `${monthNames[month]} ${day}, ${year}`;

    return { dateKey, displayDate };
  } catch {
    // Default to current date
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return {
      dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`,
      displayDate: `${monthNames[month]} ${day}, ${year}`,
    };
  }
};

// CMD+F: const getFundGroup
const getFundGroup = (name: string): string => {
  return (name || "").trim().toUpperCase(); // no heuristic grouping
};

// CMD+F: export const groupInvestorsByFund
export const groupInvestorsByFund = (
  investors: MonthlyInvestorData[]
): MonthlyInvestorData[] => {
  return investors; // grouping removed
};

// Save monthly data using hybrid storage for large datasets
export const saveMonthlyData = async (
  newDate: string,
  newData: MonthlyInvestorData[],
  fileName: string,
  shouldGroup: boolean = true
): Promise<void> => {
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
    recordCount: newData.length,
  };

  const updatedFiles = [
    ...existingFiles.filter((f) => f.date !== newDate),
    newFile,
  ];
  await largeDataStorage.setItem(
    "uploadedFiles",
    "uploadedFiles",
    updatedFiles
  );

  console.log(
    `Saved monthly data for ${newDate}. Total investors:`,
    finalData.length
  );
};

// Get monthly CSV data using hybrid storage
export async function getMonthlyCSVData(): Promise<MonthlyInvestorData[]> {
  const r = await fetch("/api/monthly", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

// Get list of uploaded files using IndexedDB
export const getUploadedFiles = async (): Promise<MonthlyDataFile[]> => {
  const data = await largeDataStorage.getItem("uploadedFiles", "uploadedFiles");
  return data || [];
};

// Merge new monthly data with existing data
// CMD+F: export const mergeMonthlyData = (
export const mergeMonthlyData = (
  existingData: MonthlyInvestorData[],
  newData: MonthlyInvestorData[],
  newDate: string
): MonthlyInvestorData[] => {
  // ✅ key by PAN when present, else fallback to name
  const keyOf = (inv: MonthlyInvestorData) =>
    (inv.pan || inv.name || "").trim();

  const mergedData: MonthlyInvestorData[] = [...existingData];
  const investorMap = new Map<string, MonthlyInvestorData>();

  mergedData.forEach((inv) => {
    investorMap.set(keyOf(inv), inv);
  });

  newData.forEach((newInv) => {
    const key = keyOf(newInv);
    const existingInv = investorMap.get(key);

    if (existingInv) {
      existingInv.monthlyShares[newDate] = newInv.monthlyShares[newDate];

      // keep best name/category (minimal)
      if (newInv.name && newInv.name.length > (existingInv.name?.length || 0)) {
        existingInv.name = newInv.name;
      }
      if (
        newInv.category &&
        (existingInv.category === "Unknown" || !existingInv.category)
      ) {
        existingInv.category = newInv.category;
      }

      // carry PAN/meta forward
      existingInv.pan = existingInv.pan || newInv.pan || null;
      existingInv.dpid = existingInv.dpid || newInv.dpid || null;
      existingInv.clientId = existingInv.clientId || newInv.clientId || null;
      existingInv.percentToEquity =
        existingInv.percentToEquity ?? null ?? newInv.percentToEquity ?? null;
    } else {
      mergedData.push(newInv);
      investorMap.set(key, newInv);
    }
  });

  return mergedData;
};

// Export data to Excel with FIXED color formatting
export const exportToExcel = async (): Promise<void> => {
  const data = await getMonthlyCSVData();
  if (data.length === 0) return;

  const { utils, write } = await import("xlsx");

  // Get all unique months and sort them properly
  const allMonths = Array.from(
    new Set(data.flatMap((investor) => Object.keys(investor.monthlyShares)))
  ).sort();

  // Convert date keys to display format for headers
  const displayHeaders = getMonthDisplayLabels(allMonths);

  // Create header row
  const headers = [
    "Name",
    "Category",
    "Description",
    "Fund Group",
    ...displayHeaders,
  ];

  // Create data rows
  const rows = data.map((investor) => [
    investor.name,
    investor.category,
    investor.description,
    investor.fundGroup || "",
    ...allMonths.map((month) => investor.monthlyShares[month] || 0),
  ]);

  // Create worksheet
  const worksheet = utils.aoa_to_sheet([headers, ...rows]);

  // FIXED: Proper Excel color formatting
  const range = utils.decode_range(worksheet["!ref"] || "A1");

  // Color code data cells based on month-over-month changes
  for (let row = 1; row <= range.e.r; row++) {
    for (let col = 4; col < headers.length; col++) {
      // Start from month columns
      const cellAddress = utils.encode_cell({ r: row, c: col });

      if (!worksheet[cellAddress]) {
        worksheet[cellAddress] = { t: "n", v: 0 };
      }

      // Apply color based on comparison with previous month
      if (col > 4) {
        // Only compare if there's a previous month
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
    if (!worksheet[cellAddress])
      worksheet[cellAddress] = { t: "s", v: headers[col] };
    if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
    worksheet[cellAddress].s.fill = { fgColor: { rgb: "D3D3D3" } };
    worksheet[cellAddress].s.font = { bold: true };
  }

  // Set column widths
  worksheet["!cols"] = [
    { wch: 30 }, // Name
    { wch: 15 }, // Category
    { wch: 25 }, // Description
    { wch: 15 }, // Fund Group
    ...allMonths.map(() => ({ wch: 15 })), // Month columns
  ];

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Investor Data");

  const excelBuffer = write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
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
  const allMonths = Array.from(
    new Set(data.flatMap((investor) => Object.keys(investor.monthlyShares)))
  ).sort();

  // Create CSV header
  const headers = [
    "Name",
    "Category",
    "Description",
    "Fund Group",
    ...allMonths,
  ];

  // Create CSV rows
  const rows = data.map((investor) => [
    investor.name,
    investor.category,
    investor.description,
    investor.fundGroup || "",
    ...allMonths.map((month) => investor.monthlyShares[month] || 0),
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  // Download CSV
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `investor_data_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Get available months for filtering with proper display format
export const getAvailableMonths = async (): Promise<string[]> => {
  const data = await getMonthlyCSVData();
  const months = new Set<string>();

  data.forEach((investor) => {
    Object.keys(investor.monthlyShares).forEach((month) => {
      months.add(month);
    });
  });

  return Array.from(months).sort();
};

// Get display labels for months
export const getMonthDisplayLabels = (months: string[]): string[] => {
  return months.map((dateKey) => {
    const date = new Date(dateKey);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${
      monthNames[date.getMonth()]
    } ${date.getDate()}, ${date.getFullYear()}`;
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
  return data.filter((investor) => {
    // Category filter
    if (
      filters.category &&
      filters.category !== "all" &&
      investor.category !== filters.category
    ) {
      return false;
    }

    // FIXED: Search filter - properly handle empty strings
    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      const query = filters.searchQuery.toLowerCase().trim();
      const nameMatch = investor.name.toLowerCase().includes(query);
      const descriptionMatch =
        investor.description?.toLowerCase().includes(query) || false;
      if (!nameMatch && !descriptionMatch) {
        return false;
      }
    }

    // Share count filters
    if (filters.selectedMonths && filters.selectedMonths.length > 0) {
      const relevantShares = filters.selectedMonths.map(
        (month) => investor.monthlyShares[month] || 0
      );
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
