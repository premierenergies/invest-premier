
import { useEffect, useRef } from 'react';
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
import { InvestorComparison } from '@/types';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  BarController
);

interface FundGroupChartProps {
  comparisons: InvestorComparison[];
}

export default function FundGroupChart({ comparisons }: FundGroupChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !comparisons.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group by fund groups and calculate net trend changes
    const fundGroupData: Record<string, { count: number; totalTrendChange: number }> = {};
    
    comparisons.forEach(comparison => {
      const group = comparison.fundGroup;
      if (!fundGroupData[group]) {
        fundGroupData[group] = { count: 0, totalTrendChange: 0 };
      }
      fundGroupData[group].count++;
      fundGroupData[group].totalTrendChange += comparison.trendChange;
    });

    // Sort by total trend change and take top 10
    const sortedGroups = Object.entries(fundGroupData)
      .sort(([,a], [,b]) => Math.abs(b.totalTrendChange) - Math.abs(a.totalTrendChange))
      .slice(0, 10);

    const labels = sortedGroups.map(([group]) => group);
    const trendData = sortedGroups.map(([, data]) => data.totalTrendChange);
    const colors = trendData.map(value => 
      value > 0 
        ? 'rgba(34, 197, 94, 0.7)'  // Green for positive
        : 'rgba(239, 68, 68, 0.7)'  // Red for negative
    );

    const chartData: ChartData<'bar', number[], string> = {
      labels,
      datasets: [
        {
          label: 'Net Trend Change',
          data: trendData,
          backgroundColor: colors,
          borderColor: colors.map(color => color.replace('0.7', '1')),
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
          title: {
            display: true,
            text: 'Net Trend Change'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Fund Groups'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const group = context.label;
              const groupData = fundGroupData[group];
              return [
                `Net Change: ${context.parsed.x.toLocaleString()}`,
                `Investors: ${groupData.count}`,
                `Avg per Investor: ${(context.parsed.x / groupData.count).toLocaleString()}`
              ];
            }
          }
        }
      }
    };

    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new ChartJS(ctx, {
        type: 'bar',
        data: chartData,
        options: chartOptions
      }) as any;
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [comparisons]);

  if (!comparisons.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fund Group Analysis</CardTitle>
          <CardDescription>
            No comparison data available. Please upload both months of data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Group Trend Analysis</CardTitle>
        <CardDescription>
          Net position changes by fund groups (first 2 words)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <canvas ref={chartRef} />
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This chart groups investors by the first two words of their fund names (e.g., "AXIS BANK", "MOTILAL OSWAL") 
          and shows the net trend change for each group between the two months. Green bars indicate net buying activity, 
          while red bars indicate net selling activity. The chart helps identify which fund families or investment groups 
          showed the most significant behavioral changes.
        </p>
      </CardContent>
    </Card>
  );
}
