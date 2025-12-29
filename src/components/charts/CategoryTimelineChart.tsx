// src/components/charts/CategoryTimelineChart.tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
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
  LineController,
} from "chart.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import { MonthlyInvestorData } from "@/types";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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

interface Club {
  id: number;
  name: string;
  categories: string[];
}

interface CategoryTimelineChartProps {
  data: MonthlyInvestorData[];
  availableMonths: string[];
  categories: string[];
}

export default function CategoryTimelineChart({
  data,
  availableMonths,
  categories,
}: CategoryTimelineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS | null>(null);

  // Helper: format ISO date (YYYY-MM-DD) or Date -> DD-MM-YYYY
  const fmtDDMMYYYY = (d: string | Date): string => {
    if (d instanceof Date && !isNaN(+d)) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
    // Expecting "YYYY-MM-DD"
    if (typeof d === "string") {
      const parts = d.split("-");
      if (parts.length === 3) {
        const [yyyy, mm, dd] = parts;
        return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
      }
      // Fallback: try Date parse
      const dt = new Date(d);
      if (!isNaN(+dt)) return fmtDDMMYYYY(dt);
    }
    return String(d);
  };

  // Clubs state
  const [clubs, setClubs] = useState<Club[]>([]);
  const [nextId, setNextId] = useState(1);

  // Creation/editing state
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [newName, setNewName] = useState("");
  const [newCats, setNewCats] = useState<string[]>([]);
  const isCreating = editingClub?.id === -1;

  // Start creation
  const openCreator = () => {
    setEditingClub({ id: -1, name: "", categories: [] });
    setNewName("");
    setNewCats([]);
  };

  // Open editor
  const openEditor = (club: Club) => {
    setEditingClub({ ...club });
    setNewName(club.name);
    setNewCats([...club.categories]);
  };

  // Save club
  const saveClub = () => {
    if (!newName.trim() || newCats.length < 1) return;
    if (editingClub?.id === -1) {
      setClubs((prev) => [
        ...prev,
        { id: nextId, name: newName.trim(), categories: newCats },
      ]);
      setNextId((prev) => prev + 1);
    } else if (editingClub) {
      setClubs((prev) =>
        prev.map((c) =>
          c.id === editingClub.id
            ? { ...c, name: newName.trim(), categories: newCats }
            : c
        )
      );
    }
    setEditingClub(null);
  };

  // Cancel creation/edit
  const cancelEdit = () => setEditingClub(null);

  // Remove club
  const removeClub = (id: number) =>
    setClubs((prev) => prev.filter((c) => c.id !== id));

  /* -------------------- NEW: Filters like TopMovers -------------------- */
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const timePresets = [
    "Last Month",
    "Last 3 Months",
    "Last 6 Months",
    "Last Year",
    "All",
    "Custom",
  ];
  const [timeRange, setTimeRange] = useState<string>("All");
  const [customStart, setCustomStart] = useState<string>(
    availableMonths[0] || ""
  );
  const [customEnd, setCustomEnd] = useState<string>(
    availableMonths[availableMonths.length - 1] || ""
  );

  const [startMonth, endMonth] = useMemo(() => {
    const n = availableMonths.length;
    if (n === 0) return ["", ""];
    switch (timeRange) {
      case "Last Month":
        return [availableMonths[Math.max(0, n - 2)], availableMonths[n - 1]];
      case "Last 3 Months":
        return [availableMonths[Math.max(0, n - 4)], availableMonths[n - 1]];
      case "Last 6 Months":
        return [availableMonths[Math.max(0, n - 7)], availableMonths[n - 1]];
      case "Last Year":
        return [availableMonths[Math.max(0, n - 13)], availableMonths[n - 1]];
      case "Custom":
        return [
          customStart || availableMonths[0],
          customEnd || availableMonths[n - 1],
        ];
      case "All":
      default:
        return [availableMonths[0], availableMonths[n - 1]];
    }
  }, [timeRange, customStart, customEnd, availableMonths]);

  const months = useMemo(() => {
    if (!startMonth || !endMonth) return availableMonths;
    const s = availableMonths.indexOf(startMonth);
    const e = availableMonths.indexOf(endMonth);
    if (s === -1 || e === -1) return availableMonths;
    return availableMonths.slice(Math.min(s, e), Math.max(s, e) + 1);
  }, [availableMonths, startMonth, endMonth]);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    // Map categories to monthly totals
    const catMap: Record<string, Record<string, number>> = {};
    categories.forEach((cat) => {
      catMap[cat] = {};
      months.forEach((m) => {
        catMap[cat][m] = 0;
      });
    });
    data.forEach((inv) => {
      const cat = (inv.category ?? "") as string;
      if (!cat || !(cat in catMap)) return; // skip unknown/mixed/null
      months.forEach((m) => {
        catMap[cat][m] += inv.monthlyShares[m] || 0;
      });
    });

    // Color palette
    const palette = [
      "rgba(59, 130, 246, 1)",
      "rgba(16, 185, 129, 1)",
      "rgba(245, 158, 11, 1)",
      "rgba(239, 68, 68, 1)",
      "rgba(168, 85, 247, 1)",
      "rgba(236, 72, 153, 1)",
      "rgba(6, 182, 212, 1)",
      "rgba(34, 197, 94, 1)",
      "rgba(251, 191, 36, 1)",
      "rgba(156, 163, 175, 1)",
    ];

    // Build chart datasets
    const datasets: ChartData<"line", number[], string>["datasets"] = [];
    const allowedCats =
      selectedCategories.length > 0 ? new Set(selectedCategories) : null;
    if (clubs.length >= 2) {
      clubs.forEach((club, idx) => {
        const color = palette[idx % palette.length];
        const members = allowedCats
          ? club.categories.filter((c) => allowedCats.has(c))
          : club.categories;
        if (members.length === 0) return;
        const points = months.map((m) =>
          members.reduce((sum, c) => sum + (catMap[c][m] || 0), 0)
        );
        datasets.push({
          label: club.name,
          data: points,
          borderColor: color,
          backgroundColor: color.replace("1)", "0.1)"),
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        });
      });
    } else {
      (allowedCats
        ? categories.filter((c) => allowedCats.has(c))
        : categories
      ).forEach((cat, idx) => {
        const color = palette[idx % palette.length];
        const points = months.map((m) => catMap[cat][m]);
        datasets.push({
          label: cat,
          data: points,
          borderColor: color,
          backgroundColor: color.replace("1)", "0.1)"),
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
        });
      });
    }

    const formattedLabels = months.map((m) => fmtDDMMYYYY(m));
    const chartData: ChartData<"line", number[], string> = {
      labels: formattedLabels,
      datasets,
    };
    const chartOptions: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Month" },
          ticks: {
            // Ensure ticks show DD-MM-YYYY even if Chart.js reuses raw labels
            callback: (_value, index) => formattedLabels[index as number],
          },
        },
        y: {
          title: { display: true, text: "Total Shares" },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            title(items) {
              // Force tooltip title to DD-MM-YYYY
              const i = items[0]?.dataIndex ?? 0;
              return formattedLabels[i] ?? "";
            },
            label(ctx) {
              return `${
                ctx.dataset.label
              }: ${ctx.parsed.y.toLocaleString()} shares`;
            },
          },
        },
      },
    };

    const ctx = canvasRef.current.getContext("2d");
    if (ctx)
      chartRef.current = new ChartJS(ctx, {
        type: "line",
        data: chartData,
        options: chartOptions,
      });
    return () => chartRef.current?.destroy();
  }, [data, months, categories, clubs, selectedCategories]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Category multi-select */}
          <div className="flex-1 min-w-[220px]">
            <Label>Categories</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedCategories.length > 0
                    ? `${selectedCategories.length} selected`
                    : "All Categories"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60">
                <ScrollArea className="h-48">
                  {categories.map((cat) => (
                    <div key={cat} className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`cat-${cat}`}
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={(checked) =>
                          setSelectedCategories((prev) =>
                            checked
                              ? [...prev, cat]
                              : prev.filter((x) => x !== cat)
                          )
                        }
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

          {/* Time range */}
          <div className="flex-1 min-w-[200px]">
            <Label>Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {timePresets.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom start/end when needed */}
          {timeRange === "Custom" && (
            <>
              <div className="flex-1 min-w-[150px]">
                <Label>From</Label>
                <Select value={customStart} onValueChange={setCustomStart}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Start month" />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-40">
                      {availableMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
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
                      {availableMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <CardTitle className="mt-4">Shares by Category Over Time</CardTitle>
        <CardDescription>
          Sum of positions per category across the selected date window.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="h-[400px]">
          <canvas ref={canvasRef} />
        </div>
      </CardContent>
    </Card>
  );
}
