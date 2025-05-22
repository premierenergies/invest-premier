
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { Investor } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

Chart.register(...registerables);

interface NetPositionChartProps {
  investors: Investor[];
}

export default function NetPositionChart({ investors }: NetPositionChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Sort investors by net change for better visualization
    const sortedInvestors = [...investors]
      .sort((a, b) => (a.netChange || 0) - (b.netChange || 0))
      .slice(0, 15); // Show top/bottom 15 for readability

    // Prepare data for chart
    const labels = sortedInvestors.map(investor => investor.name);
    const data = sortedInvestors.map(investor => investor.netChange || 0);
    const backgroundColors = data.map(value => 
      value > 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'
    );

    // Create chart
    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Net Position Change',
              data,
              backgroundColor: backgroundColors,
              borderColor: backgroundColors.map(color => color.replace('0.7', '1')),
              borderWidth: 1
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw as number;
                  return `Net change: ${value.toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              }
            },
            y: {
              grid: {
                display: false
              },
              ticks: {
                callback: function(val, index) {
                  const label = this.getLabelForValue(val as number);
                  // Truncate long names
                  return label.length > 15 ? label.substring(0, 15) + '...' : label;
                }
              }
            }
          }
        }
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
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Net Position Changes</CardTitle>
          <CardDescription>
            No data available. Please upload investor data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Net Position Changes</CardTitle>
        <CardDescription>
          Top gainers and sellers by position change
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
