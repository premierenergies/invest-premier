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

  // Check for monthly data on mount with async support
  useEffect(() => {
    const loadMonthlyData = async () => {
      console.log("Dashboard mount - checking for monthly data");
      try {
        const savedMonthlyData = await getMonthlyCSVData();
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
      } catch (error) {
        console.error('Error loading monthly data:', error);
      }
    };
    
    loadMonthlyData();
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

  const handleMonthlyDataLoaded = async () => {
    console.log("handleMonthlyDataLoaded called - refreshing monthly data");
    try {
      const savedMonthlyData = await getMonthlyCSVData();
      const months = getAvailableMonths();
      console.log("Refreshed monthly data:", savedMonthlyData.length, "records,", months.length, "months");
      
      setMonthlyData(savedMonthlyData);
      setAvailableMonths(months);
      setMonthlyDataLoaded(true);
      
      const uniqueCategories = [...new Set(savedMonthlyData.map(inv => inv.category))];
      setMonthlyCategories(uniqueCategories);
    } catch (error) {
      console.error('Error refreshing monthly data:', error);
    }
  };

  // Generate analytics summary for legacy data
  const analyticsSummary = generateAnalyticsSummary(investors);

  // Show initial upload screen if no data is loaded
  if (!monthlyDataLoaded) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Upload your monthly investor data to get started
          </p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Upload Monthly Data</CardTitle>
            <CardDescription>
              Upload Excel files with monthly investor data. Each file should contain: NAME, SHARES AS ON [date], CATEGORY, DESCRIPTION
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyFileUpload onDataLoaded={handleMonthlyDataLoaded} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investor Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Monthly analysis across {availableMonths.length} months ({monthlyData.length} investors/fund groups)
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <MonthlyFileUpload onDataLoaded={handleMonthlyDataLoaded} />
        </div>
      </div>

      <Tabs defaultValue="trends" className="w-full">
        <TabsList>
          <TabsTrigger value="trends">Monthly Trends</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="table">Data Table</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trends" className="space-y-6">
          <MonthlyTrendChart 
            data={monthlyData} 
            availableMonths={availableMonths}
            categories={monthlyCategories}
          />
        </TabsContent>
        
        <TabsContent value="analytics" className="space-y-6">
          {/* Convert monthly data to legacy format for charts */}
          {(() => {
            if (availableMonths.length < 2) {
              return (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-center text-muted-foreground">
                      Upload at least 2 months of data to see analytics charts
                    </p>
                  </CardContent>
                </Card>
              );
            }

            // Convert monthly data to legacy format for existing charts
            const legacyInvestors: Investor[] = monthlyData.map(investor => {
              const months = Object.keys(investor.monthlyShares).sort();
              const firstMonth = months[0];
              const lastMonth = months[months.length - 1];
              
              const startShares = investor.monthlyShares[firstMonth] || 0;
              const endShares = investor.monthlyShares[lastMonth] || 0;
              
              return {
                name: investor.name,
                boughtOn18: Math.max(0, endShares - startShares),
                soldOn25: Math.max(0, startShares - endShares),
                percentToEquity: 0, // Calculate if needed
                category: investor.category,
                netChange: endShares - startShares,
                fundGroup: investor.fundGroup,
                startPosition: startShares,
                endPosition: endShares,
              };
            });

            const legacyComparisons = analyzeInvestorBehavior(legacyInvestors);
            const legacySummary = generateAnalyticsSummary(legacyInvestors);

            return (
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
            );
          })()}
        </TabsContent>
        
        <TabsContent value="table" className="space-y-6">
          <MonthlyDataTable 
            data={monthlyData}
            availableMonths={availableMonths}
            categories={monthlyCategories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
