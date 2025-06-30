
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
import { Loader2 } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!chartRef.current || !data.length || !availableMonths.length) return;

    setIsLoading(true);
    setError("");

    try {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      // Simple filtering logic
      let filteredData = data;
      
      // Category filter
      if (selectedCategory !== "all") {
        filteredData = filteredData.filter(inv => inv.category === selectedCategory);
      }
      
      // Simple name search - only search investor names
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filteredData = filteredData.filter(inv => 
          inv.name.toLowerCase().includes(query)
        );
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
        labels: displayLabels,
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
    } catch (err) {
      setError("Failed to render chart. Please try again.");
      console.error("Chart rendering error:", err);
    } finally {
      setIsLoading(false);
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, availableMonths, selectedCategory, searchQuery]);

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
          
          <div className="flex-1 min-w-[200px] relative">
            <Input
              placeholder="Search by investor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin" />
            )}
          </div>
        </div>
        {error && (
          <div className="text-red-600 text-sm mt-2">{error}</div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[400px] relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          <canvas ref={chartRef} />
        </div>
        {!isLoading && !error && (
          <>
            {searchQuery && (
              <p className="text-sm text-muted-foreground mt-2">
                Found {data.filter(inv => inv.name.toLowerCase().includes(searchQuery.toLowerCase())).length} investors matching "{searchQuery}"
              </p>
            )}
            {data.filter(inv => {
              if (selectedCategory !== "all" && inv.category !== selectedCategory) return false;
              if (searchQuery.trim() && !inv.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) return false;
              return true;
            }).length > 10 && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing top 10 results. Use filters to narrow down the selection.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
