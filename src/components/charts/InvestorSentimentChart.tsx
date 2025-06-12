
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
import { generateInvestorSentimentAnalysis } from '@/utils/dataUtils';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  BarController
);

interface InvestorSentimentChartProps {
  investors: Investor[];
}

export default function InvestorSentimentChart({ investors }: InvestorSentimentChartProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!chartRef.current || !investors.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const sentiment = generateInvestorSentimentAnalysis(investors);

    const chartData: ChartData<'bar', number[], string> = {
      labels: ['Buyers', 'Holders', 'Sellers'],
      datasets: [
        {
          label: 'Number of Investors',
          data: [sentiment.buyerCount, sentiment.holderCount, sentiment.sellerCount],
          backgroundColor: [
            'rgba(34, 197, 94, 0.7)',   // Green - Buyers
            'rgba(59, 130, 246, 0.7)',  // Blue - Holders  
            'rgba(239, 68, 68, 0.7)',   // Red - Sellers
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(59, 130, 246)', 
            'rgb(239, 68, 68)',
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
              const total = sentiment.buyerCount + sentiment.holderCount + sentiment.sellerCount;
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
      });
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [investors]);

  const sentiment = generateInvestorSentimentAnalysis(investors);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Sentiment</CardTitle>
        <CardDescription>
          Investor behavior distribution (min 20k shares)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <canvas ref={chartRef} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-green-600">{sentiment.buyerCount}</div>
            <div className="text-muted-foreground">Buyers</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-blue-600">{sentiment.holderCount}</div>
            <div className="text-muted-foreground">Holders</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-red-600">{sentiment.sellerCount}</div>
            <div className="text-muted-foreground">Sellers</div>
          </div>
        </div>
        <div className="mt-4 text-center">
          <div className={`text-lg font-bold ${sentiment.sentimentScore > 0 ? 'text-green-600' : sentiment.sentimentScore < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            Sentiment Score: {sentiment.sentimentScore}
          </div>
          <div className="text-sm text-muted-foreground">
            {sentiment.sentimentScore > 0 ? 'Bullish Market' : sentiment.sentimentScore < 0 ? 'Bearish Market' : 'Neutral Market'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
