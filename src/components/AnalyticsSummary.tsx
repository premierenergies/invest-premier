import { AnalyticsSummary as AnalyticsSummaryType } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Users } from "lucide-react";

interface AnalyticsSummaryProps {
  summary: AnalyticsSummaryType;
}

export default function AnalyticsSummary({ summary }: AnalyticsSummaryProps) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
      {/* <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Investors</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.totalInvestors}</div>
          <p className="text-xs text-muted-foreground">
            Tracking positions from top investors
          </p>
        </CardContent>
      </Card> */}
      
      {/* <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Position</CardTitle>
          {summary.netPosition > 0 ? (
            <ArrowUp className="h-4 w-4 text-dashboard-success" />
          ) : (
            <ArrowDown className="h-4 w-4 text-dashboard-danger" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            summary.netPosition > 0 
              ? "text-dashboard-success" 
              : summary.netPosition < 0 
                ? "text-dashboard-danger" 
                : ""
          }`}>
            {summary.netPosition.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Overall position change between periods
          </p>
        </CardContent>
      </Card> */}
      
      {/* <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Gainer</CardTitle>
          <ArrowUp className="h-4 w-4 text-dashboard-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-dashboard-success">
            {summary.topGainer ? (
              <>
                <div className="text-sm font-normal text-muted-foreground">
                  {summary.topGainer.name}
                </div>
                <div>{(summary.topGainer.netChange || 0).toLocaleString()}</div>
              </>
            ) : (
              "N/A"
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Largest positive position change
          </p>
        </CardContent>
      </Card> */}
      
      {/* <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Seller</CardTitle>
          <ArrowDown className="h-4 w-4 text-dashboard-danger" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-dashboard-danger">
            {summary.topSeller ? (
              <>
                <div className="text-sm font-normal text-muted-foreground">
                  {summary.topSeller.name}
                </div>
                <div>{(summary.topSeller.netChange || 0).toLocaleString()}</div>
              </>
            ) : (
              "N/A"
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Largest negative position change
          </p>
        </CardContent>
      </Card> */}
    </div>
  );
}
