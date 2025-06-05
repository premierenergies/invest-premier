
import { useState, useEffect } from "react";
import { filterInvestors, generateAnalyticsSummary, getInvestorsData, getUniqueCategories, getUniqueFundGroups, compareInvestorBehavior } from "@/utils/dataUtils";
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
  const [month1Investors, setMonth1Investors] = useState<Investor[]>([]);
  const [month2Investors, setMonth2Investors] = useState<Investor[]>([]);
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

  // On component mount, check for data in localStorage
  useEffect(() => {
    const savedData = getInvestorsData();
    if (savedData.month1.length > 0 || savedData.month2.length > 0) {
      setMonth1Investors(savedData.month1);
      setMonth2Investors(savedData.month2);
      setDataLoaded(true);
    }
  }, []);

  // When investors data changes, update categories, fund groups, and filtered results
  useEffect(() => {
    const allInvestors = [...month1Investors, ...month2Investors];
    if (allInvestors.length > 0) {
      const uniqueCategories = getUniqueCategories(allInvestors);
      const uniqueFundGroups = getUniqueFundGroups(allInvestors);
      setCategories(uniqueCategories);
      setFundGroups(uniqueFundGroups);
      
      // Use month2 data for filtering, fallback to month1
      const primaryData = month2Investors.length > 0 ? month2Investors : month1Investors;
      const filtered = filterInvestors(primaryData, filters);
      setFilteredInvestors(filtered);

      // Generate investor comparisons if both months have data
      if (month1Investors.length > 0 && month2Investors.length > 0) {
        const comparisons = compareInvestorBehavior(month1Investors, month2Investors);
        setInvestorComparisons(comparisons);
      }
    } else {
      setCategories([]);
      setFundGroups([]);
      setFilteredInvestors([]);
      setInvestorComparisons([]);
    }
  }, [month1Investors, month2Investors, filters]);

  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleDataLoaded = () => {
    const savedData = getInvestorsData();
    setMonth1Investors(savedData.month1);
    setMonth2Investors(savedData.month2);
    setDataLoaded(true);
  };

  // Generate analytics summary
  const analyticsSummary = generateAnalyticsSummary(month1Investors, month2Investors);

  return (
    <div className="space-y-8">
      {!dataLoaded ? (
        <FileUpload onDataLoaded={handleDataLoaded} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Monthly Investor Behavior Analytics</h1>
              <p className="text-muted-foreground">
                Comparative analysis of investor behavior and trends across two months
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
            <NetPositionChart investors={month2Investors.length > 0 ? month2Investors : month1Investors} />
            <CategoryDistribution investors={month2Investors.length > 0 ? month2Investors : month1Investors} />
          </div>
          
          {month1Investors.length > 0 && month2Investors.length > 0 && (
            <TrendAnalysis month1Investors={month1Investors} month2Investors={month2Investors} />
          )}
          
          <InvestorTrendChart investors={month2Investors.length > 0 ? month2Investors : month1Investors} />

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
