// src/components/Dashboard.tsx
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  filterInvestors,
  generateAnalyticsSummary,
  analyzeInvestorBehavior,
  filterInvestorsByConditions
} from "@/utils/dataUtils";
import {
  getUniqueCategories,
  getUniqueFundGroups
} from "@/utils/dataUtils";
import { getUniqueInvestorCount } from "@/utils/investorUtils";
import {
  Investor,
  FilterOptions,
  InvestorComparison,
  MonthlyInvestorData
} from "@/types";
import MonthlyFileUpload from "./MonthlyFileUpload";
import MonthlyDataTable from "./MonthlyDataTable";
import AnalyticsSummary from "./AnalyticsSummary";
import NetPositionChart from "./charts/NetPositionChart";
import CategoryDistribution from "./charts/CategoryDistribution";
import TrendAnalysis from "./charts/TrendAnalysis";
import InvestorTrendChart from "./charts/InvestorTrendChart";
import BehaviorAnalysisChart from "./charts/BehaviorAnalysisChart";
import FundGroupChart from "./charts/FundGroupChart";
import InvestorSentimentChart from "./charts/InvestorSentimentChart";
import TopMoversChart from "./charts/TopMoversChart";
import VolumeAnalysisChart from "./charts/VolumeAnalysisChart";
import MonthlyTrendChart from "./charts/MonthlyTrendChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/* Environment                                                        */
/* ------------------------------------------------------------------ */

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive fund-group = first two words upper-cased */
function fundGroupOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.slice(0, 2).join(" ").toUpperCase();
}

/** Group investors that share identical fundGroup */
function groupInvestorsByFund(data: MonthlyInvestorData[]): MonthlyInvestorData[] {
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
        individualInvestors: []
      });
    }

    const grp = map.get(fg)!;
    grp.individualInvestors!.push(inv);

    // merge monthly shares
    for (const [month, shares] of Object.entries(inv.monthlyShares)) {
      grp.monthlyShares[month] = (grp.monthlyShares[month] || 0) + shares;
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
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [monthlyCategories, setMonthlyCategories] = useState<string[]>([]);
  const [isGrouped, setIsGrouped] = useState(true);

  /* --------------------------- data fetch ------------------------- */

  useEffect(() => {
    axios
      .get<MonthlyInvestorData[]>(`${API}/monthly`)
      .then((res) => setMonthlyData(res.data))
      .catch((err) => console.error("Error fetching monthly:", err));
  }, []);

  /* ---------------------- derived / memoized ---------------------- */

  const displayMonthlyData = useMemo(
    () => (isGrouped ? groupInvestorsByFund(monthlyData) : monthlyData),
    [monthlyData, isGrouped]
  );

  const months = useMemo(() => {
    return Array.from(
      new Set(displayMonthlyData.flatMap((i) => Object.keys(i.monthlyShares)))
    ).sort();
  }, [displayMonthlyData]);

  const categories = useMemo(() => {
    return Array.from(new Set(displayMonthlyData.map((i) => i.category)));
  }, [displayMonthlyData]);

  /* ------------------------ reload helper ------------------------- */

  const reloadMonthly = () => {
    axios
      .get<MonthlyInvestorData[]>(`${API}/monthly`)
      .then((res) => setMonthlyData(res.data))
      .catch((err) => console.error("Error reloading monthly:", err));
  };

  /* ----------------------------- UI ------------------------------ */

  if (displayMonthlyData.length === 0) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Investor Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Upload your monthly investor data to get started
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Monthly Data</CardTitle>
            <CardDescription>
              Excel file with columns: NAME, SHARES AS ON {"{DATE}"}, CATEGORY
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyFileUpload onDataLoaded={reloadMonthly} />
          </CardContent>
        </Card>
      </div>
    );
  }

  /* --------------- convert for legacy analytics panels ------------ */

  const legacyInvestors: Investor[] = displayMonthlyData.map((inv) => {
    const m = Object.keys(inv.monthlyShares).sort();
    const start = inv.monthlyShares[m[0]] || 0;
    const end = inv.monthlyShares[m[m.length - 1]] || 0;
    return {
      name: inv.name,
      boughtOn18: Math.max(0, end - start),
      soldOn25: Math.max(0, start - end),
      percentToEquity: 0,
      category: inv.category,
      netChange: end - start,
      fundGroup: inv.fundGroup,
      startPosition: start,
      endPosition: end
    };
  });

  const legacySummary = generateAnalyticsSummary(legacyInvestors);
  const legacyComparisons = analyzeInvestorBehavior(legacyInvestors);

  /* ----------------------------- render --------------------------- */

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Investor Analytics Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monthly analysis across {months.length} months (
            {getUniqueInvestorCount(displayMonthlyData)} unique investors
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
          <MonthlyFileUpload onDataLoaded={reloadMonthly} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="trends" className="w-full">
        <TabsList>
          <TabsTrigger value="trends">Monthly Trends</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="table">Data Table</TabsTrigger>
        </TabsList>

        {/* --- Trends --- */}
        <TabsContent value="trends" className="space-y-6">
          <MonthlyTrendChart
            data={displayMonthlyData}
            availableMonths={months}
            categories={categories}
          />
        </TabsContent>

        {/* --- Analytics --- */}
        <TabsContent value="analytics" className="space-y-6">
          {months.length < 2 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-center text-muted-foreground">
                  Upload at least 2 months of data to see analytics charts
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <AnalyticsSummary summary={legacySummary} />

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <InvestorSentimentChart investors={legacyInvestors} />
                <TopMoversChart investors={legacyInvestors} />
              </div>

              {legacyComparisons.length > 0 && (
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                  <BehaviorAnalysisChart comparisons={legacyComparisons} />
                  <FundGroupChart comparisons={legacyComparisons} />
                </div>
              )}

              <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <NetPositionChart investors={legacyInvestors} />
                <CategoryDistribution investors={legacyInvestors} />
                <VolumeAnalysisChart investors={legacyInvestors} />
              </div>

              <TrendAnalysis investors={legacyInvestors} />
              <InvestorTrendChart investors={legacyInvestors} />
            </>
          )}
        </TabsContent>

        {/* --- Table --- */}
        <TabsContent value="table" className="space-y-6">
          <MonthlyDataTable
            data={displayMonthlyData}
            availableMonths={months}
            categories={categories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
