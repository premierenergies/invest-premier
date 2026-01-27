import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

type MonthlyInvestorDataLike = {
  pan?: string | null;
  name: string;
  category?: string | null;
};

type GroupMember = { key: string; pan?: string | null; name?: string | null };
type GroupRow = {
  id: number;
  name: string;
  category: string | null;
  memberCount: number;
  members: GroupMember[];
};

function apiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return window.location.origin;
}
const API = `${apiBase()}/api`;

function normPan(v?: string | null) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return s || null;
}

function entityKey(inv: MonthlyInvestorDataLike) {
  const p = normPan(inv.pan ?? null);
  return p || String(inv.name ?? "").trim();
}

export default function GroupsTab({
  data,
}: {
  data: MonthlyInvestorDataLike[];
}) {
  const { toast } = useToast();

  const entities = useMemo(() => {
    return (data || [])
      .map((d) => ({
        key: entityKey(d),
        name: String(d.name ?? "").trim(),
        pan: normPan(d.pan ?? null),
        category: d.category ?? null ? String(d.category).trim() : null,
      }))
      .filter((x) => x.key && x.name);
  }, [data]);

  const entityByKey = useMemo(() => {
    const m = new Map<string, (typeof entities)[number]>();
    for (const e of entities) m.set(e.key, e);
    return m;
  }, [entities]);

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => groups.find((g) => g.id === selectedId) || null,
    [groups, selectedId]
  );

  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await axios.get<GroupRow[]>(`${API}/groups`, {
        withCredentials: true,
      });
      setGroups(r.data || []);
      // keep selection if exists
      if (
        selectedId != null &&
        !(r.data || []).some((g) => g.id === selectedId)
      ) {
        setSelectedId(null);
      }
    } catch (e) {
      console.error("groups load failed", e);
      toast({
        title: "Failed to load groups",
        description: "Check server logs / network.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Create/Edit dialog state ----
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<number | null>(null);

  const [gName, setGName] = useState("");
  const [memberKeys, setMemberKeys] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [gCategory, setGCategory] = useState<string>("");

  const selectedMembers = useMemo(() => {
    return memberKeys.map((k) => {
      const e = entityByKey.get(k);
      return {
        key: k,
        name: e?.name ?? k,
        pan: e?.pan ?? null,
        category: e?.category ?? null,
      };
    });
  }, [memberKeys, entityByKey]);

  const distinctCats = useMemo(() => {
    const s = new Set<string>();
    for (const m of selectedMembers) if (m.category) s.add(m.category);
    return Array.from(s).sort();
  }, [selectedMembers]);

  const mustPickCategory = distinctCats.length > 1;

  // Auto-fill category if only 1
  useEffect(() => {
    if (distinctCats.length === 1) setGCategory(distinctCats[0]);
  }, [distinctCats]);

  const searchResults = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    const out: typeof entities = [];
    for (const e of entities) {
      if (out.length >= 40) break;
      const hay = `${e.name} ${e.key} ${e.category ?? ""}`.toLowerCase();
      if (hay.includes(q)) out.push(e);
    }
    return out;
  }, [memberSearch, entities]);

  function resetDialog() {
    setGName("");
    setMemberKeys([]);
    setMemberSearch("");
    setGCategory("");
    setEditId(null);
    setMode("create");
  }

  function openCreate() {
    resetDialog();
    setMode("create");
    setOpen(true);
  }

  function openEdit(g: GroupRow) {
    resetDialog();
    setMode("edit");
    setEditId(g.id);
    setGName(g.name);
    setMemberKeys((g.members || []).map((m) => m.key));
    setGCategory(g.category ?? "");
    setOpen(true);
  }

  async function saveGroup() {
    const name = gName.trim();
    if (!name) {
      toast({ title: "Group name is required" });
      return;
    }
    if (memberKeys.length === 0) {
      toast({ title: "Select at least 1 member" });
      return;
    }
    if (mustPickCategory && !gCategory.trim()) {
      toast({
        title: "Pick a Category",
        description:
          "Selected members have multiple categories. Choose one for the group.",
      });
      return;
    }

    const payload = {
      name,
      category: gCategory.trim() || null,
      members: memberKeys.map((k) => {
        const e = entityByKey.get(k);
        return { key: k, pan: e?.pan ?? null, name: e?.name ?? null };
      }),
    };

    try {
      if (mode === "create") {
        await axios.post(`${API}/groups`, payload, { withCredentials: true });
        toast({ title: "Group created" });
      } else {
        await axios.put(`${API}/groups/${editId}`, payload, {
          withCredentials: true,
        });
        toast({ title: "Group updated" });
      }
      setOpen(false);
      await refresh();
    } catch (e: any) {
      const status = e?.response?.status;
      const err = e?.response?.data?.error;

      if (status === 409 && err === "duplicate_name") {
        toast({
          title: "Duplicate group name",
          description: "Pick a different name.",
        });
        return;
      }
      if (status === 400 && err === "category_required") {
        const cats = e?.response?.data?.categories || [];
        toast({
          title: "Category required",
          description: `Pick one of: ${cats.join(", ")}`,
        });
        return;
      }

      console.error("saveGroup failed", e);
      toast({
        title: "Save failed",
        description: "Check server logs / network.",
      });
    }
  }

  async function deleteGroup(g: GroupRow) {
    const ok = window.confirm(
      `Delete group "${g.name}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await axios.delete(`${API}/groups/${g.id}`, { withCredentials: true });
      toast({ title: "Group deleted" });
      if (selectedId === g.id) setSelectedId(null);
      await refresh();
    } catch (e) {
      console.error("delete failed", e);
      toast({
        title: "Delete failed",
        description: "Check server logs / network.",
      });
    }
  }

  function addMember(k: string) {
    if (!k) return;
    setMemberKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
  }

  function removeMember(k: string) {
    setMemberKeys((prev) => prev.filter((x) => x !== k));
  }

  return (
    <TabsContent value="groups" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Groups</h2>
          <p className="text-sm text-muted-foreground">
            Club entities into named groups. If members span multiple
            categories, you can choose one category for the group.
          </p>
        </div>
        <Button onClick={openCreate}>Create Group</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: list */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>All Groups</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${groups.length} group(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No groups yet. Create your first group.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
                {groups.map((g) => {
                  const active = g.id === selectedId;
                  return (
                    <div
                      key={g.id}
                      className={`rounded-md border p-3 cursor-pointer ${
                        active ? "bg-muted" : "bg-background"
                      }`}
                      onClick={() => setSelectedId(g.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{g.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Category:{" "}
                            <span className="font-medium">
                              {g.category ?? "—"}
                            </span>{" "}
                            · Members:{" "}
                            <span className="font-medium">
                              {g.memberCount ?? (g.members?.length || 0)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => (e.stopPropagation(), openEdit(g))}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => (
                              e.stopPropagation(), deleteGroup(g)
                            )}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: details */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Group Details</CardTitle>
            <CardDescription>
              {selected
                ? "Members inside the selected group"
                : "Select a group to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-sm text-muted-foreground">
                Tip: Use <span className="font-medium">Create Group</span> to
                club investors (PAN preferred) and assign a single category.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold">{selected.name}</div>
                  <span className="text-xs rounded-full border px-2 py-0.5">
                    Category:{" "}
                    <span className="font-medium">
                      {selected.category ?? "—"}
                    </span>
                  </span>
                  <span className="text-xs rounded-full border px-2 py-0.5">
                    Members:{" "}
                    <span className="font-medium">
                      {selected.members?.length || 0}
                    </span>
                  </span>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-medium">
                    <div className="col-span-6">Name</div>
                    <div className="col-span-3">PAN/Key</div>
                    <div className="col-span-3">Category</div>
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    {(selected.members || []).map((m) => {
                      const e = entityByKey.get(m.key);
                      const name = e?.name ?? m.name ?? m.key;
                      const panOrKey = e?.pan ?? m.pan ?? m.key;
                      const cat = e?.category ?? null;

                      return (
                        <div
                          key={m.key}
                          className="grid grid-cols-12 px-3 py-2 text-sm border-t"
                        >
                          <div className="col-span-6 truncate">{name}</div>
                          <div className="col-span-3 truncate text-muted-foreground">
                            {panOrKey}
                          </div>
                          <div className="col-span-3 truncate">
                            {cat ?? "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openEdit(selected)}>
                    Edit Group
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteGroup(selected)}
                  >
                    Delete Group
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => (setOpen(v), !v && resetDialog())}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {mode === "create" ? "Create Group" : "Edit Group"}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="px-6 pb-6 overflow-auto min-h-0">
            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-6 space-y-3">
                <div className="space-y-1">
                  <Label>Group Name</Label>
                  <Input
                    value={gName}
                    onChange={(e) => setGName(e.target.value)}
                    placeholder="e.g. Top MF Houses"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Members ({memberKeys.length})</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => (setMemberKeys([]), setGCategory(""))}
                    >
                      Clear
                    </Button>
                  </div>

                  <div className="rounded-md border p-2 min-h-[92px] max-h-40 overflow-auto overscroll-contain">
                    {memberKeys.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No members selected yet.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedMembers.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => removeMember(m.key)}
                            className="text-xs rounded-full border px-2 py-1 hover:bg-muted"
                            title="Click to remove"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Click a member pill to remove it.
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>
                    Group Category{" "}
                    {mustPickCategory ? (
                      <span className="text-red-500">*</span>
                    ) : null}
                  </Label>

                  {mustPickCategory ? (
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={gCategory}
                      onChange={(e) => setGCategory(e.target.value)}
                    >
                      <option value="">Select a category…</option>
                      {distinctCats.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={gCategory || (distinctCats[0] ?? "")}
                      disabled
                      placeholder="Auto (single category)"
                    />
                  )}

                  {mustPickCategory ? (
                    <div className="text-xs text-muted-foreground">
                      Selected members span multiple categories:{" "}
                      {distinctCats.join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-6 space-y-3">
                <div className="space-y-1">
                  <Label>Add Members (search)</Label>
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name / PAN / category…"
                  />
                </div>

                <div className="rounded-md border overflow-hidden">
                  <div className="bg-muted px-3 py-2 text-xs font-medium">
                    Top matches
                  </div>

                  <div className="max-h-[340px] overflow-auto">
                    {memberSearch.trim() === "" ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">
                        Start typing to search entities (shows top matches
                        only).
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">
                        No matches.
                      </div>
                    ) : (
                      searchResults.map((e) => {
                        const added = memberKeys.includes(e.key);
                        return (
                          <div
                            key={e.key}
                            className="flex items-center justify-between gap-3 px-3 py-2 border-t"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {e.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {e.pan ?? e.key} · {e.category ?? "—"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={added ? "outline" : "default"}
                              disabled={added}
                              onClick={() => addMember(e.key)}
                            >
                              {added ? "Added" : "Add"}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fixed footer (always visible) */}
          <div className="px-6 py-4 border-t bg-background flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveGroup}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
