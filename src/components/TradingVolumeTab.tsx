import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
} from "recharts";

type Row = {
  Symbol: string;
  TradeDate: string; // ISO yyyy-mm-dd
  Close: number;
  Volume: number;
  ValueTraded: number;
};

function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin;
}
const API = `${apiBase()}/api`;

// YYYY-MM-DD in Asia/Kolkata (no DST)
function todayIsoIST(): string {
  const dt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = dt.find((p) => p.type === "year")?.value ?? "0000";
  const m = dt.find((p) => p.type === "month")?.value ?? "01";
  const d = dt.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

const fmtINR = (n: number) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (n ?? 0).toLocaleString("en-IN");
// Always display only the date portion as YYYY-MM-DD (no timezone)
const fmtDate = (v: string) => {
  if (!v) return "";
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return isNaN(+d) ? v : d.toISOString().slice(0, 10);
};

const shortNum = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_00_00_00_000) return `${(n / 1_00_00_00_000).toFixed(1)}T`; // trillions
  if (a >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}B`; // billions
  if (a >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}M`; // millions
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

type RangeKey = "7D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

function startForRange(latest: Date, range: RangeKey): Date | null {
  const d = new Date(latest);
  switch (range) {
    case "7D":
      d.setDate(d.getDate() - 7);
      return d;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "6M":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "YTD":
      return new Date(latest.getFullYear(), 0, 1);
    case "ALL":
    default:
      return null;
  }
}

