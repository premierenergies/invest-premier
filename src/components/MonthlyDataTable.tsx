// src/components/MonthlyDataTable.tsx
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
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
   API base (same pattern as GroupsTab)  |  CMD+F: GROUPS_TABLE_API_BASE
   ────────────────────────────────────────────────────────────────── */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin;
}
const API = `${apiBase()}/api`;

/* ──────────────────────────────────────────────────────────────────
   Group types (matches /api/groups response)  |  CMD+F: GROUPS_TABLE_TYPES
   ────────────────────────────────────────────────────────────────── */
type GroupMember = { key: string; pan?: string | null; name?: string | null };
type GroupRow = {
  id: number;
  name: string;
  category: string | null;
  memberCount: number;
  members: GroupMember[];
};

/* ──────────────────────────────────────────────────────────────────
   Key helpers (match GroupsTab logic)  |  CMD+F: GROUPS_TABLE_KEYS
   ────────────────────────────────────────────────────────────────── */
function normPan(v?: string | null) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return s || null;
}
function normNameKey(v?: string | null) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}
function looksLikePan(v?: string | null) {
  const s = normPan(v);
  if (!s) return false;
  return (
    /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s) ||
    (s.length === 10 && /^[A-Z0-9]+$/.test(s))
  );
}
function entityKeyFromInvestor(inv: MonthlyInvestorData) {
  const p = normPan((inv as any).pan ?? null);
  return p || String(inv.name ?? "").trim();
}
function normalizeMaybePanKey(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const up = s.toUpperCase().replace(/\s+/g, "");
  if (
    /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(up) ||
    (up.length === 10 && /^[A-Z0-9]+$/.test(up))
  ) {
    return up;
  }
  return s;
}

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

/* ──────────────────────────────────────────────────────────────────
   Category display helper
   ────────────────────────────────────────────────────────────────── */
