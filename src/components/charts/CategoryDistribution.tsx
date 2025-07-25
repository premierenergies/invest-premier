// src/components/charts/CategoryDistributionChart.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
  PieController
} from 'chart.js';
import { Investor } from '@/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  PieController
);

interface Club {
  id: number;
  name: string;
  categories: string[];
}

interface CategoryDistributionProps {
  investors: Investor[];
}

export default function CategoryDistribution({ investors }: CategoryDistributionProps) {
  const pieRef = useRef<HTMLCanvasElement | null>(null);
  const pieInstance = useRef<ChartJS | null>(null);

  // derive unique categories
  const categories = useMemo(
    () => Array.from(new Set(investors.map(inv => inv.category || 'Unknown'))),
    [investors]
  );

  // clubs state
  const [clubs, setClubs] = useState<Club[]>([]);
  const [nextId, setNextId] = useState(1);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [newName, setNewName] = useState('');
  const [newCats, setNewCats] = useState<string[]>([]);

  const openCreator = () => {
    setEditingClub({ id: -1, name: '', categories: [] });
    setNewName('');
    setNewCats([]);
  };
  const openEditor = (club: Club) => {
    setEditingClub({ ...club });
    setNewName(club.name);
    setNewCats([...club.categories]);
  };
  const saveClub = () => {
    if (!newName.trim() || newCats.length < 1) return;
    if (editingClub?.id === -1) {
      setClubs(prev => [...prev, { id: nextId, name: newName.trim(), categories: newCats }]);
      setNextId(prev => prev + 1);
    } else if (editingClub) {
      setClubs(prev => prev.map(c => c.id === editingClub.id ? { ...c, name: newName.trim(), categories: newCats } : c));
    }
    setEditingClub(null);
  };
  const cancelEdit = () => setEditingClub(null);
  const removeClub = (id: number) => setClubs(prev => prev.filter(c => c.id !== id));

  // compute counts for pie (club or raw categories)
  const pieCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (clubs.length > 0) {
      // for each club
      clubs.forEach(club => {
        counts[club.name] = investors.filter(inv => club.categories.includes(inv.category)).length;
      });
      // remaining categories
      const used = new Set(clubs.flatMap(c => c.categories));
      categories.filter(cat => !used.has(cat)).forEach(cat => {
        counts[cat] = investors.filter(inv => inv.category === cat).length;
      });
    } else {
      categories.forEach(cat => {
        counts[cat] = investors.filter(inv => inv.category === cat).length;
      });
    }
    return counts;
  }, [investors, clubs, categories]);

  // render pie
  useEffect(() => {
    if (!pieRef.current) return;
    pieInstance.current?.destroy();
    const labels = Object.keys(pieCounts);
    const data = Object.values(pieCounts);
    const palette = [
      'rgba(6, 182, 212, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)',
      'rgba(245, 158, 11, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(168, 85, 247, 0.7)',
      'rgba(236, 72, 153, 0.7)', 'rgba(34, 197, 94, 0.7)', 'rgba(251, 191, 36, 0.7)',
      'rgba(156, 163, 175, 0.7)'
    ];
    const bg = labels.map((_, i) => palette[i % palette.length]);
    const chartData: ChartData<'pie', number[], string> = { labels, datasets: [{ data, backgroundColor: bg, borderColor: 'white', borderWidth: 1 }] };
    const chartOpts: ChartOptions<'pie'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val = ctx.raw as number;
              const tot = data.reduce((s, v) => s + v, 0);
              return `${ctx.label}: ${val} (${Math.round(val/tot*100)}%)`;
            }
          }
        }
      }
    };
    const ctx = pieRef.current.getContext('2d');
    if (ctx) pieInstance.current = new ChartJS(ctx, { type: 'pie', data: chartData, options: chartOpts });
    return () => pieInstance.current?.destroy();
  }, [pieCounts]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Investor Categories</CardTitle>
        <CardDescription>Distribution of investors by category</CardDescription>

        <div className="mt-4">
          <Popover open={editingClub != null} onOpenChange={open => { if (!open) cancelEdit(); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" onClick={openCreator}>Create Club</Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="w-64">
              <div className="space-y-2">
                <Label>Club Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Enter club name" />
                <Label>Select Categories</Label>
                <ScrollArea className="h-40">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center py-1">
                      <Checkbox
                        id={`cat-${cat}`}
                        checked={newCats.includes(cat)}
                        onCheckedChange={checked => setNewCats(prev => checked ? [...prev, cat] : prev.filter(x => x !== cat))}
                      />
                      <Label htmlFor={`cat-${cat}`} className="ml-2">{cat}</Label>
                    </div>
                  ))}
                </ScrollArea>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                  <Button onClick={saveClub} disabled={!newName.trim() || newCats.length < 1}>Save</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="mt-4 flex flex-wrap gap-2">
            {clubs.map(c => (
              <Badge
                key={c.id}
                variant="secondary"
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => openEditor(c)}
              >
                {c.name}
                <X
                  className="h-4 w-4"
                  onClick={e => { e.stopPropagation(); removeClub(c.id); }}
                />
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]"><canvas ref={pieRef} /></div>
      </CardContent>
    </Card>
  );
}
