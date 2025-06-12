
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

interface VolumeAnalysisChartProps {
  investors: Investor[];
}

export default function VolumeAnalysisChart({ investors }: VolumeAnalysisChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group by categories and calculate volume metrics
    const categories = [...new Set(investors.map(inv => inv.category))];
    
    const datasets = [
      {
        label: 'Bought Volume',
        data: categories.map(cat => {
          const catInvestors = investors.filter(inv => inv.category === cat);
          return catInvestors.reduce((sum, inv) => sum + inv.boughtOn18, 0);
        }),
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Sold Volume', 
        data: categories.map(cat => {
          const catInvestors = investors.filter(inv => inv.category === cat);
          return catInvestors.reduce((sum, inv) => sum + inv.soldOn25, 0);
        }),
        borderColor: 'rgba(239, 68, 68, 1)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: false,
      }
    ];

    const chartData: ChartData<'line', number[], string> = {
      labels: categories,
      datasets
    };

    const chartOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volume Analysis by Category</CardTitle>
        <CardDescription>
          Bought vs Sold volumes across investor categories
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
