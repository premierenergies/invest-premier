
import { useState, useEffect } from "react";
import { filterInvestors, generateAnalyticsSummary, getInvestorsData, getUniqueCategories, getUniqueFundGroups, analyzeInvestorBehavior, filterInvestorsByConditions } from "@/utils/dataUtils";
import { getMonthlyCSVData, getAvailableMonths, filterMonthlyData } from "@/utils/csvUtils";
import { Investor, FilterOptions, InvestorComparison, MonthlyInvestorData } from "@/types";
import FileUpload from "./FileUpload";
import MonthlyFileUpload from "./MonthlyFileUpload";
import InvestorTable from "./InvestorTable";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Dashboard() {
  // Legacy data state
  const [allInvestors, setAllInvestors] = useState<Investor[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investorComparisons, setInvestorComparisons] = useState<InvestorComparison[]>([]);
  const [filteredInvestors, setFilteredInvestors] = useState<Investor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [fundGroups, setFundGroups] = useState<string[]>([]);
  const [excludePromoters, setExcludePromoters] = useState(false);
  
  // Monthly data state
  const [monthlyData, setMonthlyData] = useState<MonthlyInvestorData[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [monthlyCategories, setMonthlyCategories] = useState<string[]>([]);
  
  const [filters, setFilters] = useState<FilterOptions>({
    category: null,
    sortBy: "name",
    sortOrder: "asc",
    searchQuery: "",
    fundGroup: null,
  });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [monthlyDataLoaded, setMonthlyDataLoaded] = useState(false);

  // Check for legacy data on mount
  useEffect(() => {
    console.log("Dashboard mount - checking for saved data");
    const savedData = getInvestorsData();
    console.log("Found saved data:", savedData.length, "records");
    if (savedData.length > 0) {
      setAllInvestors(savedData);
      setDataLoaded(true);
    }
  }, []);

  // Check for monthly data on mount
  useEffect(() => {
    console.log("Dashboard mount - checking for monthly data");
    const savedMonthlyData = getMonthlyCSVData();
    const months = getAvailableMonths();
    console.log("Found monthly data:", savedMonthlyData.length, "records,", months.length, "months");
    
    if (savedMonthlyData.length > 0) {
      setMonthlyData(savedMonthlyData);
      setAvailableMonths(months);
      setMonthlyDataLoaded(true);
      
      // Extract categories from monthly data
      const uniqueCategories = [...new Set(savedMonthlyData.map(inv => inv.category))];
      setMonthlyCategories(uniqueCategories);
    }
  }, []);

  // Apply filtering conditions for legacy data
  useEffect(() => {
    if (allInvestors.length > 0) {
      const filteredByConditions = filterInvestorsByConditions(allInvestors, 20000, excludePromoters);
      console.log(`Filtered from ${allInvestors.length} to ${filteredByConditions.length} investors (min 20k shares, exclude promoters: ${excludePromoters})`);
      setInvestors(filteredByConditions);
    }
  }, [allInvestors, excludePromoters]);

  // Update legacy data when investors change
  useEffect(() => {
    console.log("Investors data changed:", investors.length, "records");
    if (investors.length > 0) {
      const uniqueCategories = getUniqueCategories(investors);
      const uniqueFundGroups = getUniqueFundGroups(investors);
      setCategories(uniqueCategories);
      setFundGroups(uniqueFundGroups);
      
      const filtered = filterInvestors(investors, filters);
      setFilteredInvestors(filtered);

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
    const savedData = getInvestorsData();
    console.log("Refreshed data:", savedData.length, "records");
    setAllInvestors(savedData);
    setDataLoaded(true);
  };

  const handleMonthlyDataLoaded = () => {
    console.log("handleMonthlyDataLoaded called - refreshing monthly data");
    const savedMonthlyData = getMonthlyCSVData();
    const months = getAvailableMonths();
    console.log("Refreshed monthly data:", savedMonthlyData.length, "records,", months.length, "months");
    
    setMonthlyData(savedMonthlyData);
    setAvailableMonths(months);
    setMonthlyDataLoaded(true);
    
    const uniqueCategories = [...new Set(savedMonthlyData.map(inv => inv.category))];
    setMonthlyCategories(uniqueCategories);
  };

  // Generate analytics summary for legacy data
  const analyticsSummary = generateAnalyticsSummary(investors);

  // Show initial upload screen if no data is loaded
  if (!dataLoaded && !monthlyDataLoaded) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Choose your data format to get started
          </p>
        </div>
        
        <Tabs defaultValue="monthly" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly Data (New)</TabsTrigger>
            <TabsTrigger value="legacy">Legacy Format</TabsTrigger>
          </TabsList>
          
          <TabsContent value="monthly" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload Monthly Data</CardTitle>
                <CardDescription>
                  Upload Excel files with monthly investor data. Each file should contain: NAME, SHARES on {date}, CATEGORY, DESCRIPTION
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MonthlyFileUpload onDataLoaded={handleMonthlyDataLoaded} />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="legacy" className="space-y-4">
            <FileUpload onDataLoaded={handleDataLoaded} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            {monthlyDataLoaded 
              ? `Monthly analysis across ${availableMonths.length} months (${monthlyData.length} investors)`
              : `Legacy analysis (Min 20,000 shares, ${investors.length} investors)`
            }
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {dataLoaded && (
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
          )}
          <MonthlyFileUpload onDataLoaded={handleMonthlyDataLoaded} />
          {dataLoaded && <FileUpload onDataLoaded={handleDataLoaded} />}
        </div>
      </div>

      {monthlyDataLoaded && (
        <Tabs defaultValue="monthly" className="w-full">
          <TabsList>
            <TabsTrigger value="monthly">Monthly Trends</TabsTrigger>
            <TabsTrigger value="table">Data Table</TabsTrigger>
            {dataLoaded && <TabsTrigger value="legacy">Legacy Analysis</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="monthly" className="space-y-6">
            <MonthlyTrendChart 
              data={monthlyData} 
              availableMonths={availableMonths}
              categories={monthlyCategories}
            />
          </TabsContent>
          
          <TabsContent value="table" className="space-y-6">
            <MonthlyDataTable 
              data={monthlyData}
              availableMonths={availableMonths}
              categories={monthlyCategories}
            />
          </TabsContent>
          
          {dataLoaded && (
            <TabsContent value="legacy" className="space-y-6">
              {/* Legacy analysis content */}
              <AnalyticsSummary summary={analyticsSummary} />

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
            </TabsContent>
          )}
        </Tabs>
      )}

      {!monthlyDataLoaded && dataLoaded && (
        <>
          <AnalyticsSummary summary={analyticsSummary} />

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
