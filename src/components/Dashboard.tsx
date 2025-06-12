
import { useState, useEffect } from "react";
import { filterInvestors, generateAnalyticsSummary, getInvestorsData, getUniqueCategories, getUniqueFundGroups, analyzeInvestorBehavior, filterInvestorsByConditions } from "@/utils/dataUtils";
import { Investor, FilterOptions, InvestorComparison } from "@/types";
import FileUpload from "./FileUpload";
import InvestorTable from "./InvestorTable";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const [allInvestors, setAllInvestors] = useState<Investor[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investorComparisons, setInvestorComparisons] = useState<InvestorComparison[]>([]);
  const [filteredInvestors, setFilteredInvestors] = useState<Investor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [fundGroups, setFundGroups] = useState<string[]>([]);
  const [excludePromoters, setExcludePromoters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    category: null,
    sortBy: "name",
    sortOrder: "asc",
    searchQuery: "",
    fundGroup: null,
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  // On component mount, check for data in localStorage
  useEffect(() => {
    console.log("Dashboard mount - checking for saved data");
    const savedData = getInvestorsData();
    console.log("Found saved data:", savedData.length, "records");
    if (savedData.length > 0) {
      setAllInvestors(savedData);
      setDataLoaded(true);
    }
  }, []);

  // Apply filtering conditions when allInvestors or excludePromoters changes
  useEffect(() => {
    if (allInvestors.length > 0) {
      const filteredByConditions = filterInvestorsByConditions(allInvestors, 20000, excludePromoters);
      console.log(`Filtered from ${allInvestors.length} to ${filteredByConditions.length} investors (min 20k shares, exclude promoters: ${excludePromoters})`);
      setInvestors(filteredByConditions);
    }
  }, [allInvestors, excludePromoters]);

  // When investors data changes, update categories, fund groups, and filtered results
  useEffect(() => {
    console.log("Investors data changed:", investors.length, "records");
    if (investors.length > 0) {
      const uniqueCategories = getUniqueCategories(investors);
      const uniqueFundGroups = getUniqueFundGroups(investors);
      setCategories(uniqueCategories);
      setFundGroups(uniqueFundGroups);
      
      const filtered = filterInvestors(investors, filters);
      setFilteredInvestors(filtered);

      // Generate investor behavior analysis
      const comparisons = analyzeInvestorBehavior(investors);
      setInvestorComparisons(comparisons);
      
      console.log("Updated dashboard state - categories:", uniqueCategories.length, "fundGroups:", uniqueFundGroups.length);
    } else {
      setCategories([]);
      setFundGroups([]);
      setFilteredInvestors([]);
      setInvestorComparisons([]);
    }
  }, [investors, filters]);

  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleDataLoaded = () => {
    console.log("handleDataLoaded called - refreshing data");
    // Force a refresh by re-reading from localStorage
    const savedData = getInvestorsData();
    console.log("Refreshed data:", savedData.length, "records");
    setAllInvestors(savedData);
    setDataLoaded(true);
  };

  // Generate analytics summary
  const analyticsSummary = generateAnalyticsSummary(investors);

  return (
    <div className="space-y-8">
      {!dataLoaded ? (
        <FileUpload onDataLoaded={handleDataLoaded} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Investor Behavior Analytics</h1>
              <p className="text-muted-foreground">
                Analysis of investor behavior and position changes over time (Min 20,000 shares)
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Card className="p-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="exclude-promoters"
                    checked={excludePromoters}
                    onCheckedChange={setExcludePromoters}
                  />
                  <Label htmlFor="exclude-promoters">Exclude Promoters</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Filter out promoter category investors
                </p>
              </Card>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div>
          </div>

          <AnalyticsSummary summary={analyticsSummary} />

          {/* New sentiment and behavior analysis */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <InvestorSentimentChart investors={investors} />
            <TopMoversChart investors={investors} />
          </div>

          {investorComparisons.length > 0 && (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <BehaviorAnalysisChart comparisons={investorComparisons} />
              <FundGroupChart comparisons={investorComparisons} />
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <NetPositionChart investors={investors} />
            <CategoryDistribution investors={investors} />
            <VolumeAnalysisChart investors={investors} />
          </div>
          
          <TrendAnalysis investors={investors} />
          
          <InvestorTrendChart investors={investors} />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Investor Data</h2>
            <InvestorTable
              investors={filteredInvestors}
              categories={categories}
              fundGroups={fundGroups}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
