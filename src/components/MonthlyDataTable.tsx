
import { useState } from "react";
import { MonthlyInvestorData } from "@/types";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Search, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getMonthDisplayLabels } from "@/utils/csvUtils";

interface MonthlyDataTableProps {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

function FundBreakdownDialog({ investor }: { investor: MonthlyInvestorData }) {
  const [open, setOpen] = useState(false);

  if (!investor.individualInvestors || investor.individualInvestors.length <= 1) {
    return null;
  }

  const displayLabels = getMonthDisplayLabels(Object.keys(investor.individualInvestors[0].monthlyShares).sort());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Eye className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{investor.name} - Individual Investors</DialogTitle>
          <DialogDescription>
            Breakdown of {investor.individualInvestors.length} individual investors in this fund group
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                {displayLabels.map((label, index) => (
                  <TableHead key={index} className="text-right">{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {investor.individualInvestors.map((individual, index) => {
                const monthKeys = Object.keys(individual.monthlyShares).sort();
                return (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{individual.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{individual.category}</Badge>
                    </TableCell>
                    <TableCell>{individual.description}</TableCell>
                    {monthKeys.map(month => (
                      <TableCell key={month} className="text-right">
                        {(individual.monthlyShares[month] || 0).toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MonthlyDataTable({ data, availableMonths, categories }: MonthlyDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minShares, setMinShares] = useState<string>("");
  const [maxShares, setMaxShares] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Get display labels for the available months
  const displayLabels = getMonthDisplayLabels(availableMonths);

  // Filter data
  const filteredData = data.filter(investor => {
    // Search filter - fix blank issue
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const nameMatch = investor.name.toLowerCase().includes(query);
      const descriptionMatch = investor.description?.toLowerCase().includes(query) || false;
      if (!nameMatch && !descriptionMatch) {
        return false;
      }
    }
    
    // Category filter
    if (selectedCategory !== "all" && investor.category !== selectedCategory) {
      return false;
    }
    
    // Share count filters
    const latestMonth = availableMonths[availableMonths.length - 1];
    const latestShares = investor.monthlyShares[latestMonth] || 0;
    
    if (minShares && latestShares < parseInt(minShares)) {
      return false;
    }
    
    if (maxShares && latestShares > parseInt(maxShares)) {
      return false;
    }
    
    return true;
  });

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any, bValue: any;
    
    if (sortBy === "name") {
      aValue = a.name;
      bValue = b.name;
    } else if (sortBy === "category") {
      aValue = a.category;
      bValue = b.category;
    } else if (availableMonths.includes(sortBy)) {
      aValue = a.monthlyShares[sortBy] || 0;
      bValue = b.monthlyShares[sortBy] || 0;
    }
    
    if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
    if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? 
      <ArrowUp className="w-4 h-4 ml-1" /> : 
      <ArrowDown className="w-4 h-4 ml-1" />;
  };

  // Get cell color based on comparison with previous month
  const getCellColor = (investor: MonthlyInvestorData, monthIndex: number): string => {
    if (monthIndex === 0) return ""; // No color for first month
    
    const currentMonth = availableMonths[monthIndex];
    const previousMonth = availableMonths[monthIndex - 1];
    
    const currentShares = investor.monthlyShares[currentMonth] || 0;
    const previousShares = investor.monthlyShares[previousMonth] || 0;
    
    if (currentShares > previousShares) return "bg-green-100 text-green-800";
    if (currentShares < previousShares) return "bg-red-100 text-red-800";
    return "bg-sky-100 text-sky-800";
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium">Legend:</span>
        <Badge className="bg-green-100 text-green-800">Higher than previous month</Badge>
        <Badge className="bg-red-100 text-red-800">Lower than previous month</Badge>
        <Badge className="bg-sky-100 text-sky-800">Same as previous month</Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <Input
            placeholder="Search investors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>
        
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Min shares"
          value={minShares}
          onChange={(e) => setMinShares(e.target.value)}
          type="number"
          className="w-32"
        />

        <Input
          placeholder="Max shares"
          value={maxShares}
          onChange={(e) => setMaxShares(e.target.value)}
          type="number"
          className="w-32"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8"></TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    Fund Group / Investor
                    {getSortIcon("name")}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("category")}
                >
                  <div className="flex items-center">
                    Category
                    {getSortIcon("category")}
                  </div>
                </TableHead>
                {displayLabels.map((label, index) => (
                  <TableHead 
                    key={availableMonths[index]}
                    className="cursor-pointer text-right"
                    onClick={() => handleSort(availableMonths[index])}
                  >
                    <div className="flex items-center justify-end">
                      {label}
                      {getSortIcon(availableMonths[index])}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3 + availableMonths.length} className="h-24 text-center">
                    No investors found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((investor) => (
                  <TableRow key={investor.name}>
                    <TableCell>
                      <FundBreakdownDialog investor={investor} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {investor.name}
                      {investor.individualInvestors && investor.individualInvestors.length > 1 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({investor.individualInvestors.length} entities)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{investor.category}</Badge>
                    </TableCell>
                    {availableMonths.map((month, index) => (
                      <TableCell 
                        key={month}
                        className={`text-right ${getCellColor(investor, index)}`}
                      >
                        {(investor.monthlyShares[month] || 0).toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