function sma(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const out: number[] = Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

export default function TradingVolumeTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [symbol, setSymbol] = useState<string>("PREMIERENE.NS");
  const [limit, setLimit] = useState<number>(30);
  const [startDate, setStartDate] = useState<string>("2024-09-03");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  // Chart UI state
  const [range, setRange] = useState<RangeKey>("ALL");
  const [showPrice, setShowPrice] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showValue, setShowValue] = useState(true);
  const [showMA7, setShowMA7] = useState(true);
  const [minVolume, setMinVolume] = useState<string>(""); // filter
  const [onlyPositive, setOnlyPositive] = useState(true); // filter

  const load = async () => {
    setLoading(true);
    try {
      const qs = startDate
        ? `start=${encodeURIComponent(startDate)}`
        : `limit=${limit}`;
      const r = await fetch(
        `${API}/trading?symbol=${encodeURIComponent(symbol)}&${qs}`,
        { credentials: "include" }
      );
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const refreshToday = async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(`${API}/trading/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      await load();
      return true;
    } finally {
      setRefreshing(false);
    }
  };

  const backfill = async () => {
    if (!startDate) return;
    setBackfilling(true);
    try {
      await fetch(`${API}/trading/backfill`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, start: startDate }),
      });
      await load();
    } finally {
      setBackfilling(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    load(); /* reload when symbol/limit changes */
  }, [symbol, limit]);

  // Auto-record today's data (once/day/symbol) if today's row is absent
  useEffect(() => {
    if (!rows || rows.length === 0) return;

    const today = todayIsoIST();
    const key = `tvtab-auto-${symbol}-${today}`;

    // Latest row from API is rows[0] (DESC)
    const latestIso = fmtDate(rows[0]?.TradeDate || "");
    if (latestIso === today) {
      // already have today's data; mark done
      sessionStorage.setItem(key, "1");
      return;
    }

    // If not recorded today, trigger refresh → load
    if (!sessionStorage.getItem(key)) {
      (async () => {
        try {
          const ok = await refreshToday();
          if (ok) sessionStorage.setItem(key, "1");
        } finally {
          // no-op; we only mark done on success above
        }
      })();
    }
  }, [rows, symbol]);

  const rowsAsc = useMemo(() => {
    // API returns DESC by date; for chart we want ASC
    const arr = [...rows].reverse();
    const mv = Number(minVolume || 0);
    return arr.filter((r) => {
      if (onlyPositive && (r.Volume <= 0 || r.Close <= 0)) return false;
      if (mv > 0 && r.Volume < mv) return false;
      return true;
    });
  }, [rows, minVolume, onlyPositive]);

  const latest = rows[0];
  const latestAsc = rowsAsc[rowsAsc.length - 1];
  const titleRight = useMemo(() => {
    if (!latest) return null;
    return (
      <div className="text-sm text-muted-foreground">
        Latest: <span className="font-medium">{fmtDate(latest.TradeDate)}</span>
        {" • "}Close <span className="font-medium">{fmtINR(latest.Close)}</span>
        {" • "}Volume{" "}
        <span className="font-medium">{fmtNum(latest.Volume)}</span>
      </div>
    );
  }, [latest]);

  // Range-filtered chart data
  const chartData = useMemo(() => {
    if (rowsAsc.length === 0) return [];
    const last = rowsAsc[rowsAsc.length - 1];
    const lastDate = new Date(fmtDate(last.TradeDate));
    const start = startForRange(lastDate, range);
    const sliced =
      start === null
        ? rowsAsc
        : rowsAsc.filter((r) => new Date(fmtDate(r.TradeDate)) >= start);

    // compute MA7 for Close
    const closeSeries = sliced.map((d) => d.Close);
    const ma7 = sma(closeSeries, 7);

    return sliced.map((d, i) => ({
      date: fmtDate(d.TradeDate),
      Close: d.Close,
      Volume: d.Volume,
      ValueTraded: d.ValueTraded,
      MA7: ma7[i],
    }));
  }, [rowsAsc, range]);

  const volumeMax = useMemo(
    () => chartData.reduce((m, d) => Math.max(m, d.Volume || 0), 0),
    [chartData]
  );
  const valueMax = useMemo(
    () => chartData.reduce((m, d) => Math.max(m, d.ValueTraded || 0), 0),
    [chartData]
  );

  const COLORS = {
    close: "#2563eb", // blue-600
    ma7: "#475569", // slate-600
    volume: "#f59e0b", // amber-500
    value: "#16a34a", // green-600
  };

  return (
    <TabsContent value="volume" className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Trading Volume</CardTitle>
            <CardDescription>
              Daily close, volume, and value traded from Yahoo Finance.
            </CardDescription>
          </div>
          {titleRight}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Controls (API) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Symbol</span>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.trim())}
                className="w-48"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">From</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={limit}
                onChange={(e) =>
                  setLimit(
                    Math.max(1, Math.min(365, Number(e.target.value || 30)))
                  )
                }
                className="w-24"
              />
            </div>

            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Reload"}
            </Button>
            <Button onClick={backfill} disabled={backfilling || !startDate}>
              {backfilling ? "Backfilling…" : "Backfill from Start"}
            </Button>
            <Button onClick={refreshToday} disabled={refreshing}>
              {refreshing ? "Recording…" : "Record Today"}
            </Button>
          </div>

          {/* Chart Filters (local) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {(["7D", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as RangeKey[]).map(
                (rk) => (
                  <Button
                    key={rk}
                    size="sm"
                    variant={range === rk ? "default" : "outline"}
                    onClick={() => setRange(rk)}
                    className="h-7"
                  >
                    {rk}
                  </Button>
                )
              )}
            </div>

            <div className="mx-2 h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <label className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                />
                Price
              </label>
              <label className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showMA7}
                  onChange={(e) => setShowMA7(e.target.checked)}
                />
                MA(7)
              </label>
              <label className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showVolume}
                  onChange={(e) => setShowVolume(e.target.checked)}
                />
                Volume
              </label>
              <label className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showValue}
                  onChange={(e) => setShowValue(e.target.checked)}
                />
                Value
              </label>
            </div>

            <div className="mx-2 h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Min Volume</span>
              <Input
                type="number"
                className="w-32"
                placeholder="0"
                value={minVolume}
                onChange={(e) => setMinVolume(e.target.value)}
              />
              <label className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={onlyPositive}
                  onChange={(e) => setOnlyPositive(e.target.checked)}
                />
                Only positive price/vol
              </label>
            </div>
          </div>

          {/* Chart container (identical border/rounded as table) */}
          <div className="w-full border rounded-md p-2 h-[520px]">
            {chartData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                No chart data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 128, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    minTickGap={24}
                    tick={{ fontSize: 12 }}
                  />
                  {/* Left Y for Price (and MA) */}
                  <YAxis
                    yAxisId="left"
                    width={54}
                    tickFormatter={(v) =>
                      `₹${Number(v).toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}`
                    }
                    tick={{ fontSize: 12 }}
                  />
                  {/* Right Y for Volume/Value */}
                  {/* Right Y for Volume */}
                  <YAxis
                    yAxisId="rightVol"
                    orientation="right"
                    width={52}
                    domain={[0, Math.ceil(volumeMax * 1.1) || 1]}
                    tickFormatter={(v) => shortNum(Number(v))}
                    tick={{ fontSize: 12 }}
                    axisLine={true}
                    tickLine={false}
                  />

                  {/* Outer Right Y for Value (₹) */}
                  <YAxis
                    yAxisId="rightVal"
                    orientation="right"
                    width={72}
                    domain={[0, Math.ceil(valueMax * 1.1) || 1]}
                    tickFormatter={(v) =>
                      `₹${Number(v).toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}`
                    }
                    tick={{ fontSize: 12 }}
                    axisLine={true}
                    tickLine={false}
                  />

                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === "Close" || name === "MA(7)") {
                        return [fmtINR(Number(value)), name];
                      }
                      if (name === "Volume") {
                        return [fmtNum(Number(value)), name];
                      }
                      if (name === "Value") {
                        return [fmtINR(Number(value)), name];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ fontSize: 12 }}
                  />

                  {showPrice && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Close"
                      name="Close"
                      dot={false}
                      strokeWidth={2}
                      stroke={COLORS.close}
                      activeDot={{ r: 4 }}
                    />
                  )}
                  {showMA7 && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="MA7"
                      name="MA(7)"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      strokeOpacity={0.9}
                      stroke={COLORS.ma7}
                    />
                  )}
                  {showVolume && (
                    <Line
                      yAxisId="rightVol"
                      type="monotone"
                      dataKey="Volume"
                      name="Volume"
                      dot={false}
                      strokeWidth={2}
                      stroke={COLORS.volume}
                    />
                  )}
                  {showValue && (
                    <Line
                      yAxisId="rightVal"
                      type="monotone"
                      dataKey="ValueTraded"
                      name="Value"
                      dot={false}
                      strokeWidth={2}
                      stroke={COLORS.value}
                    />
                  )}

                  <Brush
                    dataKey="date"
                    height={20}
                    stroke="#94a3b8"
                    travellerWidth={10}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Existing table */}
          <div className="w-full overflow-auto border rounded-md">
            <table className="min-w-[640px] w-full table-fixed border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 bg-white text-left border px-3 py-2 w-[130px]">
                    Date
                  </th>
                  <th className="sticky top-0 bg-white text-left border px-3 py-2 w-[180px]">
                    Close
                  </th>
                  <th className="sticky top-0 bg-white text-left border px-3 py-2 w-[180px]">
                    Volume
                  </th>
                  <th className="sticky top-0 bg-white text-left border px-3 py-2 w-[220px]">
                    Value Traded
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center h-20 border">
                      No data yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={`${r.Symbol}-${r.TradeDate}`}>
                      <td className="border px-3 py-2">
                        {fmtDate(r.TradeDate)}
                      </td>
                      <td className="border px-3 py-2">{fmtINR(r.Close)}</td>
                      <td className="border px-3 py-2">{fmtNum(r.Volume)}</td>
                      <td className="border px-3 py-2">
                        {fmtINR(r.ValueTraded)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
