"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

export function DebugPanel({
  profileSamples,
}: {
  profileSamples: { id: string; role: string | null; total_full_scans_used: number | null }[];
}) {
  const [userId, setUserId] = useState(profileSamples[0]?.id ?? "");
  const [statusJson, setStatusJson] = useState<string | null>(null);

  async function post(action: "stripe_webhook_status" | "reset_total_full_scans" | "clear_usage_daily_for_user") {
    try {
      const body: { action: string; user_id?: string } = { action };
      if (action !== "stripe_webhook_status") {
        const id = userId.trim();
        if (!id) {
          toast("Pick or enter a profile user id", "error");
          return;
        }
        body.user_id = id;
      }
      const res = await fetch("/api/owner/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setStatusJson(JSON.stringify(json, null, 2));
      toast("OK", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debug quick-fixes</CardTitle>
        <CardDescription>
          Owner-only maintenance actions. Prefer staging; destructive operations affect real data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Profile (user id)</label>
          <select
            className="mb-2 flex h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs"
            value={profileSamples.some((p) => p.id === userId) ? userId : ""}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="" disabled>
              Sample profiles…
            </option>
            {profileSamples.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.slice(0, 8)}… — scans {p.total_full_scans_used ?? 0} ({p.role ?? "user"})
              </option>
            ))}
          </select>
          <Input
            className="font-mono text-xs"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User UUID"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void post("stripe_webhook_status")}>
            Stripe webhook status
          </Button>
          <Button type="button" variant="secondary" onClick={() => void post("reset_total_full_scans")}>
            Reset total full scans
          </Button>
          <Button type="button" variant="destructive" onClick={() => void post("clear_usage_daily_for_user")}>
            Clear usage_daily rows
          </Button>
        </div>

        {statusJson ? (
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">{statusJson}</pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
