// src/components/MonthlyDataTable.tsx
import React, { useMemo, useState } from "react";
import { MonthlyInvestorData } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getMonthDisplayLabels } from "@/utils/csvUtils";

interface MonthlyDataTableProps {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

/* ──────────────────────────────────────────────────────────────────
   Dialog: fund breakdown (simple table, sticky header only)
   ────────────────────────────────────────────────────────────────── */
function FundBreakdownDialog({ investor }: { investor: MonthlyInvestorData }) {
  const [open, setOpen] = useState(false);

  if (!investor.individualInvestors || investor.individualInvestors.length <= 1)
    return null;

  const displayLabels = getMonthDisplayLabels(
    Object.keys(investor.individualInvestors[0].monthlyShares).sort()
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => e.stopPropagation()}
          title="View fund breakdown"
        >
          <Eye className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{investor.name} — Individual Investors</DialogTitle>
          <DialogDescription>
            Breakdown of {investor.individualInvestors.length} individual
            investors in this fund group
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 z-30 bg-white text-left px-4 py-2 border border-gray-200">
                  Investor Name
                </th>
                <th className="sticky top-0 z-30 bg-white text-left px-4 py-2 border border-gray-200">
                  Category
                </th>
                <th className="sticky top-0 z-30 bg-white text-left px-4 py-2 border border-gray-200">
                  Description
                </th>
                {displayLabels.map((label, index) => (
                  <th
                    key={index}
                    className="sticky top-0 z-30 bg-white text-right px-4 py-2 border border-gray-200"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investor.individualInvestors.map((individual, idx) => {
                const monthKeys = Object.keys(individual.monthlyShares).sort();
                return (
                  <tr key={idx}>
                    <td className="px-4 py-2 border border-gray-200 font-medium">
                      {individual.name}
                    </td>
                    <td className="px-4 py-2 border border-gray-200">
                      <Badge variant="outline">{individual.category}</Badge>
                    </td>
                    <td className="px-4 py-2 border border-gray-200">
                      {individual.description}
                    </td>
                    {monthKeys.map((month) => (
                      <td
                        key={month}
                        className="px-4 py-2 border border-gray-200 text-right"
                      >
                        {(
                          individual.monthlyShares[month] || 0
                        ).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RankingMode = "none" | "buyers" | "sellers";
type TimeRangeKey =
  | "30d"
  | "60d"
  | "90d"
  | "thisQuarter"
  | "lastQuarter"
  | "allTime";

/* ──────────────────────────────────────────────────────────────────
   Date range helpers
   ────────────────────────────────────────────────────────────────── */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  const nextQStart = new Date(d.getFullYear(), q * 3 + 3, 1);
  return addDays(nextQStart, -1);
}
function previousQuarterBounds(d: Date): { start: Date; end: Date } {
  const q = Math.floor(d.getMonth() / 3);
  const prevQMonth = q * 3 - 3;
  const year = prevQMonth < 0 ? d.getFullYear() - 1 : d.getFullYear();
  const month = ((prevQMonth % 12) + 12) % 12;
  const start = new Date(year, month, 1);
  const end = endOfQuarter(start);
  return { start, end };
}
function findFirstKeyOnOrAfter(
  keysAsc: string[],
  targetIso: string
): string | undefined {
  return keysAsc.find((k) => k >= targetIso);
}
function findLastKeyOnOrBefore(
  keysAsc: string[],
  targetIso: string
): string | undefined {
  for (let i = keysAsc.length - 1; i >= 0; i--) {
    if (keysAsc[i] <= targetIso) return keysAsc[i];
  }
  return undefined;
}

export default function MonthlyDataTable({
  data,
  availableMonths,
  categories,
}: MonthlyDataTableProps) {
  /* ────────────────────────────────────────────────────────────────
     Local UI state
     ──────────────────────────────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minSharesFilter, setMinSharesFilter] = useState<string>("");
  const [maxSharesFilter, setMaxSharesFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [rankingMode, setRankingMode] = useState<RankingMode>("none");
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("allTime");

  /* ────────────────────────────────────────────────────────────────
     Derived lists
     ──────────────────────────────────────────────────────────────── */
  const monthsAsc = useMemo(
    () => [...availableMonths].sort(),
    [availableMonths]
  );
  const hasMonths = monthsAsc.length > 0;
  const latestIso = hasMonths ? monthsAsc[monthsAsc.length - 1] : undefined;
  const latestDate = latestIso ? new Date(latestIso) : undefined;

  const displayLabels = useMemo(
    () => getMonthDisplayLabels(availableMonths),
    [availableMonths]
  );

  /* ────────────────────────────────────────────────────────────────
     Filtering / sorting
     ──────────────────────────────────────────────────────────────── */
  const filteredBase = useMemo(() => {
    return data.filter((investor) => {
      // Pre-filter: at least one month has >20k
      const maxShares = Math.max(
        ...availableMonths.map((m) => investor.monthlyShares[m] || 0)
      );
      if (maxShares <= 20000) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = investor.name.toLowerCase().includes(q);
        const descMatch = investor.description
          ? investor.description.toLowerCase().includes(q)
          : false;
        if (!nameMatch && !descMatch) return false;
      }

      if (
        selectedCategory !== "all" &&
        investor.category !== selectedCategory
      ) {
        return false;
      }

      const latestMonth = availableMonths[availableMonths.length - 1];
      const latestShares = investor.monthlyShares[latestMonth] || 0;

      if (minSharesFilter && latestShares < parseInt(minSharesFilter))
        return false;
      if (maxSharesFilter && latestShares > parseInt(maxSharesFilter))
        return false;

      return true;
    });
  }, [
    data,
    availableMonths,
    searchQuery,
    selectedCategory,
    minSharesFilter,
    maxSharesFilter,
  ]);

  const baselineSorted = useMemo(() => {
    const arr = [...filteredBase];
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      if (sortBy === "name") {
        av = a.name;
        bv = b.name;
      } else if (sortBy === "category") {
        av = a.category;
        bv = b.category;
      } else if (availableMonths.includes(sortBy)) {
        av = a.monthlyShares[sortBy] || 0;
        bv = b.monthlyShares[sortBy] || 0;
      }
      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredBase, sortBy, sortOrder, availableMonths]);

  function getRangeBoundsKeys(): { startKey?: string; endKey?: string } {
    if (!hasMonths || !latestDate || !latestIso)
      return { startKey: undefined, endKey: undefined };

    let start: Date;
    let end: Date;

    switch (timeRange) {
      case "30d":
        start = addDays(latestDate, -30);
        end = latestDate;
        break;
      case "60d":
        start = addDays(latestDate, -60);
        end = latestDate;
        break;
      case "90d":
        start = addDays(latestDate, -90);
        end = latestDate;
        break;
      case "thisQuarter":
        start = startOfQuarter(latestDate);
        end = latestDate;
        break;
      case "lastQuarter": {
        const { start: s, end: e } = previousQuarterBounds(latestDate);
        start = s;
        end = e;
        break;
      }
      case "allTime":
      default:
        start = new Date(monthsAsc[0]);
        end = latestDate;
        break;
    }

    const startIso = isoDate(start);
    const endIso = isoDate(end);
    const startKey = findFirstKeyOnOrAfter(monthsAsc, startIso);
    const endKey = findLastKeyOnOrBefore(monthsAsc, endIso);
    return { startKey, endKey };
  }

  const { startKey, endKey } = getRangeBoundsKeys();

  const sortedData = useMemo(() => {
    if (rankingMode === "none" || !startKey || !endKey) return baselineSorted;

    const delta = new Map<string, number>();
    for (const inv of baselineSorted) {
      const s = inv.monthlyShares[startKey] || 0;
      const e = inv.monthlyShares[endKey] || 0;
      delta.set(inv.name, e - s);
    }

    const arr = [...baselineSorted];
    arr.sort((a, b) => {
      const da = delta.get(a.name) ?? 0;
      const db = delta.get(b.name) ?? 0;
      return rankingMode === "buyers" ? db - da : da - db;
    });
    return arr;
  }, [baselineSorted, rankingMode, startKey, endKey]);

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };
  const getSortIcon = (field: string) =>
    sortBy !== field ? null : sortOrder === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 inline-block" />
    );

  /* ────────────────────────────────────────────────────────────────
     Coloring helpers
     ──────────────────────────────────────────────────────────────── */
  const getGradientIntensity = (shares: number): number => {
    if (shares <= 50000) return 0.2;
    if (shares <= 100000) return 0.4;
    if (shares <= 200000) return 0.6;
    if (shares <= 500000) return 0.8;
    return 1.0;
  };
  const getCellColorWithGradient = (
    investor: MonthlyInvestorData,
    monthIndex: number
  ): string => {
    const currentMonth = availableMonths[monthIndex];
    const currentShares = investor.monthlyShares[currentMonth] || 0;
    if (currentShares === 0) return "";

    if (monthIndex === 0) {
      const opacity = getGradientIntensity(currentShares);
      return `rgba(59, 130, 246, ${opacity})`; // blue
    }

    const prevMonth = availableMonths[monthIndex - 1];
    const prevShares = investor.monthlyShares[prevMonth] || 0;

    const change = currentShares - prevShares;
    const opacity = getGradientIntensity(Math.abs(change));

    if (change > 0) return `rgba(34, 197, 94, ${opacity})`; // green
    if (change < 0) return `rgba(239, 68, 68, ${opacity})`; // red
    return `rgba(59, 130, 246, ${opacity})`; // same/blue
  };

  /* ────────────────────────────────────────────────────────────────
     Header grid template (for fixed widths)
     ──────────────────────────────────────────────────────────────── */
  const colWidths = useMemo(() => {
    return {
      name: "300px",
      category: "140px",
      month: "110px",
    };
  }, []);

  /* ────────────────────────────────────────────────────────────────
     UI
     ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <span className="text-sm font-medium">Legend:</span>
        <Badge className="bg-green-100 text-green-800">
          Green: Increased shares
        </Badge>
        <Badge className="bg-red-100 text-red-800">Red: Decreased shares</Badge>
        <Badge className="bg-blue-100 text-blue-800">
          Blue: Same/Initial month
        </Badge>
        <span className="text-xs text-muted-foreground mt-2 md:mt-0">
          Intensity: Light (≤50k) → Dark (&gt;500k)
        </span>
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

        <div className="flex gap-2">
          <Select
            value={rankingMode}
            onValueChange={(v: RankingMode) => setRankingMode(v)}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Rank by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Rank: None</SelectItem>
              <SelectItem value="buyers">Rank: Top Buyers</SelectItem>
              <SelectItem value="sellers">Rank: Top Sellers</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={timeRange}
            onValueChange={(v: TimeRangeKey) => setTimeRange(v)}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="60d">Last 60 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="thisQuarter">This quarter</SelectItem>
              <SelectItem value="lastQuarter">Last quarter</SelectItem>
              <SelectItem value="allTime">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {sortedData.length} investors with &gt;20,000 shares
        {rankingMode !== "none" && startKey && endKey ? (
          <span className="ml-2">
            — ranked by{" "}
            {rankingMode === "buyers" ? "Top Buyers" : "Top Sellers"} (
            {startKey} → {endKey})
          </span>
        ) : null}
      </div>

      {/* Scroll container */}
      <div
        role="region"
        aria-labelledby="monthly-caption"
        tabIndex={0}
        className="w-full max-h-[80vh] overflow-auto bg-white rounded-lg shadow border"
        style={{
          scrollbarColor: "rgba(107,114,128,1) rgba(229,231,235,1)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table className="min-w-full table-fixed border-separate border-spacing-0">
          <caption
            id="monthly-caption"
            className="text-left p-2 sticky left-0 bg-white"
          >
            Monthly Investor Holdings
          </caption>

          {/* Fixed column widths to keep header/body aligned */}
          <colgroup>
            <col style={{ width: colWidths.name }} />
            <col style={{ width: colWidths.category }} />
            {availableMonths.map((_, i) => (
              <col key={i} style={{ width: colWidths.month }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {/* top+left sticky for the very first header cell */}
              <th
                scope="col"
                className="sticky top-0 left-0 z-50 bg-white px-4 py-2 text-left border border-gray-200 whitespace-nowrap cursor-pointer"
                onClick={() => handleSort("name")}
              >
                Fund Group / Investor {getSortIcon("name")}
              </th>

              <th
                scope="col"
                className="sticky top-0 z-40 bg-white px-4 py-2 text-left border border-gray-200 whitespace-nowrap cursor-pointer"
                onClick={() => handleSort("category")}
              >
                Category {getSortIcon("category")}
              </th>

              {displayLabels.map((label, idx) => (
                <th
                  key={availableMonths[idx]}
                  scope="col"
                  className="sticky top-0 z-40 bg-white px-4 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                  onClick={() => handleSort(availableMonths[idx])}
                >
                  {label} {getSortIcon(availableMonths[idx])}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + availableMonths.length}
                  className="h-24 text-center border border-gray-200"
                >
                  No investors found with &gt;20,000 shares.
                </td>
              </tr>
            ) : (
              sortedData.map((inv) => (
                <tr key={inv.name}>
                  {/* FIRST COLUMN as <th scope="row"> so it can be sticky left */}
                  <th
                    scope="row"
                    className="sticky left-0 z-30 bg-white px-4 py-2 text-left border border-gray-200 font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <FundBreakdownDialog investor={inv} />
                      <span>{inv.name}</span>
                      {inv.individualInvestors &&
                        inv.individualInvestors.length > 1 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({inv.individualInvestors.length} entities)
                          </span>
                        )}
                    </div>
                  </th>

                  <td className="px-4 py-2 border border-gray-200 min-w-[140px]">
                    <Badge variant="outline">{inv.category}</Badge>
                  </td>

                  {availableMonths.map((month, index) => (
                    <td
                      key={month}
                      className="px-4 py-2 border border-gray-200 text-right min-w-[110px]"
                      style={{
                        backgroundColor: getCellColorWithGradient(inv, index),
                        color:
                          (inv.monthlyShares[month] || 0) > 0
                            ? "rgba(0,0,0,0.85)"
                            : "inherit",
                      }}
                    >
                      {(inv.monthlyShares[month] || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