function getCategoryDisplay(inv: MonthlyInvestorData): string {
  const direct = (inv.category ?? "").trim();
  if (direct) return direct;

  const members = (inv as any).individualInvestors ?? [];
  if (!members.length) return "—";

  const monthKeys = Object.keys(inv.monthlyShares || {}).sort();
  const latestKey = monthKeys[monthKeys.length - 1];
  if (!latestKey) {
    const firstCat =
      members.map((m: any) => (m.category ?? "").trim()).find(Boolean) || "";
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
   Display helpers for group label (kept)
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
  return prefix.replace(/[\s-,:;]+$/, "").trim();
}
function getDisplayName(inv: MonthlyInvestorData): string {
  const members = (inv as any).individualInvestors;
  if (members && members.length > 1) {
    const lcp = longestCommonPrefixCase(members.map((m: any) => m.name || ""));
    if (
      lcp &&
      lcp.length >= Math.max(12, (inv as any).fundGroup?.length || 0)
    ) {
      return lcp;
    }
  }
  return inv.name;
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
     Groups → fetch and local expand/collapse  |  CMD+F: GROUPS_TABLE_FETCH
     ──────────────────────────────────────────────────────────────── */
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Split/Rejoin = expand/collapse members under the group row (UI only)
  const [expandedGroupIds, setExpandedGroupIds] = useState<
    Record<number, boolean>
  >({});
  const toggleExpanded = (groupId: number) => {
    setExpandedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Breakdown dialog target (Eye icon)
  const [breakdownTarget, setBreakdownTarget] =
    useState<MonthlyInvestorData | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setGroupsLoading(true);
      try {
        const r = await fetch(`${API}/groups`, { credentials: "include" });
        if (!r.ok) throw new Error(`GET /api/groups failed (${r.status})`);
        const j = (await r.json()) as GroupRow[];
        if (!alive) return;
        setGroups(Array.isArray(j) ? j : []);
      } catch (e) {
        console.warn("groups fetch failed (table grouping disabled):", e);
        if (!alive) return;
        setGroups([]);
      } finally {
        if (!alive) return;
        setGroupsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ────────────────────────────────────────────────────────────────
     Derived months (from raw dataset keys)
   ──────────────────────────────────────────────────────────────── */
  const monthsAsc = useMemo(() => {
    const s = new Set<string>();

    for (const inv of data || []) {
      Object.keys(inv.monthlyShares || {}).forEach((k) => s.add(k));

      for (const ind of (inv as any).individualInvestors || []) {
        Object.keys(ind.monthlyShares || {}).forEach((k) => s.add(k));
      }
    }

    const all = Array.from(s).sort();

    const hasAnyNonZero = (k: string) => {
      for (const inv of data || []) {
        if ((inv.monthlyShares?.[k] || 0) !== 0) return true;

        for (const ind of (inv as any).individualInvestors || []) {
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

  const monthsDisplayAsc = useMemo(
    () => monthsAsc.filter((k) => k >= IPO_START_ISO),
    [monthsAsc]
  );

  const monthsForDisplay = useMemo(
    () =>
      oldestFirst ? [...monthsDisplayAsc] : [...monthsDisplayAsc].reverse(),
    [monthsDisplayAsc, oldestFirst]
  );

  const displayLabels = useMemo(
    () => getMonthDisplayLabels(monthsForDisplay),
    [monthsForDisplay]
  );

  /* ────────────────────────────────────────────────────────────────
     Build grouped rows for table  |  CMD+F: GROUPS_TABLE_BUILD
     ──────────────────────────────────────────────────────────────── */
  const groupedData: (MonthlyInvestorData & { groupId?: number })[] =
    useMemo(() => {
      const base = Array.isArray(data) ? data : [];

      if (!groups || groups.length === 0) return base as any;

      // Index base investors by PAN and by normalized name for matching
      const byPan = new Map<string, MonthlyInvestorData>();
      const byName = new Map<string, MonthlyInvestorData>();

      for (const inv of base) {
        const p = normPan((inv as any).pan ?? null);
        if (p) byPan.set(p, inv);
        const nk = normNameKey(inv.name);
        if (nk) byName.set(nk, inv);
      }

      const findInvestorForMember = (m: GroupMember): MonthlyInvestorData => {
        const keyRaw = normalizeMaybePanKey(m.key);
        const pan = normPan(m.pan ?? null);
        const name = String(m.name ?? "").trim();

        const keyLooksPan = looksLikePan(keyRaw) || looksLikePan(pan);
        if (keyLooksPan) {
          const p = normPan(keyRaw) || pan;
          const hit = p ? byPan.get(p) : undefined;
          if (hit) return hit;
        }

        // Try match by exact key (as name), then by m.name
        const hit1 = byName.get(normNameKey(keyRaw));
        if (hit1) return hit1;

        const hit2 = name ? byName.get(normNameKey(name)) : undefined;
        if (hit2) return hit2;

        // Fallback: minimal "empty" investor so UI still renders member list
        const fallback: MonthlyInvestorData = {
          pan: pan || (keyLooksPan ? normPan(keyRaw) : null),
          name: name || String(m.key ?? "").trim() || keyRaw || "Unknown",
          category: null,
          description: "",
          fundGroup: "",
          monthlyShares: {},
        } as any;

        return fallback;
      };

      // Track member keys so we can hide them as individual rows (avoid double count)
      const memberKeySet = new Set<string>();

      // Build group rows
      const groupRows: (MonthlyInvestorData & { groupId?: number })[] = [];

      for (const g of groups) {
        const members = Array.isArray(g.members) ? g.members : [];
        if (members.length === 0) continue;

        const memberInvestors = members.map(findInvestorForMember);

        // Sum monthly shares across members
        const summed: Record<string, number> = {};
        for (const mi of memberInvestors) {
          for (const [k, v] of Object.entries(mi.monthlyShares || {})) {
            summed[k] = (summed[k] || 0) + Number(v || 0);
          }
        }

        // Mark membership (both PAN key + name key)
        for (const mi of memberInvestors) {
          const p = normPan((mi as any).pan ?? null);
          if (p) memberKeySet.add(p);
          const nk = normNameKey(mi.name);
          if (nk) memberKeySet.add(nk);
        }

        const row: MonthlyInvestorData & { groupId?: number } = {
          pan: null,
          name: g.name,
          category: g.category ?? null,
          description: "",
          fundGroup: g.name,
          monthlyShares: summed,
          individualInvestors: memberInvestors,
          groupId: g.id,
        } as any;

        groupRows.push(row);
      }

      // Keep only investors that are NOT part of any group (by PAN or name)
      const ungrouped = base.filter((inv) => {
        const p = normPan((inv as any).pan ?? null);
        if (p && memberKeySet.has(p)) return false;
        const nk = normNameKey(inv.name);
        if (nk && memberKeySet.has(nk)) return false;
        return true;
      });

      return [...groupRows, ...ungrouped];
    }, [data, groups]);

  /* ────────────────────────────────────────────────────────────────
     Filtering / sorting (now uses groupedData)
     ──────────────────────────────────────────────────────────────── */
  const filteredBase = useMemo(() => {
    return groupedData.filter((investor) => {
      if (monthsAsc.length === 0) return false;

      // Pre-filter: at least one month has >20k (group totals will qualify too)
      const maxShares = Math.max(
        ...monthsAsc.map((m) => investor.monthlyShares[m] || 0)
      );
      if (maxShares <= 20000) return false;

      const isGroup =
        (investor as any).groupId != null &&
        Array.isArray((investor as any).individualInvestors) &&
        ((investor as any).individualInvestors?.length || 0) > 0;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();

        const nameMatch = investor.name.toLowerCase().includes(q);
        const descMatch = investor.description
          ? investor.description.toLowerCase().includes(q)
          : false;
        const panMatch = ((investor as any).pan || "")
          .toLowerCase()
          .includes(q);

        // For groups: also match against member names/pans so search "finds" a member
        let memberMatch = false;
        if (isGroup) {
          for (const m of (investor as any).individualInvestors || []) {
            const mn = String(m?.name || "").toLowerCase();
            const mp = String(m?.pan || "").toLowerCase();
            if (mn.includes(q) || mp.includes(q)) {
              memberMatch = true;
              break;
            }
          }
        }

        if (!nameMatch && !descMatch && !panMatch && !memberMatch) return false;
      }

      if (selectedCategory !== "all") {
        const cat = getCategoryDisplay(investor);
        if (cat !== selectedCategory) return false;
      }

      const latestMonth = latestIso;
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
    groupedData,
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
        av = getCategoryDisplay(a);
        bv = getCategoryDisplay(b);
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
      const rowKey =
        (inv as any).groupId != null
          ? `group:${(inv as any).groupId}`
          : inv.pan || inv.name;
      const s = inv.monthlyShares[startKey] || 0;
      const e = inv.monthlyShares[endKey] || 0;
      delta.set(rowKey, e - s);
    }

    const arr = [...baselineSorted];
    arr.sort((a, b) => {
      const ka =
        (a as any).groupId != null
          ? `group:${(a as any).groupId}`
          : a.pan || a.name;
      const kb =
        (b as any).groupId != null
          ? `group:${(b as any).groupId}`
          : b.pan || b.name;

      const da = delta.get(ka) ?? 0;
      const db = delta.get(kb) ?? 0;
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

    if (monthIndex === 0) {
      if (current === 0) return "";
      const op = getGradientIntensity(0);
      return `rgba(59, 130, 246, ${op})`;
    }

    const prevMonth = monthsForDisplay[monthIndex - 1];
    const prev = investor.monthlyShares[prevMonth] || 0;

    if (current === 0 && prev === 0) return "";

    const delta = current - prev;
    const op = getGradientIntensity(Math.abs(delta));

    if (delta > 0) return `rgba(34, 197, 94, ${op})`;
    if (delta < 0) return `rgba(239, 68, 68, ${op})`;
    return `rgba(59, 130, 246, ${op})`;
  };

  /* ────────────────────────────────────────────────────────────────
     Header grid template (for fixed widths)
     ──────────────────────────────────────────────────────────────── */
  const colWidths = useMemo(() => {
    return {
      name: "250px",
      category: "120px",
      month: "96px",
    };
  }, []);

  /* ────────────────────────────────────────────────────────────────
     Hover card: show group members neatly on hover
     ──────────────────────────────────────────────────────────────── */
  function EntitiesHover({
    investor,
    trigger,
  }: {
    investor: MonthlyInvestorData;
    trigger: ReactNode;
  }) {
    const hasGroup =
      !!(investor as any).individualInvestors &&
      (investor as any).individualInvestors.length > 1;

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
                    {(investor as any).individualInvestors!.length} entities
                    {latestLabel ? ` • as of ${latestLabel}` : ""}
                  </div>
                </div>

                <div className="max-h-64 overflow-auto divide-y">
                  {(investor as any).individualInvestors!.map(
                    (ind: any, i: number) => {
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
                    }
                  )}
                </div>

                <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/30">
                  Tip: Click the eye icon to open full month-by-month breakdown.
                </div>
              </>
            ) : (
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
      <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium">Legend</div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
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
            placeholder="Search investors / groups..."
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
        Showing {sortedData.length} rows with &gt;20,000 shares
        {groupsLoading ? <span className="ml-2">• loading groups…</span> : null}
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
              sortedData.map((inv, idx) => {
                const groupId = (inv as any).groupId as number | undefined;
                const isGroup =
                  groupId != null &&
                  Array.isArray((inv as any).individualInvestors) &&
                  ((inv as any).individualInvestors?.length || 0) > 0;

                const expanded = !!(
                  groupId != null && expandedGroupIds[groupId]
                );

                const rowKey = isGroup
                  ? `group:${groupId}`
                  : inv.pan || inv.name || String(idx);

                const members: MonthlyInvestorData[] = isGroup
                  ? ((inv as any).individualInvestors as MonthlyInvestorData[])
                  : [];

                return (
                  <React.Fragment key={rowKey}>
                    <tr>
                      <th
                        scope="row"
                        className="sticky left-0 z-30 bg-white px-3 py-2 text-left border border-gray-200 font-medium"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <EntitiesHover
                              investor={inv}
                              trigger={
                                <div className="min-w-0">
                                  <div className="whitespace-normal break-words">
                                    {inv.name}
                                  </div>
                                  {!isGroup && inv.pan ? (
                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                      PAN: {inv.pan}
                                    </div>
                                  ) : null}
                                  {isGroup ? (
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      <Badge variant="outline">
                                        Group • {members.length} members
                                      </Badge>
                                      {inv.category ? (
                                        <Badge variant="outline">
                                          {inv.category}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              }
                            />
                          </div>

                          {isGroup ? (
                            <div className="shrink-0 flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="View individuals + holdings"
                                onClick={() => setBreakdownTarget(inv)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                title={
                                  expanded
                                    ? "Rejoin group (collapse)"
                                    : "Split group (expand)"
                                }
                                onClick={() => toggleExpanded(groupId!)}
                              >
                                {expanded ? "Rejoin" : "Split"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </th>

                      <td className="px-4 py-2 border border-gray-200 min-w-[120px]">
                        <Badge variant="outline">
                          {getCategoryDisplay(inv)}
                        </Badge>
                      </td>

                      {monthsForDisplay.map((month, index) => (
                        <td
                          key={month}
                          className="px-4 py-2 border border-gray-200 text-right min-w-[96px]"
                          style={{
                            backgroundColor: getCellColorWithGradient(
                              inv,
                              index
                            ),
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

                    {/* Expanded member rows under group (Split/Rejoin) */}
                    {isGroup && expanded
                      ? members.map((m, mi) => {
                          const mk = entityKeyFromInvestor(m);
                          const memberRowKey = `${rowKey}:m:${mk}:${mi}`;

                          return (
                            <tr key={memberRowKey} className="bg-muted/30">
                              <th
                                scope="row"
                                className="sticky left-0 z-20 bg-muted/30 px-3 py-2 text-left border border-gray-200 font-normal"
                              >
                                <div className="pl-3">
                                  <div className="text-sm whitespace-normal break-words">
                                    <span className="text-muted-foreground mr-1">
                                      ↳
                                    </span>
                                    {m.name}
                                  </div>
                                  {m.pan ? (
                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                      PAN: {m.pan}
                                    </div>
                                  ) : null}
                                </div>
                              </th>

                              <td className="px-4 py-2 border border-gray-200 min-w-[120px]">
                                <Badge variant="outline">
                                  {getCategoryDisplay(m)}
                                </Badge>
                              </td>

                              {monthsForDisplay.map((month, index) => (
                                <td
                                  key={month}
                                  className="px-4 py-2 border border-gray-200 text-right min-w-[96px]"
                                  style={{
                                    backgroundColor: getCellColorWithGradient(
                                      m,
                                      index
                                    ),
                                    color:
                                      (m.monthlyShares[month] || 0) > 0
                                        ? "rgba(0,0,0,0.85)"
                                        : "inherit",
                                  }}
                                >
                                  {(
                                    m.monthlyShares[month] || 0
                                  ).toLocaleString()}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Eye Breakdown Dialog */}
      <Dialog
        open={!!breakdownTarget}
        onOpenChange={(v) => {
          if (!v) setBreakdownTarget(null);
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {breakdownTarget?.name || "Group Breakdown"}
              </span>
              {breakdownTarget && (breakdownTarget as any).groupId != null ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toggleExpanded((breakdownTarget as any).groupId)
                  }
                >
                  {expandedGroupIds[(breakdownTarget as any).groupId]
                    ? "Rejoin"
                    : "Split"}
                </Button>
              ) : null}
            </DialogTitle>

            <DialogDescription className="px-6 pb-3">
              {(breakdownTarget as any)?.individualInvestors?.length
                ? `${
                    (breakdownTarget as any).individualInvestors.length
                  } individuals • totals are summed as the group row`
                : "No individuals found for this group."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6 overflow-auto min-h-0">
            {breakdownTarget &&
            Array.isArray((breakdownTarget as any).individualInvestors) ? (
              <div className="rounded-lg border overflow-auto max-h-[70vh]">
                <table className="min-w-[900px] w-full table-fixed border-separate border-spacing-0">
                  <colgroup>
                    <col style={{ width: "320px" }} />
                    <col style={{ width: "140px" }} />
                    {monthsForDisplay.map((_, i) => (
                      <col key={i} style={{ width: colWidths.month }} />
                    ))}
                  </colgroup>

                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-40 bg-white px-3 py-2 text-left border border-gray-200">
                        Individual
                      </th>
                      <th className="sticky top-0 z-30 bg-white px-3 py-2 text-left border border-gray-200">
                        Category
                      </th>
                      {displayLabels.map((lbl, i) => (
                        <th
                          key={monthsForDisplay[i]}
                          className="sticky top-0 z-30 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap"
                        >
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {(breakdownTarget as any).individualInvestors.map(
                      (m: MonthlyInvestorData, i: number) => (
                        <tr key={`bd:${i}:${m.pan || m.name}`}>
                          <th className="sticky left-0 z-20 bg-white px-3 py-2 text-left border border-gray-200 font-medium">
                            <div className="whitespace-normal break-words">
                              {m.name}
                            </div>
                            {m.pan ? (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                PAN: {m.pan}
                              </div>
                            ) : null}
                          </th>
                          <td className="px-3 py-2 border border-gray-200">
                            <Badge variant="outline">
                              {getCategoryDisplay(m)}
                            </Badge>
                          </td>
                          {monthsForDisplay.map((month, idx2) => (
                            <td
                              key={month}
                              className="px-3 py-2 border border-gray-200 text-right"
                              style={{
                                backgroundColor: getCellColorWithGradient(
                                  m,
                                  idx2
                                ),
                                color:
                                  (m.monthlyShares[month] || 0) > 0
                                    ? "rgba(0,0,0,0.85)"
                                    : "inherit",
                              }}
                            >
                              {(m.monthlyShares[month] || 0).toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      )
                    )}

                    {/* Totals row */}
                    <tr className="bg-muted/40">
                      <th className="sticky left-0 z-20 bg-muted/40 px-3 py-2 text-left border border-gray-200 font-semibold">
                        Group Total
                      </th>
                      <td className="px-3 py-2 border border-gray-200">
                        <Badge variant="outline">
                          {getCategoryDisplay(breakdownTarget)}
                        </Badge>
                      </td>
                      {monthsForDisplay.map((month, idx2) => (
                        <td
                          key={month}
                          className="px-3 py-2 border border-gray-200 text-right font-semibold"
                          style={{
                            backgroundColor: getCellColorWithGradient(
                              breakdownTarget,
                              idx2
                            ),
                          }}
                        >
                          {(
                            breakdownTarget.monthlyShares?.[month] || 0
                          ).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 pb-6 text-sm text-muted-foreground">
                No breakdown available.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
