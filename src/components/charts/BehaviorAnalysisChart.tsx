
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

interface BehaviorAnalysisChartProps {
  comparisons: InvestorComparison[];
}

export default function BehaviorAnalysisChart({ comparisons }: BehaviorAnalysisChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !comparisons.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Count behaviors
    const behaviorCounts = {
      buyer: comparisons.filter(c => c.behaviorType === 'buyer').length,
      seller: comparisons.filter(c => c.behaviorType === 'seller').length,
      holder: comparisons.filter(c => c.behaviorType === 'holder').length,
      new: comparisons.filter(c => c.behaviorType === 'new').length,
      exited: comparisons.filter(c => c.behaviorType === 'exited').length,
    };

    const chartData: ChartData<'bar', number[], string> = {
      labels: ['Buyers', 'Sellers', 'Holders', 'New Entries', 'Exits'],
      datasets: [
        {
          label: 'Number of Investors',
          data: [
            behaviorCounts.buyer,
            behaviorCounts.seller,
            behaviorCounts.holder,
            behaviorCounts.new,
            behaviorCounts.exited
          ],
          backgroundColor: [
            'rgba(34, 197, 94, 0.7)',   // Green - Buyers
            'rgba(239, 68, 68, 0.7)',   // Red - Sellers
            'rgba(59, 130, 246, 0.7)',  // Blue - Holders
            'rgba(16, 185, 129, 0.7)',  // Teal - New
            'rgba(156, 163, 175, 0.7)'  // Gray - Exited
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(239, 68, 68)',
            'rgb(59, 130, 246)',
            'rgb(16, 185, 129)',
            'rgb(156, 163, 175)'
          ],
          borderWidth: 1
        }
      ]
    };

    const chartOptions: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Investors'
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
              const total = comparisons.length;
              const percentage = ((context.parsed.y / total) * 100).toFixed(1);
              return `${context.parsed.y} investors (${percentage}%)`;
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
          <CardTitle>Investor Behavior Analysis</CardTitle>
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
        <CardTitle>Investor Behavior Analysis</CardTitle>
        <CardDescription>
          Distribution of investor behavior patterns between months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <canvas ref={chartRef} />
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This chart categorizes investors based on their behavior between the two months: 
          <strong> Buyers</strong> increased their positions significantly (trend change &gt; 1000), 
          <strong> Sellers</strong> decreased positions significantly (trend change &lt; -1000), 
          <strong> Holders</strong> maintained similar positions, 
          <strong> New Entries</strong> appeared only in the second month, and 
          <strong> Exits</strong> were only present in the first month.
        </p>
      </CardContent>
    </Card>
  );
}
