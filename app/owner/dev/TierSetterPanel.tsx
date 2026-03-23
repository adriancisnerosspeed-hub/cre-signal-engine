"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

const PLANS = ["FREE", "PRO", "PRO+", "ENTERPRISE"] as const;

const PLAN_DISPLAY_NAMES: Record<(typeof PLANS)[number], string> = {
  FREE: "Free",
  PRO: "Starter",
  "PRO+": "Analyst",
  ENTERPRISE: "Fund / Enterprise",
};

export function TierSetterPanel({
  organizations,
}: {
  organizations: { id: string; plan: string; created_at: string }[];
}) {
  const router = useRouter();
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
      const displayName = PLAN_DISPLAY_NAMES[plan];
      const prevDisplay = PLAN_DISPLAY_NAMES[json.previous_plan as keyof typeof PLAN_DISPLAY_NAMES] ?? json.previous_plan;
      toast(`Plan set to ${displayName} (${plan}) — was ${prevDisplay} (${json.previous_plan})`, "info");
      router.refresh();
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
                  {PLAN_DISPLAY_NAMES[o.plan as keyof typeof PLAN_DISPLAY_NAMES] ?? o.plan} ({o.plan}) — {o.id.slice(0, 8)}…
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
                  {PLAN_DISPLAY_NAMES[p]} ({p})
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Apply plan"}
          </Button>
          {(plan === "PRO+" || plan === "ENTERPRISE") && (
            <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
              <strong>Reminder:</strong> AI Insights requires BOTH the plan (PRO+ or Enterprise) AND the{" "}
              <code className="font-mono">ai-insights</code> feature flag to be enabled in the{" "}
              <strong>Feature flags</strong> tab. If you don&apos;t see AI Insights after changing the tier, check that the flag is on.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
