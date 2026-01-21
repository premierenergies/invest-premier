// src/components/MonthlyDataTable.tsx
import React, { useMemo, useState, type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

interface MonthlyDataTableProps {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

const IPO_START_ISO = "2024-09-03";

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
// Helper: display category; for groups without a category, pick the member
// with the largest holding at the latest month available for the group.
function getCategoryDisplay(inv: MonthlyInvestorData): string {
  const direct = (inv.category ?? "").trim();
  if (direct) return direct;

  const members = inv.individualInvestors ?? [];
  if (!members.length) return "—";

  const monthKeys = Object.keys(inv.monthlyShares || {}).sort();
  const latestKey = monthKeys[monthKeys.length - 1];
  if (!latestKey) {
    const firstCat =
      members.map((m) => (m.category ?? "").trim()).find(Boolean) || "";
    return firstCat || "—";
  }

  let bestCat = "";
  let best = -1;
  for (const m of members) {
    const v = Number(m.monthlyShares?.[latestKey] || 0);
    if (v > best) {
      best = v;
      bestCat = (m.category ?? "").trim();
    }
  }
  return bestCat || "—";
}
/* ──────────────────────────────────────────────────────────────────
   Display helpers for group label
   ────────────────────────────────────────────────────────────────── */
function longestCommonPrefixCase(names: string[]): string {
  if (!names || names.length === 0) return "";
  let prefix = (names[0] || "").trim();
  for (const raw of names.slice(1)) {
    const s = (raw || "").trim();
    let i = 0;
    while (
      i < prefix.length &&
      i < s.length &&
      prefix[i].toLowerCase() === s[i].toLowerCase()
    ) {
      i++;
    }
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  // clean trailing punctuation/spaces like " -", "," etc.
  return prefix.replace(/[\s-,:;]+$/, "").trim();
}

function getDisplayName(inv: MonthlyInvestorData): string {
  const members = inv.individualInvestors;
  if (members && members.length > 1) {
    const lcp = longestCommonPrefixCase(members.map((m) => m.name || ""));
    // Use LCP if it looks meaningfully longer than the short fundGroup key
    if (lcp && lcp.length >= Math.max(12, inv.fundGroup?.length || 0)) {
      return lcp;
    }
  }
  return inv.name; // fallback to whatever the object carries
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
  const [oldestFirst, setOldestFirst] = useState(true);

  /* ────────────────────────────────────────────────────────────────
     Derived lists
     ──────────────────────────────────────────────────────────────── */

  // IMPORTANT: derive months from actual dataset keys (prevents phantom columns)
  // IMPORTANT: derive months from actual dataset keys (prevents phantom columns)
  const monthsAsc = useMemo(() => {
    const s = new Set<string>();

    for (const inv of data || []) {
      Object.keys(inv.monthlyShares || {}).forEach((k) => s.add(k));

      for (const ind of inv.individualInvestors || []) {
        Object.keys(ind.monthlyShares || {}).forEach((k) => s.add(k));
      }
    }

    const all = Array.from(s).sort(); // ISO yyyy-mm-dd sorts correctly

    // ✅ Drop "phantom" months: months where nobody has a non-zero value
    const hasAnyNonZero = (k: string) => {
      for (const inv of data || []) {
        if ((inv.monthlyShares?.[k] || 0) !== 0) return true;

        for (const ind of inv.individualInvestors || []) {
          if ((ind.monthlyShares?.[k] || 0) !== 0) return true;
        }
      }
      return false;
    };

    return all.filter(hasAnyNonZero);
  }, [data]);

  const hasMonths = monthsAsc.length > 0;
  const latestIso = hasMonths ? monthsAsc[monthsAsc.length - 1] : undefined;
  const latestDate = latestIso ? new Date(latestIso) : undefined;

  // Only display columns from IPO date onward (inclusive), in ASC
  const monthsDisplayAsc = useMemo(
    () => monthsAsc.filter((k) => k >= IPO_START_ISO),
    [monthsAsc]
  );

  // Final order for the table header/body (default IPO→Latest)
  const monthsForDisplay = useMemo(
    () =>
      oldestFirst ? [...monthsDisplayAsc] : [...monthsDisplayAsc].reverse(),
    [monthsDisplayAsc, oldestFirst]
  );

  // Labels follow the display order
  const displayLabels = useMemo(
    () => getMonthDisplayLabels(monthsForDisplay),
    [monthsForDisplay]
  );

  /* ────────────────────────────────────────────────────────────────
     Filtering / sorting
       const displayLabels = useMemo(
    () => getMonthDisplayLabels(availableMonths),
    [availableMonths]
  );
     ──────────────────────────────────────────────────────────────── */
  const filteredBase = useMemo(() => {
    return data.filter((investor) => {
      // Pre-filter: at least one month has >20k
      if (monthsAsc.length === 0) return false;

      const maxShares = Math.max(
        ...monthsAsc.map((m) => investor.monthlyShares[m] || 0)
      );
      if (maxShares <= 20000) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        // CMD+F: const nameMatch = investor.name.toLowerCase().includes(q);
        const nameMatch = investor.name.toLowerCase().includes(q);
        const descMatch = investor.description
          ? investor.description.toLowerCase().includes(q)
          : false;
        const panMatch = (investor.pan || "").toLowerCase().includes(q);

        if (!nameMatch && !descMatch && !panMatch) return false;
      }

      if (
        selectedCategory !== "all" &&
        investor.category !== selectedCategory
      ) {
        return false;
      }

      const latestMonth = latestIso; // from derived monthsAsc
      const latestShares = latestMonth
        ? investor.monthlyShares[latestMonth] || 0
        : 0;

      if (minSharesFilter && latestShares < parseInt(minSharesFilter))
        return false;
      if (maxSharesFilter && latestShares > parseInt(maxSharesFilter))
        return false;

      return true;
    });
  }, [
    data,
    monthsAsc,
    latestIso,
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
      } else if (monthsAsc.includes(sortBy)) {
        av = a.monthlyShares[sortBy] || 0;
        bv = b.monthlyShares[sortBy] || 0;
      }

      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredBase, sortBy, sortOrder, monthsAsc]);

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
  /* ────────────────────────────────────────────────────────────────
   Coloring helpers  (shared by legend & table)
   ──────────────────────────────────────────────────────────────── */
  // Buckets are inclusive upper-bounds for |Δshares| → opacity step
  const GRADIENT_THRESHOLDS = [50_000, 100_000, 200_000, 500_000] as const;
  const OPACITY_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0] as const;

  const getGradientIntensity = (absDelta: number): number => {
    if (absDelta <= GRADIENT_THRESHOLDS[0]) return OPACITY_STEPS[0];
    if (absDelta <= GRADIENT_THRESHOLDS[1]) return OPACITY_STEPS[1];
    if (absDelta <= GRADIENT_THRESHOLDS[2]) return OPACITY_STEPS[2];
    if (absDelta <= GRADIENT_THRESHOLDS[3]) return OPACITY_STEPS[3];
    return OPACITY_STEPS[4];
  };

  const getCellColorWithGradient = (
    investor: MonthlyInvestorData,
    monthIndex: number
  ): string => {
    const currentMonth = monthsForDisplay[monthIndex];
    const current = investor.monthlyShares[currentMonth] || 0;

    // First visible column: no previous month to compare.
    // Keep previous behavior: if zero, no color; else blue.
    if (monthIndex === 0) {
      if (current === 0) return "";
      const op = getGradientIntensity(0);
      return `rgba(59, 130, 246, ${op})`;
    }

    const prevMonth = monthsForDisplay[monthIndex - 1];
    const prev = investor.monthlyShares[prevMonth] || 0;

    // Preserve your old "don't color zeros" behavior ONLY for 0 → 0
    if (current === 0 && prev === 0) return "";

    const delta = current - prev;
    const op = getGradientIntensity(Math.abs(delta));

    if (delta > 0) return `rgba(34, 197, 94, ${op})`; // green (bought)
    if (delta < 0) return `rgba(239, 68, 68, ${op})`; // red (sold)
    return `rgba(59, 130, 246, ${op})`; // blue (no change)
  };

  /* ────────────────────────────────────────────────────────────────
     Header grid template (for fixed widths)
     ──────────────────────────────────────────────────────────────── */
  const colWidths = useMemo(() => {
    return {
      name: "250px", // was 240
      category: "120px", // was 140
      month: "96px", // was 110
    };
  }, []);

  // ────────────────────────────────────────────────────────────────
  // Hover card: show clubbed entity names neatly on hover
  // ────────────────────────────────────────────────────────────────
  function EntitiesHover({
    investor,
    trigger,
  }: {
    investor: MonthlyInvestorData;
    trigger: ReactNode;
  }) {
    const hasGroup =
      !!investor.individualInvestors && investor.individualInvestors.length > 1;

    const latestKey = monthsAsc[monthsAsc.length - 1];
    const latestLabel = latestKey
      ? getMonthDisplayLabels([latestKey])[0]
      : undefined;

    return (
      <HoverCard>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardPrimitive.Portal
          container={
            typeof document !== "undefined" ? document.body : undefined
          }
        >
          <HoverCardContent
            side="right"
            align="start"
            className="z-[1000] w-[420px] p-0 rounded-xl overflow-hidden shadow-xl"
          >
            {hasGroup ? (
              <>
                <div className="px-3 py-2 border-b bg-muted/40">
                  <div className="text-sm font-semibold break-words whitespace-normal">
                    {investor.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {investor.individualInvestors!.length} entities
                    {latestLabel ? ` • as of ${latestLabel}` : ""}
                  </div>
                </div>

                <div className="max-h-64 overflow-auto divide-y">
                  {investor.individualInvestors!.map((ind, i) => {
                    const latestVal = latestKey
                      ? ind.monthlyShares[latestKey] || 0
                      : 0;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <span className="w-6 text-xs text-muted-foreground tabular-nums">
                          {i + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium break-words"
                            title={ind.name}
                          >
                            {ind.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {ind.category || "—"}
                          </div>
                        </div>
                        <div className="text-sm tabular-nums">
                          {latestVal.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/30">
                  Tip: Click the eye icon to open the full breakdown with all
                  months.
                </div>
              </>
            ) : (
              // Minimal card for single entities: full name + category (+ latest value)
              <div className="px-3 py-2">
                <div className="text-sm font-semibold break-words whitespace-normal">
                  {investor.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {investor.category || "—"}
                  {latestLabel ? ` • as of ${latestLabel}` : ""}
                </div>
                {latestKey && (
                  <div className="mt-2 text-sm tabular-nums">
                    Latest:{" "}
                    {(investor.monthlyShares[latestKey] || 0).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </HoverCardContent>
        </HoverCardPrimitive.Portal>
      </HoverCard>
    );
  }

  /* ────────────────────────────────────────────────────────────────
     UI
     ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Legend */}
      {/* Legend */}
      <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium">Legend</div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          {/* Green scale (Bought / Δ > 0) */}
          <div className="flex items-center gap-2">
            <span className="text-xs w-20 sm:w-auto">Bought</span>
            {OPACITY_STEPS.map((op, i) => (
              <span
                key={`g${i}`}
                className="h-4 w-6 rounded border border-black/5"
                style={{ backgroundColor: `rgba(34, 197, 94, ${op})` }}
                title={
                  i === 0
                    ? `Δ ≤ ${GRADIENT_THRESHOLDS[0].toLocaleString()}`
                    : i === 1
                    ? `Δ ≤ ${GRADIENT_THRESHOLDS[1].toLocaleString()}`
                    : i === 2
                    ? `Δ ≤ ${GRADIENT_THRESHOLDS[2].toLocaleString()}`
                    : i === 3
                    ? `Δ ≤ ${GRADIENT_THRESHOLDS[3].toLocaleString()}`
                    : `Δ > ${GRADIENT_THRESHOLDS[3].toLocaleString()}`
                }
              />
            ))}
            <span className="text-[11px] text-muted-foreground">
              Δ shares: ≤50k • ≤100k • ≤200k • ≤500k • &gt;500k
            </span>
          </div>

          {/* Red scale (Sold / Δ < 0) */}
          <div className="flex items-center gap-2">
            <span className="text-xs w-20 sm:w-auto">Sold</span>
            {OPACITY_STEPS.map((op, i) => (
              <span
                key={`r${i}`}
                className="h-4 w-6 rounded border border-black/5"
                style={{ backgroundColor: `rgba(239, 68, 68, ${op})` }}
                title={
                  i === 0
                    ? `|Δ| ≤ ${GRADIENT_THRESHOLDS[0].toLocaleString()}`
                    : i === 1
                    ? `|Δ| ≤ ${GRADIENT_THRESHOLDS[1].toLocaleString()}`
                    : i === 2
                    ? `|Δ| ≤ ${GRADIENT_THRESHOLDS[2].toLocaleString()}`
                    : i === 3
                    ? `|Δ| ≤ ${GRADIENT_THRESHOLDS[3].toLocaleString()}`
                    : `|Δ| > ${GRADIENT_THRESHOLDS[3].toLocaleString()}`
                }
              />
            ))}
          </div>

          {/* Blue note */}
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800">Blue</Badge>
            <span className="text-xs text-muted-foreground">
              Leftmost column (no prior month to compare) or no change vs
              previous
            </span>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Columns default to <strong>IPO (Sep 03, 2024)</strong> →{" "}
          <strong>latest upload</strong>. Use the toggle to reverse.
        </div>
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
        <Button
          variant="outline"
          onClick={() => setOldestFirst((v) => !v)}
          className="ml-auto"
          title={
            oldestFirst ? "Switch to Latest → First" : "Switch to IPO → Latest"
          }
        >
          {oldestFirst ? "Order: IPO → Latest" : "Order: Latest → IPO"}
        </Button>
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
            Monthly Investor Holdings — Columns:{" "}
            {oldestFirst ? "IPO → Latest" : "Latest → IPO"}
          </caption>

          {/* Fixed column widths to keep header/body aligned */}
          <colgroup>
            <col style={{ width: colWidths.name }} />
            <col style={{ width: colWidths.category }} />
            {monthsForDisplay.map((_, i) => (
              <col key={i} style={{ width: colWidths.month }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-50 bg-white px-3 py-2 text-left border border-gray-200 whitespace-nowrap cursor-pointer"
                onClick={() => handleSort("name")}
              >
                Investor {getSortIcon("name")}
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
                  key={monthsForDisplay[idx]}
                  className="sticky top-0 z-40 bg-white px-4 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                  onClick={() => handleSort(monthsForDisplay[idx])}
                >
                  {label} {getSortIcon(monthsForDisplay[idx])}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + monthsForDisplay.length}
                  className="h-24 text-center border border-gray-200"
                >
                  No investors found with &gt;20,000 shares.
                </td>
              </tr>
            ) : (
              sortedData.map((inv) => {
                const isGroup =
                  !!inv.individualInvestors &&
                  inv.individualInvestors.length > 1;
                const label =
                  inv.individualInvestors && inv.individualInvestors.length > 1
                    ? getDisplayName(inv) // use LCP/group label only for true clubs
                    : inv.name; // always full name for non-clubbed
                // always show full name in the cell
                // full name if not clubbed

                return (
                  <tr key={inv.pan || inv.name}>
                    <th
                      scope="row"
                      className="sticky left-0 z-30 bg-white px-3 py-2 text-left border border-gray-200 font-medium"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          title={inv.name}
                          className="whitespace-normal break-words"
                        >
                          {inv.name}
                        </span>
                        {inv.pan ? (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            PAN: {inv.pan}
                          </div>
                        ) : null}
                      </div>
                    </th>

                    <td className="px-4 py-2 border border-gray-200 min-w-[120px]">
                      <Badge variant="outline">{getCategoryDisplay(inv)}</Badge>
                    </td>

                    {monthsForDisplay.map((month, index) => (
                      <td
                        key={month}
                        className="px-4 py-2 border border-gray-200 text-right min-w-[96px]"
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
