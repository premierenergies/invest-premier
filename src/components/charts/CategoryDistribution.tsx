
import { useEffect, useRef } from 'react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  ChartData, 
  ChartOptions,
  PieController,
  ChartTypeRegistry
} from 'chart.js';
import { Investor } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Properly register all required components
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  PieController
);

interface CategoryDistributionProps {
  investors: Investor[];
}

export default function CategoryDistribution({ investors }: CategoryDistributionProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group investors by category
    const categoryGroups: Record<string, number> = {};
    investors.forEach(investor => {
      const category = investor.category || 'Unknown';
      if (!categoryGroups[category]) {
        categoryGroups[category] = 0;
      }
      categoryGroups[category]++;
    });

    // Prepare data for chart
    const labels = Object.keys(categoryGroups);
    const data = Object.values(categoryGroups);
    
    // Create color palette
    const backgroundColors = [
      'rgba(6, 182, 212, 0.7)',   // Teal
      'rgba(59, 130, 246, 0.7)',  // Blue
      'rgba(16, 185, 129, 0.7)',  // Green
      'rgba(245, 158, 11, 0.7)',  // Amber
      'rgba(239, 68, 68, 0.7)',   // Red
      'rgba(168, 85, 247, 0.7)',  // Purple
      'rgba(236, 72, 153, 0.7)',  // Pink
    ];

    // Create chart data and options with proper typing
    const chartData: ChartData<'pie', number[], string> = {
      labels,
      datasets: [
        {
          data,
          backgroundColor: backgroundColors.slice(0, labels.length),
          borderColor: 'white',
          borderWidth: 1
        }
      ]
    };

    const chartOptions: ChartOptions<'pie'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw as number;
              const total = (context.chart.data.datasets[0].data as number[]).reduce(
                (sum, val) => sum + val, 0
              );
              const percentage = Math.round((value / total) * 100);
              return `${context.label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    };

    // Create chart
    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new ChartJS(ctx, {
        type: 'pie',
        data: chartData,
        options: chartOptions
      });
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [investors]);

  if (!investors.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Investor Categories</CardTitle>
          <CardDescription>
            No data available. Please upload investor data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investor Categories</CardTitle>
        <CardDescription>
          Distribution of investors by category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <canvas ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  );
}
