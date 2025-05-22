
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { Investor } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

Chart.register(...registerables);

interface TrendAnalysisProps {
  investors: Investor[];
}

export default function TrendAnalysis({ investors }: TrendAnalysisProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    // Destroy previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Group investors by category and calculate total position changes
    const categoryData: Record<string, { bought: number; sold: number }> = {};
    
    investors.forEach(investor => {
      const category = investor.category || 'Unknown';
      
      if (!categoryData[category]) {
        categoryData[category] = { bought: 0, sold: 0 };
      }
      
      categoryData[category].bought += investor.boughtOn18;
      categoryData[category].sold += investor.soldOn25;
    });

    // Prepare data for chart
    const labels = Object.keys(categoryData);
    const boughtData = labels.map(cat => categoryData[cat].bought);
    const soldData = labels.map(cat => categoryData[cat].sold);

    // Create chart
    const ctx = chartRef.current.getContext('2d');
    
    if (ctx) {
      chartInstance.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '18/04/2025 Position',
              data: boughtData,
              backgroundColor: 'rgba(59, 130, 246, 0.7)', // Blue
              borderColor: 'rgb(59, 130, 246)',
              borderWidth: 1
            },
            {
              label: '25/04/2025 Position',
              data: soldData,
              backgroundColor: 'rgba(16, 185, 129, 0.7)', // Green
              borderColor: 'rgb(16, 185, 129)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw as number;
                  return `${context.dataset.label}: ${value.toLocaleString()}`;
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
                color: 'rgba(0, 0, 0, 0.05)'
              },
              ticks: {
                callback: function(value) {
                  return (value as number).toLocaleString();
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
      <Card>
        <CardHeader>
          <CardTitle>Position Trends by Category</CardTitle>
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
        <CardTitle>Position Trends by Category</CardTitle>
        <CardDescription>
          Comparison of positions between dates by category
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
