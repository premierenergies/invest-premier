
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
import { Investor } from '@/types';

// Properly register all required components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  BarController  // Add BarController to fix "bar is not a registered controller" error
);

interface NetPositionChartProps {
  investors: Investor[];
}

export default function NetPositionChart({ investors }: NetPositionChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Calculate total bought and sold
    const totalBought = investors.reduce((sum, investor) => sum + investor.boughtOn18, 0);
    const totalSold = investors.reduce((sum, investor) => sum + investor.soldOn25, 0);
    const netChange = totalSold - totalBought;

    const chartData: ChartData<'bar', number[], string> = {
      labels: ['Bought', 'Sold', 'Net Position'],
      datasets: [
        {
          label: 'Volume',
          data: [totalBought, totalSold, netChange],
          backgroundColor: [
            'rgba(16, 185, 129, 0.7)', // Green
            'rgba(239, 68, 68, 0.7)',   // Red
            netChange >= 0 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(245, 158, 11, 0.7)' // Blue or Amber
          ],
          borderColor: [
            'rgb(16, 185, 129)',
            'rgb(239, 68, 68)',
            netChange >= 0 ? 'rgb(59, 130, 246)' : 'rgb(245, 158, 11)'
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
            text: 'Volume'
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
              return `Volume: ${context.raw.toLocaleString()}`;
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
  }, [investors]);

  if (!investors.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Net Position</CardTitle>
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
        <CardTitle>Net Position</CardTitle>
        <CardDescription>
          Comparison of total bought vs sold positions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <canvas ref={chartRef} />
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This chart compares the total volume bought as of April 18, 2025 to the total volume sold as of April 25, 2025 across all investors. The net position (third bar) is calculated as the difference between sold and bought volumes, indicating the overall market sentiment (positive means net selling, negative means net buying).
        </p>
      </CardContent>
    </Card>
  );
}
