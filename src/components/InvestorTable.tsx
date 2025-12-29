import { useState } from "react";
import { Investor, FilterOptions } from "@/types";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import FundGroupBreakdown from "./FundGroupBreakdown";

interface InvestorTableProps {
  investors: Investor[];
  categories: string[];
  fundGroups: string[];
  filters: FilterOptions;
  onFilterChange: (filters: Partial<FilterOptions>) => void;
}

export default function InvestorTable({
  investors,
  categories,
  fundGroups,
  filters,
  onFilterChange,
}: InvestorTableProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ searchQuery: searchInput });
  };

  const handleSort = (field: FilterOptions["sortBy"]) => {
    const newSortOrder =
      sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
    onFilterChange({ sortBy: field, sortOrder: newSortOrder });
  };

  const getSortIcon = (field: string) => {
    if (filters.sortBy !== field) return null;
    return filters.sortOrder === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search investors..."
              value={searchInput || ""}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>

        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={filters.category || "all"}
            onValueChange={(value) =>
              onFilterChange({ category: value === "all" ? null : value })
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
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

          <Select
            value={filters.fundGroup || "all"}
            onValueChange={(value) =>
              onFilterChange({ fundGroup: value === "all" ? null : value })
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Fund Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fund Groups</SelectItem>
              {fundGroups.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("boughtOn18")}
                >
                  <div className="flex items-center justify-end">
                    Bought
                    {getSortIcon("boughtOn18")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("soldOn25")}
                >
                  <div className="flex items-center justify-end">
                    Sold
                    {getSortIcon("soldOn25")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("netChange")}
                >
                  <div className="flex items-center justify-end">
                    Net Change
                    {getSortIcon("netChange")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer text-right"
                  onClick={() => handleSort("percentToEquity")}
                >
                  <div className="flex items-center justify-end">
                    % to Equity
                    {getSortIcon("percentToEquity")}
                  </div>
                </TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No investors found.
                  </TableCell>
                </TableRow>
              ) : (
                investors.map((investor, index) => (
                  <TableRow key={`${investor.name}-${index}`}>
                    <TableCell>
                      <FundGroupBreakdown fundGroup={investor} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {investor.name}
                      {investor.individualInvestors &&
                        investor.individualInvestors.length > 1 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({investor.individualInvestors.length} entities)
                          </span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                      {investor.boughtOn18.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {investor.soldOn25.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          (investor.netChange || 0) > 0
                            ? "text-dashboard-success"
                            : (investor.netChange || 0) < 0
                            ? "text-dashboard-danger"
                            : ""
                        }
                      >
                        {(investor.netChange || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {investor.percentToEquity.toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-full text-xs bg-dashboard-accent/10 text-dashboard-accent">
                        {investor.category}
                      </span>
                    </TableCell>
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
