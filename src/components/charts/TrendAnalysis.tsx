
import { useEffect, useRef } from 'react';
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
import { Investor } from '@/types';

// Properly register all required components
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

interface TrendAnalysisProps {
  investors: Investor[];
}

export default function TrendAnalysis({ investors }: TrendAnalysisProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group investors by category
    const categories = [...new Set(investors.map(investor => investor.category))];
    
    // Create datasets for each category
    const datasets = categories.map((category, index) => {
      const categoryInvestors = investors.filter(investor => investor.category === category);
      const totalBought = categoryInvestors.reduce((sum, investor) => sum + investor.boughtOn18, 0);
      const totalSold = categoryInvestors.reduce((sum, investor) => sum + investor.soldOn25, 0);
      
      // Color palette
      const colors = [
        'rgba(6, 182, 212, 0.7)',   // Teal
        'rgba(59, 130, 246, 0.7)',  // Blue
        'rgba(16, 185, 129, 0.7)',  // Green
        'rgba(245, 158, 11, 0.7)',  // Amber
        'rgba(239, 68, 68, 0.7)',   // Red
        'rgba(168, 85, 247, 0.7)',  // Purple
        'rgba(236, 72, 153, 0.7)',  // Pink
      ];
      
      return {
        label: category,
        data: [totalBought, totalSold],
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length].replace('0.7', '0.1'),
        borderWidth: 2,
        tension: 0.4,
        fill: true,
      };
    });

    const chartData: ChartData<'line', number[], string> = {
      labels: ['April 18, 2025', 'April 25, 2025'],
      datasets
    };

    const chartOptions: ChartOptions<'line'> = {
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
          position: 'top',
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y.toLocaleString()}`;
            }
          }
        }
      }
    };

    // Create chart
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
  }, [investors]);

  if (!investors.length) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Trend Analysis</CardTitle>
          <CardDescription>
            No data available. Please upload investor data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Trend Analysis</CardTitle>
        <CardDescription>
          Weekly trend of investment positions by category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <canvas ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  );
}
