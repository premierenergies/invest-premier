// src/components/Dashboard.tsx
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  filterInvestors,
  generateAnalyticsSummary,
  analyzeInvestorBehavior,
  filterInvestorsByConditions,
  getUniqueCategories,
  getUniqueFundGroups,
} from "@/utils/dataUtils";
import { getUniqueInvestorCount } from "@/utils/investorUtils";
import {
  Investor,
  FilterOptions,
  InvestorComparison,
  MonthlyInvestorData,
} from "@/types";
import MonthlyFileUpload from "./MonthlyFileUpload";
import MonthlyDataTable from "./MonthlyDataTable";
import AnalyticsSummary from "./AnalyticsSummary";
import CategoryDistribution from "./charts/CategoryDistribution";
import TrendAnalysis from "./charts/TrendAnalysis";
import InvestorTrendChart from "./charts/InvestorTrendChart";
import TopMoversChart from "./charts/TopMoversChart";
import MonthlyTrendChart from "./charts/MonthlyTrendChart";
import CategoryTimelineChart from "./charts/CategoryTimelineChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/* Base-URL helper                                                    */
/* ------------------------------------------------------------------ */

/**
 * 1.  If VITE_API_URL is provided            → use it
 * 2.  Else (production build)                → window.location.origin
 * 3.  Else (Vite dev server - localhost)     → http://localhost:5000
 */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;

  // `import.meta.env.DEV` is true only under `npm run dev`
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin; // production — same origin
}
const API = `${apiBase()}/api`;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fundGroupOf(name: string): string {
  const w = name.trim().split(" ").filter(Boolean);
  return ((w[0] || "") + (w[1] ? " " + w[1] : "")).toUpperCase();
}
function groupInvestorsByFund(
  data: MonthlyInvestorData[]
): MonthlyInvestorData[] {
  const map = new Map<string, MonthlyInvestorData>();

  for (const inv of data) {
    const fg = inv.fundGroup || fundGroupOf(inv.name);
    if (!map.has(fg)) {
      map.set(fg, {
        name: fg,
        category: inv.category,
        description: "Grouped fund",
        fundGroup: fg,
        monthlyShares: {},
        individualInvestors: [],
      });
    }
    const grp = map.get(fg)!;
    grp.individualInvestors!.push(inv);

    for (const m in inv.monthlyShares) {
      grp.monthlyShares[m] = (grp.monthlyShares[m] || 0) + inv.monthlyShares[m];
    }
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  /* ----------------------------- state ---------------------------- */
  const [monthlyData, setMonthlyData] = useState<MonthlyInvestorData[]>([]);
  const [isGrouped, setIsGrouped] = useState(true);

  /* --------------------------- fetch ------------------------------ */
  const load = () =>
    axios
      .get<MonthlyInvestorData[]>(`${API}/monthly`)
      .then((r) => setMonthlyData(r.data))
      .catch((e) => console.error("Error fetching monthly:", e));

  useEffect(load, []);

  /* ---------------------- derived values -------------------------- */
  const displayData = useMemo(
    () => (isGrouped ? groupInvestorsByFund(monthlyData) : monthlyData),
    [monthlyData, isGrouped]
  );

  const availableMonths = useMemo(() => {
    return Array.from(
      new Set(displayData.flatMap((i) => Object.keys(i.monthlyShares)))
    ).sort();
  }, [displayData]);

  const categories = useMemo(() => {
    return Array.from(new Set(displayData.map((i) => i.category)));
  }, [displayData]);

  /* ---------------- legacy analytics conversion ------------------ */
  const legacyInvestors: Investor[] = displayData.map((inv) => {
    const ms = Object.keys(inv.monthlyShares).sort();
    const start = inv.monthlyShares[ms[0]] || 0;
    const end = inv.monthlyShares[ms[ms.length - 1]] || 0;
    return {
      name: inv.name,
      boughtOn18: Math.max(0, end - start),
      soldOn25: Math.max(0, start - end),
      percentToEquity: 0,
      category: inv.category,
      netChange: end - start,
      fundGroup: inv.fundGroup,
      startPosition: start,
      endPosition: end,
    };
  });

  const legacySummary = generateAnalyticsSummary(legacyInvestors);
  const legacyComparisons = analyzeInvestorBehavior(legacyInvestors);

  /* ------------------------------ UI ----------------------------- */
  if (displayData.length === 0) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Upload your monthly investor data to get started
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Upload Monthly Data</CardTitle>
            <CardDescription>
              Excel columns: NAME, SHARES AS ON {"{DATE}"}, CATEGORY
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyFileUpload onDataLoaded={load} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Monthly analysis across {availableMonths.length} months (
            {getUniqueInvestorCount(displayData)} unique investors
            {isGrouped ? "/fund groups" : ""})
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="group-investors"
              checked={isGrouped}
              onCheckedChange={setIsGrouped}
            />
            <Label htmlFor="group-investors">Group by fund</Label>
          </div>
          <MonthlyFileUpload onDataLoaded={load} />
        </div>
      </div>

      {/* tabs */}
      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Monthly Trends</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="table">Data Table</TabsTrigger>
        </TabsList>

        {/* trends */}
        <TabsContent value="trends">
          <MonthlyTrendChart
            data={displayData}
            availableMonths={availableMonths}
            categories={categories}
          />
        </TabsContent>

        {/* analytics */}
        <TabsContent value="analytics" className="space-y-6">
          {availableMonths.length < 2 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Upload at least 2 months of data to see analytics charts
              </CardContent>
            </Card>
          ) : (
            <>
              <AnalyticsSummary summary={legacySummary} />
              <div className="grid gap-4 lg:grid-cols-2">
                {/* <InvestorSentimentChart investors={legacyInvestors} /> */}
                <div className="col-span-full w-full">
                  <TopMoversChart
                    data={displayData}
                    availableMonths={availableMonths}
                    categories={categories}
                  />
                </div>
              </div>
              {legacyComparisons.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* <BehaviorAnalysisChart comparisons={legacyComparisons} /> */}
                  {/* <FundGroupChart comparisons={legacyComparisons} /> */}
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* <NetPositionChart investors={legacyInvestors} /> */}
                <CategoryDistribution investors={legacyInvestors} />
                {/* <VolumeAnalysisChart investors={legacyInvestors} /> */}
              </div>
              {/*<TrendAnalysis investors={legacyInvestors} />
              <InvestorTrendChart investors={legacyInvestors} />*/}
              {/* Shares‑by‑Category timeline chart, at the bottom */}
              <CategoryTimelineChart
                data={displayData}
                availableMonths={availableMonths}
                categories={categories}
              />
            </>
          )}
        </TabsContent>

        {/* table */}
        <TabsContent value="table">
          <MonthlyDataTable
            data={displayData}
            availableMonths={availableMonths}
            categories={categories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
