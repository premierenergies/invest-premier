// src/components/charts/CategoryTimelineChart.tsx
import React, { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    // Map categories to monthly totals
    const catMap: Record<string, Record<string, number>> = {};
    categories.forEach((cat) => {
      catMap[cat] = {};
      availableMonths.forEach((m) => {
        catMap[cat][m] = 0;
      });
    });
    data.forEach((inv) => {
      availableMonths.forEach((m) => {
        catMap[inv.category][m] += inv.monthlyShares[m] || 0;
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
    if (clubs.length >= 2) {
      clubs.forEach((club, idx) => {
        const color = palette[idx % palette.length];
        const points = availableMonths.map((m) =>
          club.categories.reduce((sum, c) => sum + (catMap[c][m] || 0), 0)
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
      categories.forEach((cat, idx) => {
        const color = palette[idx % palette.length];
        const points = availableMonths.map((m) => catMap[cat][m]);
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

    const chartData: ChartData<"line", number[], string> = {
      labels: availableMonths,
      datasets,
    };
    const chartOptions: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Month" } },
        y: {
          title: { display: true, text: "Total Shares" },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
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
  }, [data, availableMonths, categories, clubs]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Shares by Category Over Time</CardTitle>
            <CardDescription>
              Create and compare custom clubs of categories.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[400px]">
          <canvas ref={canvasRef} />
        </div>
      </CardContent>
    </Card>
  );
}
