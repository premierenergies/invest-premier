import React, { useState, useEffect, useMemo } from "react";
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
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Base-URL helper                                                    */
/* ------------------------------------------------------------------ */
function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin;
}
const API = `${apiBase()}/api`;

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

export default function Dashboard() {
  const [monthlyData, setMonthlyData] = useState<MonthlyInvestorData[]>([]);
  const [isGrouped, setIsGrouped] = useState(true);

  const load = () =>
    axios
      .get<MonthlyInvestorData[]>(`${API}/monthly`)
      .then((r) => setMonthlyData(r.data))
      .catch((e) => console.error("Error fetching monthly:", e));
  useEffect(load, []);

  const displayData = useMemo(
    () => (isGrouped ? groupInvestorsByFund(monthlyData) : monthlyData),
    [monthlyData, isGrouped]
  );

  const availableMonths = useMemo(
    () =>
      Array.from(
        new Set(displayData.flatMap((i) => Object.keys(i.monthlyShares)))
      ).sort(),
    [displayData]
  );

  const categories = useMemo(
    () => Array.from(new Set(displayData.map((i) => i.category))),
    [displayData]
  );

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

  const onLogout = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = "/login";
  };

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
          <CardContent className="flex justify-center">
            <div className="w-full max-w-xs">
              <MonthlyFileUpload onDataLoaded={load} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Monthly analysis across {availableMonths.length} months (
            {getUniqueInvestorCount(displayData)} unique investors
            {isGrouped ? "/fund groups" : ""})
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="group-investors"
              checked={isGrouped}
              onCheckedChange={(checked) => setIsGrouped(Boolean(checked))}
            />

            <Label htmlFor="group-investors">Group by fund</Label>
          </div>
          <div className="w-full sm:w-auto">
            <MonthlyFileUpload onDataLoaded={load} />
          </div>
          <Button
            className="bg-red-500 text-white"
            variant="outline"
            onClick={onLogout}
          >
            Logout
          </Button>
        </div>
      </div>

      {/* tabs */}
      {/* tabs */}
      <Tabs defaultValue="table">
        <TabsList className="overflow-x-auto whitespace-nowrap">
          <TabsTrigger value="table">Data Table</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="trends">Monthly Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="min-h-0">
          <div className="overflow-visible min-h-0">
            <MonthlyDataTable
              key={isGrouped ? "grouped" : "ungrouped"}
              data={displayData}
              availableMonths={availableMonths}
              categories={categories}
            />
          </div>
        </TabsContent>

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
                <div className="col-span-full w-full">
                  <TopMoversChart
                    data={displayData}
                    availableMonths={availableMonths}
                    categories={categories}
                  />
                </div>
              </div>
              {legacyComparisons.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2" />
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                <CategoryDistribution investors={legacyInvestors} />
              </div>
              <CategoryTimelineChart
                data={displayData}
                availableMonths={availableMonths}
                categories={categories}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="trends">
          <MonthlyTrendChart
            data={displayData}
            availableMonths={availableMonths}
            categories={categories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
