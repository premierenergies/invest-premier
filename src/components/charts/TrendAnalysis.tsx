
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

interface TrendAnalysisProps {
  month1Investors: Investor[];
  month2Investors: Investor[];
}

export default function TrendAnalysis({ month1Investors, month2Investors }: TrendAnalysisProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || (!month1Investors.length && !month2Investors.length)) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group by category for both months
    const categories = [...new Set([
      ...month1Investors.map(inv => inv.category),
      ...month2Investors.map(inv => inv.category)
    ])];
    
    // Create datasets for each category showing month-to-month progression
    const datasets = categories.map((category, index) => {
      const month1CategoryInvestors = month1Investors.filter(investor => investor.category === category);
      const month2CategoryInvestors = month2Investors.filter(investor => investor.category === category);
      
      const month1Total = month1CategoryInvestors.reduce((sum, investor) => sum + investor.netChange, 0);
      const month2Total = month2CategoryInvestors.reduce((sum, investor) => sum + investor.netChange, 0);
      
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
        data: [month1Total, month2Total],
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length].replace('0.7', '0.1'),
        borderWidth: 3,
        tension: 0.4,
        fill: false,
        pointRadius: 6,
        pointHoverRadius: 8,
      };
    });

    const chartData: ChartData<'line', number[], string> = {
      labels: ['Month 1', 'Month 2'],
      datasets
    };

    const chartOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: {
            display: true,
            text: 'Net Position Change'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Time Period'
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
              const value = context.parsed.y;
              const trend = context.dataIndex === 1 && datasets[context.datasetIndex] 
                ? value - datasets[context.datasetIndex].data[0] 
                : 0;
              return [
                `${context.dataset.label}: ${value.toLocaleString()}`,
                context.dataIndex === 1 ? `Trend: ${trend > 0 ? '+' : ''}${trend.toLocaleString()}` : ''
              ].filter(Boolean);
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
  }, [month1Investors, month2Investors]);

  if (!month1Investors.length && !month2Investors.length) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Monthly Trend Analysis</CardTitle>
          <CardDescription>
            No data available. Please upload investor data for both months.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Monthly Trend Analysis</CardTitle>
        <CardDescription>
          Category-wise net position changes between two months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <canvas ref={chartRef} />
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This chart tracks the change in net positions by investor category between the two months. 
          Each line represents a category, showing the progression from Month 1 to Month 2. 
          An upward trend indicates the category had increased net positive positions (more buying or less selling), 
          while a downward trend indicates decreased net positions (more selling or less buying). 
          The slope and direction help identify which investor categories drove market movements during this period.
        </p>
      </CardContent>
    </Card>
  );
}
