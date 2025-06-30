
import { useState } from "react";
import { MonthlyInvestorData } from "@/types";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Search, Eye, Users, Plus } from "lucide-react";
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

function ManualGroupingDialog({ 
  data, 
  onGroupInvestors 
}: { 
  data: MonthlyInvestorData[];
  onGroupInvestors: (sourceInvestor: string, targetGroup: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState("");
  const [targetGroup, setTargetGroup] = useState("");

  const availableGroups = data
    .filter(inv => inv.individualInvestors && inv.individualInvestors.length > 1)
    .map(inv => inv.name);

  const individualInvestors = data.filter(inv => !inv.individualInvestors || inv.individualInvestors.length <= 1);

  const handleGroup = () => {
    if (selectedInvestor && targetGroup) {
      onGroupInvestors(selectedInvestor, targetGroup);
      setOpen(false);
      setSelectedInvestor("");
      setTargetGroup("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-2" />
          Manual Grouping
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Grouping</DialogTitle>
          <DialogDescription>
            Add an individual investor to an existing group
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Select Investor to Group:</label>
            <Select value={selectedInvestor} onValueChange={setSelectedInvestor}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an investor" />
              </SelectTrigger>
              <SelectContent>
                {individualInvestors.map(inv => (
                  <SelectItem key={inv.name} value={inv.name}>
                    {inv.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">Select Target Group:</label>
            <Select value={targetGroup} onValueChange={setTargetGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a group" />
              </SelectTrigger>
              <SelectContent>
                {availableGroups.map(group => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={handleGroup} 
            disabled={!selectedInvestor || !targetGroup}
            className="w-full"
          >
            Group Investor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MonthlyDataTable({ data, availableMonths, categories }: MonthlyDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minSharesFilter, setMinSharesFilter] = useState<string>("");
  const [maxSharesFilter, setMaxSharesFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [localData, setLocalData] = useState<MonthlyInvestorData[]>(data);

  // Get display labels for the available months
  const displayLabels = getMonthDisplayLabels(availableMonths);

  // Filter data to only include investors with more than 20,000 shares in any month
  const filteredForMinShares = localData.filter(investor => {
    const maxShares = Math.max(...availableMonths.map(month => investor.monthlyShares[month] || 0));
    return maxShares > 20000;
  });

  // Filter data
  const filteredData = filteredForMinShares.filter(investor => {
    // Search filter
    if (searchQuery && searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase().trim();
      const nameMatch = investor.name.toLowerCase().includes(query);
      const descriptionMatch = investor.description && investor.description.toLowerCase().includes(query);
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
    
    if (minSharesFilter && minSharesFilter.trim() !== "" && latestShares < parseInt(minSharesFilter)) {
      return false;
    }
    
    if (maxSharesFilter && maxSharesFilter.trim() !== "" && latestShares > parseInt(maxSharesFilter)) {
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

  // Get gradient intensity based on segmented ranges
  const getGradientIntensity = (shares: number): number => {
    if (shares <= 50000) return 0.2;
    if (shares <= 100000) return 0.4;
    if (shares <= 200000) return 0.6;
    if (shares <= 500000) return 0.8;
    return 1.0;
  };

  // Get cell color with segmented gradient intensity
  const getCellColorWithGradient = (investor: MonthlyInvestorData, monthIndex: number): string => {
    const currentMonth = availableMonths[monthIndex];
    const currentShares = investor.monthlyShares[currentMonth] || 0;
    
    if (currentShares === 0) return "";
    
    // For the first month, use blue with intensity based on shares owned
    if (monthIndex === 0) {
      const opacity = getGradientIntensity(currentShares);
      return `rgba(59, 130, 246, ${opacity})`; // Blue with segmented opacity
    }
    
    // Calculate change from previous month
    let changeType = "same";
    const previousMonth = availableMonths[monthIndex - 1];
    const previousShares = investor.monthlyShares[previousMonth] || 0;
    
    if (currentShares > previousShares) {
      changeType = "increase";
    } else if (currentShares < previousShares) {
      changeType = "decrease";
    }
    
    // Calculate intensity based on segmented ranges
    const changeAmount = Math.abs(currentShares - previousShares);
    const opacity = getGradientIntensity(changeAmount);
    
    // Apply gradient colors based on change type
    if (changeType === "increase") {
      return `rgba(34, 197, 94, ${opacity})`; // Green with segmented opacity
    } else if (changeType === "decrease") {
      return `rgba(239, 68, 68, ${opacity})`; // Red with segmented opacity
    } else {
      return `rgba(59, 130, 246, ${opacity})`; // Blue with segmented opacity
    }
  };

  const handleGroupInvestors = (sourceInvestor: string, targetGroup: string) => {
    const updatedData = [...localData];
    const sourceIndex = updatedData.findIndex(inv => inv.name === sourceInvestor);
    const targetIndex = updatedData.findIndex(inv => inv.name === targetGroup);
    
    if (sourceIndex === -1 || targetIndex === -1) return;
    
    const source = updatedData[sourceIndex];
    const target = updatedData[targetIndex];
    
    // Add source to target's individual investors
    if (!target.individualInvestors) {
      target.individualInvestors = [target];
    }
    target.individualInvestors.push(source);
    
    // Merge shares
    Object.keys(source.monthlyShares).forEach(month => {
      target.monthlyShares[month] = (target.monthlyShares[month] || 0) + (source.monthlyShares[month] || 0);
    });
    
    // Update description
    target.description = `Grouped fund (${target.individualInvestors.length} entities)`;
    
    // Remove source from main list
    updatedData.splice(sourceIndex, 1);
    
    setLocalData(updatedData);
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium">Legend:</span>
        <Badge className="bg-green-100 text-green-800">Green: Increased shares</Badge>
        <Badge className="bg-red-100 text-red-800">Red: Decreased shares</Badge>
        <Badge className="bg-blue-100 text-blue-800">Blue: Same/Initial month</Badge>
        <span className="text-xs text-muted-foreground">
          Intensity: Light (≤50k) → Dark (>500k)
        </span>
      </div>

      {/* Filters and Controls */}
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
          value={minSharesFilter}
          onChange={(e) => setMinSharesFilter(e.target.value)}
          type="number"
          className="w-32"
        />

        <Input
          placeholder="Max shares"
          value={maxSharesFilter}
          onChange={(e) => setMaxSharesFilter(e.target.value)}
          type="number"
          className="w-32"
        />

        <ManualGroupingDialog 
          data={localData}
          onGroupInvestors={handleGroupInvestors}
        />
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {sortedData.length} investors with >20,000 shares
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
                    No investors found with >20,000 shares.
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
                        className="text-right"
                        style={{ 
                          backgroundColor: getCellColorWithGradient(investor, index),
                          color: investor.monthlyShares[month] > 0 ? 'rgba(0, 0, 0, 0.8)' : 'inherit'
                        }}
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
