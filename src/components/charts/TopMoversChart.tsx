// src/components/charts/TopMoversChart.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { MonthlyInvestorData, Investor } from '@/types';
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
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

export default function TopMoversChart({ data, availableMonths, categories }: TopMoversChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  // UI state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const timePresets = ['Last Month', 'Last 3 Months', 'Last 6 Months', 'Last Year', 'Custom'];
  const [timeRange, setTimeRange] = useState<string>('Last Month');
  const [customStart, setCustomStart] = useState<string>(availableMonths[0] || '');
  const [customEnd, setCustomEnd] = useState<string>(availableMonths[availableMonths.length - 1] || '');

  // Determine start/end indices based on timeRange
  const [startMonth, endMonth] = useMemo(() => {
    const n = availableMonths.length;
    switch (timeRange) {
      case 'Last Month':    return [availableMonths[n - 2], availableMonths[n - 1]];
      case 'Last 3 Months': return [availableMonths[Math.max(0, n - 4)], availableMonths[n - 1]];
      case 'Last 6 Months': return [availableMonths[Math.max(0, n - 7)], availableMonths[n - 1]];
      case 'Last Year':     return [availableMonths[Math.max(0, n - 13)], availableMonths[n - 1]];
      case 'Custom':        return [customStart || availableMonths[0], customEnd || availableMonths[n - 1]];
      default:              return [availableMonths[0], availableMonths[n - 1]];
    }
  }, [timeRange, customStart, customEnd, availableMonths]);

  // Build investor summaries for the selected window and categories
  const summaries: Investor[] = useMemo(() => {
    return data
      .filter(inv =>
        selectedCategories.length === 0 || selectedCategories.includes(inv.category)
      )
      .map(inv => {
        const startVal = inv.monthlyShares[startMonth] ?? 0;
        const endVal = inv.monthlyShares[endMonth] ?? 0;
        return {
          name: inv.name,
          category: inv.category,
          fundGroup: inv.fundGroup || '',
          startPosition: startVal,
          endPosition: endVal,
          boughtOn18: Math.max(0, endVal - startVal),
          soldOn25: Math.max(0, startVal - endVal),
          percentToEquity: 0,
          netChange: endVal - startVal
        };
      });
  }, [data, selectedCategories, startMonth, endMonth]);

  // Render chart whenever summaries change
  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();

    // Determine top gainers and sellers
    const gainers = summaries.filter(i => i.netChange > 0)
      .sort((a, b) => b.netChange - a.netChange)
      .slice(0, 20);
    const sellers = summaries.filter(i => i.netChange < 0)
      .sort((a, b) => a.netChange - b.netChange)
      .slice(0, 20);
    const combined = [
      ...gainers.map(i => ({ ...i, type: 'gainer' })),
      ...sellers.map(i => ({ ...i, type: 'seller' }))
    ];

    // Prepare chart data
    const labels = combined.map(i => i.name);
    const values = combined.map(i => i.netChange);
    const bgColors = combined.map(i =>
      i.type === 'gainer' ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'
    );

    const chartData: ChartData<'bar', number[], string> = {
      labels,
      datasets: [
        {
          label: 'Position Change',
          data: values,
          backgroundColor: bgColors,
          borderColor: bgColors.map(c => c.replace('0.7', '1')),
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
          title: { display: true, text: 'Position Change' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const inv = combined[ctx.dataIndex];
              return [
                `Change: ${ctx.parsed.x.toLocaleString()}`,
                `Category: ${inv.category}`,
                `From ${startMonth}: ${inv.startPosition.toLocaleString()}`,
                `To   ${endMonth}: ${inv.endPosition.toLocaleString()}`
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
      chartInstance.current?.destroy();
    };
  }, [summaries, startMonth, endMonth]);

  return (
    <Card className="col-span-full w-full px-0">
      <CardHeader>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Category multi-select */}
          <div className="flex-1 min-w-[200px]">
            <Label>Categories</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedCategories.map(c => <Badge key={c}>{c}</Badge>)}
                    </div>
                  ) : (
                    'All Categories'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60">
                <ScrollArea className="h-40">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`cat-${cat}`}
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={checked => {
                          setSelectedCategories(prev =>
                            checked ? [...prev, cat] : prev.filter(x => x !== cat)
                          );
                        }}
                      />
                      <Label htmlFor={`cat-${cat}`}>{cat}</Label>
                    </div>
                  ))}
                </ScrollArea>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2"
                  onClick={() => setSelectedCategories([])}
                >
                  Clear
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Range */}
          <div className="flex-1 min-w-[200px]">
            <Label>Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {timePresets.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Range */}
          {timeRange === 'Custom' && (
            <>
              <div className="flex-1 min-w-[150px]">
                <Label>From</Label>
                <Select value={customStart} onValueChange={setCustomStart}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Start month" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-40">
                      {availableMonths.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label>To</Label>
                <Select value={customEnd} onValueChange={setCustomEnd}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="End month" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-40">
                      {availableMonths.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <CardTitle className="mt-4">Top Movers</CardTitle>
        <CardDescription>Biggest position changes</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[800px]">
          <canvas ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  );
}
