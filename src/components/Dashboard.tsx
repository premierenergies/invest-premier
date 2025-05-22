
import { useState, useEffect } from "react";
import { filterInvestors, generateAnalyticsSummary, getInvestorsData, getUniqueCategories } from "@/utils/dataUtils";
import { Investor, FilterOptions } from "@/types";
import FileUpload from "./FileUpload";
import InvestorTable from "./InvestorTable";
import AnalyticsSummary from "./AnalyticsSummary";
import NetPositionChart from "./charts/NetPositionChart";
import CategoryDistribution from "./charts/CategoryDistribution";
import TrendAnalysis from "./charts/TrendAnalysis";

export default function Dashboard() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [filteredInvestors, setFilteredInvestors] = useState<Investor[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    category: null,
    sortBy: "name",
    sortOrder: "asc",
    searchQuery: "",
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  // On component mount, check for data in localStorage
  useEffect(() => {
    const savedData = getInvestorsData();
    if (savedData && savedData.length > 0) {
      setInvestors(savedData);
      setDataLoaded(true);
    }
  }, []);

  // When investors data changes, update categories and filtered results
  useEffect(() => {
    if (investors.length > 0) {
      const uniqueCategories = getUniqueCategories(investors);
      setCategories(uniqueCategories);
      
      const filtered = filterInvestors(investors, filters);
      setFilteredInvestors(filtered);
    } else {
      setCategories([]);
      setFilteredInvestors([]);
    }
  }, [investors, filters]);

  const handleFilterChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleDataLoaded = () => {
    const savedData = getInvestorsData();
    setInvestors(savedData);
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
              <h1 className="text-3xl font-bold tracking-tight">Investor Analytics Dashboard</h1>
              <p className="text-muted-foreground">
                Analysis of top 100 investors for the selected stock
              </p>
            </div>
            <FileUpload onDataLoaded={handleDataLoaded} />
          </div>

          <AnalyticsSummary summary={analyticsSummary} />

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <NetPositionChart investors={investors} />
            <CategoryDistribution investors={investors} />
          </div>
          
          <TrendAnalysis investors={investors} />

          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Investor Data</h2>
            <InvestorTable
              investors={filteredInvestors}
              categories={categories}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
