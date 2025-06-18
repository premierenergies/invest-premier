
import { useEffect, useRef, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend, 
  ChartData, 
  ChartOptions,
  LineController
} from 'chart.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MonthlyInvestorData } from '@/types';
import { getMonthDisplayLabels } from '@/utils/csvUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController
);

interface MonthlyTrendChartProps {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

export default function MonthlyTrendChart({ data, availableMonths, categories }: MonthlyTrendChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedInvestor, setSelectedInvestor] = useState<string>("");

  useEffect(() => {
    if (!chartRef.current || !data.length || !availableMonths.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Filter data based on selected filters
    let filteredData = data;
    
    if (selectedCategory !== "all") {
      filteredData = filteredData.filter(inv => inv.category === selectedCategory);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredData = filteredData.filter(inv => 
        inv.name.toLowerCase().includes(query) || 
        (inv.description && inv.description.toLowerCase().includes(query))
      );
    }

    // If specific investor selected, show only that investor
    if (selectedInvestor) {
      filteredData = filteredData.filter(inv => inv.name === selectedInvestor);
    }

    // Get display labels for months
    const displayLabels = getMonthDisplayLabels(availableMonths);

    // Prepare datasets - show up to 10 investors/funds as lines
    const datasets = filteredData.slice(0, 10).map((investor, index) => {
      const colors = [
        'rgba(59, 130, 246, 1)',   // Blue
        'rgba(16, 185, 129, 1)',   // Green
        'rgba(245, 158, 11, 1)',   // Amber
        'rgba(239, 68, 68, 1)',    // Red
        'rgba(168, 85, 247, 1)',   // Purple
        'rgba(236, 72, 153, 1)',   // Pink
        'rgba(6, 182, 212, 1)',    // Cyan
        'rgba(34, 197, 94, 1)',    // Emerald
        'rgba(251, 191, 36, 1)',   // Yellow
        'rgba(156, 163, 175, 1)',  // Gray
      ];

      const monthlyValues = availableMonths.map(month => investor.monthlyShares[month] || 0);

      return {
        label: investor.name,
        data: monthlyValues,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    const chartData: ChartData<'line', number[], string> = {
      labels: displayLabels, // Use readable date labels
      datasets
    };

    const chartOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: 'Number of Shares'
          },
          beginAtZero: true
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          display: filteredData.length <= 10,
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y.toLocaleString()} shares`;
            }
          }
        }
      }
    };

    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new ChartJS(ctx, {
        type: 'line',
        data: chartData,
        options: chartOptions
      });
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, availableMonths, selectedCategory, searchQuery, selectedInvestor]);

  // Get investors for search dropdown - fix the filtering logic
  const searchResults = searchQuery.trim() ? data.filter(inv => {
    const query = searchQuery.toLowerCase().trim();
    return inv.name.toLowerCase().includes(query) || 
           (inv.description && inv.description.toLowerCase().includes(query));
  }).slice(0, 10) : [];

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Month-over-Month Trends</CardTitle>
        <CardDescription>
          Track investor position changes across months. Shows lines for each investor/fund.
        </CardDescription>
        <div className="flex flex-wrap gap-4 items-center">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search investors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {searchResults.length > 0 && searchQuery.trim() && (
            <Select value={selectedInvestor} onValueChange={setSelectedInvestor}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select specific investor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Show all results</SelectItem>
                {searchResults.map((investor) => (
                  <SelectItem key={investor.name} value={investor.name}>
                    {investor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <canvas ref={chartRef} />
        </div>
        {filteredData.length > 10 && (
          <p className="text-sm text-muted-foreground mt-2">
            Showing top 10 results. Use filters to narrow down the selection.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
