
import { useEffect, useRef, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ChartData, 
  ChartOptions,
  BarController
} from 'chart.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Investor } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Register all required Chart.js components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  BarController
);

interface InvestorTrendChartProps {
  investors: Investor[];
}

export default function InvestorTrendChart({ investors }: InvestorTrendChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);
  const [category, setCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("netChange");
  
  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    
    // Filter investors by category if needed
    let filteredInvestors = investors;
    if (category !== "All") {
      filteredInvestors = investors.filter(investor => investor.category === category);
    }
    
    // Sort investors by the selected criteria
    const sortedInvestors = [...filteredInvestors].sort((a, b) => {
      if (sortBy === "netChange") {
        return (b.netChange || 0) - (a.netChange || 0);
      } else if (sortBy === "boughtOn18") {
        return b.boughtOn18 - a.boughtOn18;
      } else if (sortBy === "soldOn25") {
        return b.soldOn25 - a.soldOn25;
      }
      return 0;
    });
    
    // Take top 10 investors
    const topInvestors = sortedInvestors.slice(0, 10);
    
    // Prepare chart data
    const chartData: ChartData<'bar', number[], string> = {
      labels: topInvestors.map(investor => investor.name),
      datasets: [
        {
          label: 'Bought (Apr 18)',
          data: topInvestors.map(investor => investor.boughtOn18),
          backgroundColor: 'rgba(16, 185, 129, 0.7)', // Green
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1
        },
        {
          label: 'Sold (Apr 25)',
          data: topInvestors.map(investor => investor.soldOn25),
          backgroundColor: 'rgba(239, 68, 68, 0.7)', // Red
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 1
        }
      ]
    };

    const chartOptions: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Volume'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Investor'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.x.toLocaleString()}`;
            },
            afterBody: function(tooltipItems) {
              const item = tooltipItems[0];
              const index = item.dataIndex;
              const investor = topInvestors[index];
              const netChange = investor.netChange || 0;
              return [
                '',
                `Net Change: ${netChange.toLocaleString()}`,
                `Category: ${investor.category}`
              ];
            }
          }
        }
      }
    };

    // Create chart
    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new ChartJS(ctx, {
        type: 'bar',
        data: chartData,
        options: chartOptions
      });
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [investors, category, sortBy]);

  const categories = ["All", ...new Set(investors.map(investor => investor.category))];

  if (!investors.length) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Investor Buy vs Sell Trends</CardTitle>
          <CardDescription>
            No data available. Please upload investor data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Investor Buy vs Sell Trends</CardTitle>
          <CardDescription>
            Comparative analysis of bought vs sold positions for top investors
          </CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="netChange">Net Change</SelectItem>
              <SelectItem value="boughtOn18">Bought Volume</SelectItem>
              <SelectItem value="soldOn25">Sold Volume</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[600px]">
          <canvas ref={chartRef} />
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This chart compares the bought (Apr 18) and sold (Apr 25) volumes for individual investors, showing the top 10 investors based on your selected sorting criteria. The horizontal bars make it easy to compare both values for each investor, with tooltips providing detailed information including net change and investor category. Use the filters above to focus on specific investor categories or sort by different metrics.
        </p>
      </CardContent>
    </Card>
  );
}
