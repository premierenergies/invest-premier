// root/src/components/ComparisonTableTab.tsx
import React, { useEffect, useMemo, useState, useDeferredValue } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MonthlyInvestorData } from "@/types";
import { getMonthDisplayLabels } from "@/utils/csvUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowRight, ArrowUp, Eye, X } from "lucide-react";

const IPO_START_ISO = "2024-09-03";
const MIN_ANYTIME_SHARES = 20_000;

type MonthlyInvestorDataWithPan = MonthlyInvestorData & { pan?: string | null };

/* ----------------------------- helpers ----------------------------- */
function clean(v: any) {
  return String(v ?? "").trim();
}
function norm(v: any) {
  return clean(v).toLowerCase();
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function findFirstKeyOnOrAfter(keysAsc: string[], targetIso: string) {
  return keysAsc.find((k) => k >= targetIso);
}

function getCategoryDisplay(inv: MonthlyInvestorData): string {
  const direct = clean((inv as any)?.category);
  if (direct) return direct;

  const members = (inv as any)?.individualInvestors ?? [];
  if (!Array.isArray(members) || !members.length) return "—";

  const monthKeys = Object.keys((inv as any)?.monthlyShares || {}).sort();
  const latestKey = monthKeys[monthKeys.length - 1];
  if (!latestKey) {
    const firstCat =
      members.map((m: any) => clean(m?.category)).find(Boolean) || "";
    return firstCat || "—";
  }

  let bestCat = "";
  let best = -1;
  for (const m of members) {
    const v = Number((m as any)?.monthlyShares?.[latestKey] || 0);
    if (v > best) {
      best = v;
      bestCat = clean((m as any)?.category);
    }
  }
  return bestCat || "—";
}

function monthLabel(iso: string) {
  return getMonthDisplayLabels([iso])[0] || iso;
}

function passesAnytimeMin(inv: MonthlyInvestorData, minShares: number) {
  const series = (inv as any)?.monthlyShares || {};
  for (const [iso, v] of Object.entries(series)) {
    if (iso >= IPO_START_ISO && Number(v || 0) >= minShares) return true;
  }
  return false;
}

// stable key to avoid duplicate-name collisions + trailing spaces issues
function investorKey(inv: MonthlyInvestorDataWithPan) {
  const pan = clean((inv as any)?.pan);
  if (pan) return `PAN:${pan.toUpperCase()}`;
  const name = clean((inv as any)?.name);
  return `NAME:${name}`;
}

// Intensity grading using rgba so we don’t need Tailwind safelist for dynamic classes.
function tintForDelta(delta: number, maxAbs: number) {
  if (!delta) return { bg: "transparent", fg: "inherit" };

  const abs = Math.abs(delta);
  const denom = Math.max(1, maxAbs);
  const alpha = Math.min(0.45, 0.08 + (abs / denom) * 0.37);

  const isPos = delta > 0;
  const bg = isPos ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;

  const fg = alpha > 0.28 ? "rgba(17,24,39,1)" : "rgba(31,41,55,1)";
  return { bg, fg };
}

function MultiSelect({
  label,
  items,
  selected,
  onChange,
  maxHeightClass = "max-h-64",
  enableSearch = false,
  searchPlaceholder = "Search…",
}: {
  label: string;
  items: { value: string; text: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  maxHeightClass?: string;
  enableSearch?: boolean;
  searchPlaceholder?: string;
}) {
  const selectedCount = selected.size;

  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  const visibleItems = useMemo(() => {
    if (!enableSearch) return items;
    const q = norm(localSearch);
    if (!q) return items;
    return items.filter(
      (it) => norm(it.text).includes(q) || norm(it.value).includes(q)
    );
  }, [items, enableSearch, localSearch]);

  const clear = () => onChange(new Set());

  // “Select all” should act on what you can currently see (especially when searching)
  const selectAll = () => onChange(new Set(visibleItems.map((i) => i.value)));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setLocalSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between">
          <span className="truncate">
            {label}
            {selectedCount ? ` (${selectedCount})` : ""}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-3" align="start">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">{label}</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>

        {enableSearch && (
          <div className="mt-2">
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9"
              autoFocus
            />
          </div>
        )}

        <div className="mt-2">
          <div className={`${maxHeightClass} overflow-y-auto pr-2`}>
            <div className="space-y-2">
              {visibleItems.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  No matches.
                </div>
              ) : (
                visibleItems.map((it) => {
                  const checked = selected.has(it.value);
                  return (
                    <label
                      key={it.value}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (Boolean(v)) next.add(it.value);
                          else next.delete(it.value);
                          onChange(next);
                        }}
                      />
                      <span className="text-sm leading-5 break-words">
                        {it.text}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupSplitDialog({
  investor,
  initialKey,
  latestKey,
  selectedDatesAsc,
}: {
  investor: MonthlyInvestorData;
  initialKey?: string;
  latestKey?: string;
  selectedDatesAsc: string[];
}) {
  const members = (investor as any)?.individualInvestors ?? [];
  const isGroup = Array.isArray(members) && members.length > 1;
  if (!isGroup) return null;

  const initK = initialKey;
  const latestK = latestKey;
  if (!initK || !latestK) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="View split (individual investors)"
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[80vh] overflow-visible">
        <DialogHeader>
          <DialogTitle>{(investor as any)?.name} — Split View</DialogTitle>
          <DialogDescription>
            Breakdown of {members.length} individual investors
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-auto">
          <table className="w-full min-w-max table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 z-50 bg-white text-left px-3 py-2 border border-gray-200">
                  Investor Name
                </th>
                <th className="sticky top-0 z-50 bg-white text-left px-3 py-2 border border-gray-200">
                  Category
                </th>
                <th className="sticky top-0 z-50 bg-white text-right px-3 py-2 border border-gray-200">
                  Initial ({monthLabel(initK)})
                </th>

                {selectedDatesAsc.map((d) => (
                  <th
                    key={d}
                    className="sticky top-0 z-50 bg-white text-right px-3 py-2 border border-gray-200"
                  >
                    Holding ({monthLabel(d)})
                  </th>
                ))}

                <th className="sticky top-0 z-50 bg-white text-right px-3 py-2 border border-gray-200">
                  Latest ({monthLabel(latestK)})
                </th>
              </tr>
            </thead>

            <tbody>
              {members.map((m: any, idx: number) => {
                const init = Number(m?.monthlyShares?.[initK] || 0);
                const latest = Number(m?.monthlyShares?.[latestK] || 0);
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2 border border-gray-200 font-medium">
                      {m?.name}
                    </td>
                    <td className="px-3 py-2 border border-gray-200">
                      <Badge variant="outline">{m?.category || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                      {init.toLocaleString()}
                    </td>

                    {selectedDatesAsc.map((d) => {
                      const v = Number(m?.monthlyShares?.[d] || 0);
                      return (
                        <td
                          key={d}
                          className="px-3 py-2 border border-gray-200 text-right tabular-nums"
                        >
                          {v.toLocaleString()}
                        </td>
                      );
                    })}

                    <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                      {latest.toLocaleString()}
                    </td>
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

function RowAllDatesDialog({
  investor,
  monthsFromIpoAsc,
}: {
  investor: MonthlyInvestorData;
  monthsFromIpoAsc: string[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Open row (all dates)"
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[80vh] overflow-visible">
        <DialogHeader>
          <DialogTitle>{(investor as any)?.name} — All Dates</DialogTitle>
          <DialogDescription>
            This mirrors the Monthly DataTable row (IPO onward)
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-auto">
          <table className="w-full min-w-max table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 z-50 bg-white text-left px-3 py-2 border border-gray-200">
                  Month
                </th>
                <th className="sticky top-0 z-50 bg-white text-right px-3 py-2 border border-gray-200">
                  Holding
                </th>
              </tr>
            </thead>
            <tbody>
              {monthsFromIpoAsc.map((m) => (
                <tr key={m}>
                  <td className="px-3 py-2 border border-gray-200">
                    {monthLabel(m)}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                    {Number(
                      (investor as any)?.monthlyShares?.[m] || 0
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- component ----------------------------- */
export default function ComparisonTableTab({
  data,
  availableMonths,
  categories,
}: {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}) {
  const monthsAsc = useMemo(
    () => [...availableMonths].sort(),
    [availableMonths]
  );
  const monthsFromIpoAsc = useMemo(
    () => monthsAsc.filter((m) => m >= IPO_START_ISO),
    [monthsAsc]
  );

  const latestKey = monthsAsc.length
    ? monthsAsc[monthsAsc.length - 1]
    : undefined;

  // Initial: prefer exact 2024-09-03 if present, else first on/after
  const initialKey = useMemo(() => {
    if (!monthsAsc.length) return undefined;
    if (monthsAsc.includes(IPO_START_ISO)) return IPO_START_ISO;
    return findFirstKeyOnOrAfter(monthsAsc, IPO_START_ISO);
  }, [monthsAsc]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set()); // stores investorKey()

  type SortOrder = "asc" | "desc";
  type SortKey =
    | "name"
    | "category"
    | "initial"
    | "latest"
    | "netLatest"
    | `holding:${string}`
    | `net:${string}`;

  type RankingMode = "none" | "buyers" | "sellers";

  const [sortKey, setSortKey] = useState<SortKey>("netLatest");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [rankingMode, setRankingMode] = useState<RankingMode>("none");

  const selectedDatesAsc = useMemo(() => {
    return Array.from(selectedDates).sort();
  }, [selectedDates]);

  // If user removes a compare-date that was used in sorting, reset sort to a valid column.
  useEffect(() => {
    if (sortKey.startsWith("holding:")) {
      const d = sortKey.slice("holding:".length);
      if (!selectedDates.has(d)) setSortKey("netLatest");
    }
    if (sortKey.startsWith("net:")) {
      const d = sortKey.slice("net:".length);
      if (!selectedDates.has(d)) setSortKey("netLatest");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatesAsc.join("|")]);

  const defaultSortOrderFor = (key: SortKey): SortOrder => {
    if (key === "name" || key === "category") return "asc";
    // numeric columns usually feel better descending by default
    return "desc";
  };

  const toggleSort = (key: SortKey) => {
    // if ranking is enabled, clicking any header returns to manual sort
    if (rankingMode !== "none") setRankingMode("none");

    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder(defaultSortOrderFor(key));
    }
  };

  const sortIcon = (key: SortKey) => {
    if (rankingMode !== "none") return null;
    if (sortKey !== key) return null;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 inline-block" />
    );
  };

  // Base dataset used by table + filters:
  // only include investors/fund-groups that ever held >= MIN_ANYTIME_SHARES since IPO date.
  const baseData = useMemo(() => {
    return (data || []).filter((inv) =>
      passesAnytimeMin(inv, MIN_ANYTIME_SHARES)
    );
  }, [data]);

  // Precompute a cheap searchable/indexed view for consistent filtering.
  const indexed = useMemo(() => {
    return (baseData as MonthlyInvestorDataWithPan[]).map((inv) => {
      const key = investorKey(inv);
      const name = clean((inv as any)?.name);
      const pan = clean((inv as any)?.pan);
      const cat = clean(getCategoryDisplay(inv));
      const desc = clean((inv as any)?.description);

      return {
        key,
        inv,
        name,
        pan,
        cat,
        // normalized fields for fast search
        nameN: norm(name),
        panN: norm(pan),
        catN: norm(cat),
        descN: norm(desc),
      };
    });
  }, [baseData]);

  // Build “Filter names” list (stable values). If duplicate names exist, show PAN in text.
  const nameItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of indexed) {
      const n = it.nameN;
      counts.set(n, (counts.get(n) || 0) + 1);
    }

    const items = indexed
      .map((it) => {
        const dup = (counts.get(it.nameN) || 0) > 1;
        const suffix =
          dup && it.pan ? ` (PAN ${it.pan})` : dup ? ` (${it.key})` : "";
        return { value: it.key, text: `${it.name}${suffix}`.trim() };
      })
      .sort((a, b) => a.text.localeCompare(b.text));

    // Ensure uniqueness by value
    const seen = new Set<string>();
    const out: { value: string; text: string }[] = [];
    for (const it of items) {
      if (seen.has(it.value)) continue;
      seen.add(it.value);
      out.push(it);
    }
    return out;
  }, [indexed]);

  const catItems = useMemo(() => {
    const cats = uniq(
      indexed.map((d) => clean(d.cat)).filter((c) => c && c !== "—")
    ).sort((a, b) => a.localeCompare(b));

    // fallback to provided categories if needed
    const merged = uniq([...cats, ...uniq((categories || []) as string[])])
      .map((c) => clean(c))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return merged.map((c) => ({ value: c, text: c }));
  }, [indexed, categories]);

  const dateItems = useMemo(() => {
    return monthsFromIpoAsc.map((m) => ({ value: m, text: monthLabel(m) }));
  }, [monthsFromIpoAsc]);

  // Keep selected filters valid when data changes (prevents “filters look on but nothing shows” after new upload)
  useEffect(() => {
    const validName = new Set(nameItems.map((x) => x.value));
    const validCat = new Set(catItems.map((x) => x.value));
    const validDate = new Set(dateItems.map((x) => x.value));

    setSelectedNames((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const v of prev) if (validName.has(v)) next.add(v);
      return next;
    });

    setSelectedCats((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const v of prev) if (validCat.has(v)) next.add(v);
      return next;
    });

    setSelectedDates((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const v of prev) if (validDate.has(v)) next.add(v);
      return next;
    });
  }, [nameItems, catItems, dateItems]);

  const filteredIndexed = useMemo(() => {
    const q = norm(deferredSearch);

    return indexed.filter((it) => {
      if (q) {
        const ok =
          it.nameN.includes(q) ||
          it.panN.includes(q) ||
          it.catN.includes(q) ||
          it.descN.includes(q);
        if (!ok) return false;
      }

      if (selectedCats.size > 0 && !selectedCats.has(it.cat)) return false;
      if (selectedNames.size > 0 && !selectedNames.has(it.key)) return false;

      return true;
    });
  }, [indexed, deferredSearch, selectedCats, selectedNames]);

  const filteredByKey = useMemo(() => {
    const m = new Map<string, MonthlyInvestorDataWithPan>();
    for (const it of filteredIndexed)
      m.set(it.key, it.inv as MonthlyInvestorDataWithPan);
    return m;
  }, [filteredIndexed]);

  const rows = useMemo(() => {
    const initK = initialKey;
    const latestK = latestKey;
    if (!initK || !latestK) return [];

    return filteredIndexed.map((it) => {
      const inv = it.inv as any;

      const initial = Number(inv?.monthlyShares?.[initK] || 0);
      const latest = Number(inv?.monthlyShares?.[latestK] || 0);
      const netLatest = latest - initial;

      const perDate = selectedDatesAsc.map((k) => {
        const holding = Number(inv?.monthlyShares?.[k] || 0);
        const net = holding - initial;
        return { key: k, holding, net };
      });

      return {
        key: it.key, // stable unique key
        name: it.name,
        category: it.cat || "—",
        initial,
        netLatest,
        latest,
        per: perDate,
      };
    });
  }, [filteredIndexed, initialKey, latestKey, selectedDatesAsc]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];

    // Ranking override (based on netLatest)
    if (rankingMode !== "none") {
      arr.sort((a, b) => {
        const da = Number(a.netLatest || 0);
        const db = Number(b.netLatest || 0);
        return rankingMode === "buyers" ? db - da : da - db;
      });
      return arr;
    }

    const dir = sortOrder === "asc" ? 1 : -1;

    const getNum = (r: any, key: SortKey) => {
      if (key === "initial") return Number(r.initial || 0);
      if (key === "latest") return Number(r.latest || 0);
      if (key === "netLatest") return Number(r.netLatest || 0);

      if (key.startsWith("holding:")) {
        const k = key.slice("holding:".length);
        const found = r.per?.find((x: any) => x.key === k);
        return Number(found?.holding || 0);
      }
      if (key.startsWith("net:")) {
        const k = key.slice("net:".length);
        const found = r.per?.find((x: any) => x.key === k);
        return Number(found?.net || 0);
      }
      return 0;
    };

    arr.sort((a, b) => {
      if (sortKey === "name")
        return dir * String(a.name).localeCompare(String(b.name));
      if (sortKey === "category")
        return dir * String(a.category).localeCompare(String(b.category));

      const av = getNum(a, sortKey);
      const bv = getNum(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    return arr;
  }, [rows, rankingMode, sortKey, sortOrder]);

  const maxAbsNetBoughtSold = useMemo(() => {
    if (!rows.length) return 1;
    let m = 1;
    for (const r of rows) m = Math.max(m, Math.abs(Number(r.netLatest || 0)));
    return m;
  }, [rows]);

  const maxAbsStillHoldingDelta = useMemo(() => {
    if (!rows.length) return 1;
    let m = 1;
    for (const r of rows) {
      const d = Number(r.latest || 0) - Number(r.initial || 0);
      m = Math.max(m, Math.abs(d));
    }
    return m;
  }, [rows]);

  const initialLabel = initialKey ? monthLabel(initialKey) : "-";
  const latestLabel = latestKey ? monthLabel(latestKey) : "-";

  const clearAllFilters = () => {
    setSearch("");
    setSelectedDates(new Set());
    setSelectedCats(new Set());
    setSelectedNames(new Set());
    setRankingMode("none");
    setSortKey("netLatest");
    setSortOrder("desc");
  };

  const totalBase = baseData.length;
  const totalFiltered = rows.length;

  const colCount = 6 + selectedDatesAsc.length * 2; // Name, Category, Initial, (Holding+Net)*N, NetLatest, Latest, Actions

  return (
    <TabsContent value="comparison" className="min-h-0">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comparison Table</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {!initialKey || !latestKey ? (
              <div className="rounded-md border p-4 text-sm">
                <div className="font-medium">No monthly keys available</div>
                <div className="text-muted-foreground mt-1">
                  Upload at least one monthly dataset to enable comparison.
                </div>
              </div>
            ) : (
              <>
                {/* controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    className="w-[320px]"
                    placeholder="Search fund group / investor / PAN / category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />

                  <MultiSelect
                    label="Compare dates"
                    items={dateItems}
                    selected={selectedDates}
                    onChange={setSelectedDates}
                    enableSearch
                    searchPlaceholder="Search dates…"
                  />

                  <MultiSelect
                    label="Filter categories"
                    items={catItems}
                    selected={selectedCats}
                    onChange={setSelectedCats}
                    enableSearch
                    searchPlaceholder="Search categories…"
                    maxHeightClass="max-h-72"
                  />

                  <MultiSelect
                    label="Filter names"
                    items={nameItems}
                    selected={selectedNames}
                    onChange={setSelectedNames}
                    enableSearch
                    searchPlaceholder="Search names / PAN…"
                    maxHeightClass="max-h-72"
                  />

                  <Select
                    value={rankingMode}
                    onValueChange={(v: RankingMode) => setRankingMode(v)}
                  >
                    <SelectTrigger className="w-[190px]">
                      <SelectValue placeholder="Rank by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Rank: None</SelectItem>
                      <SelectItem value="buyers">Rank: Top Buyers</SelectItem>
                      <SelectItem value="sellers">Rank: Top Sellers</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    onClick={clearAllFilters}
                    className="gap-2"
                    title="Clear search + all filters"
                  >
                    <X className="h-4 w-4" />
                    Clear all
                  </Button>

                  <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">Initial: {initialLabel}</Badge>
                    <Badge variant="outline">Latest: {latestLabel}</Badge>
                    <Badge variant="outline">
                      Showing {totalFiltered.toLocaleString()} /{" "}
                      {totalBase.toLocaleString()}
                    </Badge>
                  </div>
                </div>

                {/* table */}
                <div
                  className="w-full max-h-[80vh] overflow-auto bg-white rounded-lg shadow border"
                  style={{
                    scrollbarColor: "rgba(107,114,128,1) rgba(229,231,235,1)",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <table className="min-w-full table-fixed border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th
                          className="sticky top-0 left-0 z-50 bg-white px-3 py-2 text-left border border-gray-200 whitespace-nowrap cursor-pointer"
                          onClick={() => toggleSort("name")}
                        >
                          Fund Group / Investor Name {sortIcon("name")}
                        </th>

                        <th
                          className="sticky top-0 z-40 bg-white px-3 py-2 text-left border border-gray-200 whitespace-nowrap cursor-pointer"
                          onClick={() => toggleSort("category")}
                        >
                          Category {sortIcon("category")}
                        </th>

                        <th
                          className="sticky top-0 z-40 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                          onClick={() => toggleSort("initial")}
                        >
                          Initial Holding (as on Sep 3 2024){" "}
                          {sortIcon("initial")}
                        </th>

                        {selectedDatesAsc.map((d) => (
                          <React.Fragment key={d}>
                            <th
                              className="sticky top-0 z-40 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                              onClick={() => toggleSort(`holding:${d}`)}
                            >
                              Holding ({monthLabel(d)}){" "}
                              {sortIcon(`holding:${d}`)}
                            </th>
                            <th
                              className="sticky top-0 z-40 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                              onClick={() => toggleSort(`net:${d}`)}
                            >
                              Net (vs Initial) {sortIcon(`net:${d}`)}
                            </th>
                          </React.Fragment>
                        ))}

                        <th
                          className="sticky top-0 z-40 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                          onClick={() => toggleSort("netLatest")}
                        >
                          Net Bought/Sold {sortIcon("netLatest")}
                        </th>

                        <th
                          className="sticky top-0 z-40 bg-white px-3 py-2 text-right border border-gray-200 whitespace-nowrap cursor-pointer"
                          onClick={() => toggleSort("latest")}
                        >
                          Still Holding (latest upload) {sortIcon("latest")}
                        </th>

                        <th className="sticky top-0 z-40 bg-white px-3 py-2 text-center border border-gray-200 whitespace-nowrap">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {sortedRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={colCount}
                            className="h-24 text-center border border-gray-200"
                          >
                            No matching rows.
                          </td>
                        </tr>
                      ) : (
                        sortedRows.map((r) => {
                          const net = r.netLatest;
                          const netText =
                            net === 0
                              ? "0"
                              : net > 0
                              ? `+${net.toLocaleString()}`
                              : net.toLocaleString();

                          const invObj = filteredByKey.get(r.key);
                          const isGroup =
                            !!(invObj as any)?.individualInvestors &&
                            (invObj as any).individualInvestors.length > 1;

                          return (
                            <tr key={r.key}>
                              <th
                                className="sticky left-0 z-30 bg-white px-3 py-2 text-left border border-gray-200 font-medium whitespace-normal break-words"
                                scope="row"
                              >
                                <div className="flex items-center gap-2">
                                  <span>{r.name}</span>

                                  {invObj && isGroup && (
                                    <GroupSplitDialog
                                      investor={invObj}
                                      initialKey={initialKey}
                                      latestKey={latestKey}
                                      selectedDatesAsc={selectedDatesAsc}
                                    />
                                  )}
                                </div>
                              </th>

                              <td className="px-3 py-2 border border-gray-200">
                                <Badge variant="outline">{r.category}</Badge>
                              </td>

                              <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                                {r.initial.toLocaleString()}
                              </td>

                              {selectedDatesAsc.map((d) => {
                                const found = r.per.find((x) => x.key === d);
                                const holding = found?.holding ?? 0;
                                const netD = found?.net ?? 0;
                                const netDText =
                                  netD === 0
                                    ? "0"
                                    : netD > 0
                                    ? `+${netD.toLocaleString()}`
                                    : netD.toLocaleString();

                                return (
                                  <React.Fragment key={d}>
                                    <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                                      {holding.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 border border-gray-200 text-right tabular-nums">
                                      {netDText}
                                    </td>
                                  </React.Fragment>
                                );
                              })}

                              {(() => {
                                const t = tintForDelta(
                                  net,
                                  maxAbsNetBoughtSold
                                );
                                return (
                                  <td
                                    className="px-3 py-2 border border-gray-200 text-right tabular-nums font-medium"
                                    style={{
                                      backgroundColor: t.bg,
                                      color: t.fg,
                                    }}
                                  >
                                    {netText}
                                  </td>
                                );
                              })()}

                              {(() => {
                                const delta = r.latest - r.initial;
                                const t = tintForDelta(
                                  delta,
                                  maxAbsStillHoldingDelta
                                );
                                const deltaText =
                                  delta === 0
                                    ? "0"
                                    : delta > 0
                                    ? `+${delta.toLocaleString()}`
                                    : delta.toLocaleString();

                                return (
                                  <td
                                    className="px-3 py-2 border border-gray-200 text-right tabular-nums font-medium"
                                    style={{
                                      backgroundColor: t.bg,
                                      color: t.fg,
                                    }}
                                    title={`Δ vs initial: ${deltaText}`}
                                  >
                                    {r.latest.toLocaleString()}
                                  </td>
                                );
                              })()}

                              <td className="px-3 py-2 border border-gray-200 text-center">
                                {invObj ? (
                                  <RowAllDatesDialog
                                    investor={invObj}
                                    monthsFromIpoAsc={monthsFromIpoAsc}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-muted-foreground">
                  Notes: Showing only investors/fund-groups that ever held at
                  least <strong>{MIN_ANYTIME_SHARES.toLocaleString()}</strong>{" "}
                  shares since <strong>{IPO_START_ISO}</strong>. “Initial
                  Holding” uses <strong>{initialKey}</strong> (or first
                  available date on/after IPO).
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
