"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";

type FlagRow = {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/feature-flags");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setFlags(json.flags ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(id: string, enabled: boolean) {
    try {
      const res = await fetch("/api/owner/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: !enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !enabled } : f)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  async function addFlag(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/owner/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          enabled: false,
          description: newDesc.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      setNewName("");
      setNewDesc("");
      await load();
      toast("Flag created", "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    }
  }

  async function removeFlag(id: string) {
    if (!confirm("Delete this flag?")) return;
    try {
      const res = await fetch(`/api/owner/feature-flags?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setFlags((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature flags</CardTitle>
        <CardDescription>CRUD on the feature_flags table; writes clear the in-process flag cache.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={addFlag} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid flex-1 gap-2 sm:min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">New flag name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. ai-insights" />
          </div>
          <div className="grid flex-1 gap-2 sm:min-w-[240px]">
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What this toggles" />
          </div>
          <Button type="submit">Add flag</Button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : flags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No flags yet.
                  </TableCell>
                </TableRow>
              ) : (
                flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.name}</TableCell>
                    <TableCell>
                      <Switch checked={f.enabled} onCheckedChange={() => void toggleFlag(f.id, f.enabled)} />
                    </TableCell>
                    <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                      {f.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeFlag(f.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
