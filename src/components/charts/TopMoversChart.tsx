
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
import { getTopMovers } from '@/utils/dataUtils';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  BarController
);

interface TopMoversChartProps {
  investors: Investor[];
}

export default function TopMoversChart({ investors }: TopMoversChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const { topGainers, topSellers } = getTopMovers(investors, 5);
    
    // Combine top gainers and sellers for chart
    const combinedData = [
      ...topGainers.map(inv => ({ ...inv, type: 'gainer' })),
      ...topSellers.map(inv => ({ ...inv, type: 'seller' }))
    ];

    const labels = combinedData.map(inv => inv.name);
    const data = combinedData.map(inv => inv.netChange || 0);
    const colors = combinedData.map(inv => 
      inv.type === 'gainer' 
        ? 'rgba(34, 197, 94, 0.7)'  // Green
        : 'rgba(239, 68, 68, 0.7)'  // Red
    );

    const chartData: ChartData<'bar', number[], string> = {
      labels,
      datasets: [
        {
          label: 'Position Change',
          data,
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
            text: 'Position Change'
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
              const investor = combinedData[context.dataIndex];
              return [
                `Position Change: ${context.parsed.x.toLocaleString()}`,
                `Category: ${investor.category}`,
                `End Position: ${investor.endPosition?.toLocaleString() || 'N/A'}`
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
        <CardTitle>Top Movers</CardTitle>
        <CardDescription>
          Biggest position changes (top 5 gainers & sellers)
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
