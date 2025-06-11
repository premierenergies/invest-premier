
import { useState, useEffect } from "react";
import { filterInvestors, generateAnalyticsSummary, getInvestorsData, getUniqueCategories, getUniqueFundGroups, analyzeInvestorBehavior } from "@/utils/dataUtils";
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

export default function Dashboard() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investorComparisons, setInvestorComparisons] = useState<InvestorComparison[]>([]);
  const [filteredInvestors, setFilteredInvestors] = useState<Investor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [fundGroups, setFundGroups] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    category: null,
    sortBy: "name",
    sortOrder: "asc",
    searchQuery: "",
    fundGroup: null,
  });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // On component mount, check for data in localStorage
  useEffect(() => {
    const savedData = getInvestorsData();
    if (savedData.length > 0) {
      setInvestors(savedData);
      setDataLoaded(true);
    }
  }, [refreshKey]); // Add refreshKey as dependency to trigger re-check

  // When investors data changes, update categories, fund groups, and filtered results
  useEffect(() => {
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
    // Force a refresh by incrementing the key and updating state
    setRefreshKey(prev => prev + 1);
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
                Analysis of investor behavior and position changes over time
              </p>
            </div>
            <FileUpload onDataLoaded={handleDataLoaded} />
          </div>

          <AnalyticsSummary summary={analyticsSummary} />

          {investorComparisons.length > 0 && (
            <>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <BehaviorAnalysisChart comparisons={investorComparisons} />
                <FundGroupChart comparisons={investorComparisons} />
              </div>
            </>
          )}

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <NetPositionChart investors={investors} />
            <CategoryDistribution investors={investors} />
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
