"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

const PLANS = ["FREE", "PRO", "PRO+", "ENTERPRISE"] as const;

export function TierSetterPanel({
  organizations,
}: {
  organizations: { id: string; plan: string; created_at: string }[];
}) {
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [plan, setPlan] = useState<(typeof PLANS)[number]>("FREE");
  const [busy, setBusy] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const id = orgId.trim();
    if (!id) {
      toast("Select or enter an organization ID", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/owner/tier-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: id, plan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast(`Plan set to ${plan} (was ${json.previous_plan})`, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tier override</CardTitle>
        <CardDescription>
          Updates organizations.plan for QA (service role). Stripe billing may overwrite this on the next webhook — use for short-lived tests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void apply(e)} className="max-w-lg space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Workspace</label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={organizations.some((o) => o.id === orgId) ? orgId : ""}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.plan} — {o.id.slice(0, 8)}…
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Or paste a full organization UUID:</p>
            <input
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Plan</label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value as (typeof PLANS)[number])}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Apply plan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
