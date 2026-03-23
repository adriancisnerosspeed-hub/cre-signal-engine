"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";

const PLANS = ["FREE", "PRO", "PRO+", "ENTERPRISE"] as const;

const PLAN_DISPLAY_NAMES: Record<(typeof PLANS)[number], string> = {
  FREE: "Free",
  PRO: "Starter",
  "PRO+": "Analyst",
  ENTERPRISE: "Fund / Enterprise",
};

type FlagRow = {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
};

export function PlanAndFlagsPanel({
  organizations,
}: {
  organizations: { id: string; plan: string; created_at: string }[];
}) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const selectedOrg = organizations.find((o) => o.id === orgId);
  const currentPlanSlug = selectedOrg?.plan ?? "FREE";
  const currentPlanDisplay =
    PLAN_DISPLAY_NAMES[currentPlanSlug as keyof typeof PLAN_DISPLAY_NAMES] ?? currentPlanSlug;

  const [plan, setPlan] = useState<(typeof PLANS)[number]>(
    (currentPlanSlug as (typeof PLANS)[number]) ?? "FREE"
  );
  const [busy, setBusy] = useState(false);

  // Keep plan selector in sync when org selection changes
  function handleOrgChange(newOrgId: string) {
    setOrgId(newOrgId);
    const org = organizations.find((o) => o.id === newOrgId);
    if (org && (PLANS as readonly string[]).includes(org.plan)) {
      setPlan(org.plan as (typeof PLANS)[number]);
    }
  }

  // --- Feature flags state ---
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const res = await fetch("/api/owner/feature-flags");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setFlags(json.flags ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

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
      toast(`${flags.find((f) => f.id === id)?.name ?? "Flag"} ${!enabled ? "enabled" : "disabled"}`, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  // --- Tier override ---
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

  const hasMultipleOrgs = organizations.length > 1;

  return (
    <div className="space-y-6">
      {/* Tier override */}
      <Card>
        <CardHeader>
          <CardTitle>Plan &amp; tier override</CardTitle>
          <CardDescription>
            Change the workspace plan for QA testing. Stripe billing may overwrite this on the next webhook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void apply(e)} className="max-w-lg space-y-4">
            {hasMultipleOrgs ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Workspace</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={organizations.some((o) => o.id === orgId) ? orgId : ""}
                  onChange={(e) => handleOrgChange(e.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {organizations.map((o) => {
                    const dn = PLAN_DISPLAY_NAMES[o.plan as keyof typeof PLAN_DISPLAY_NAMES] ?? o.plan;
                    return (
                      <option key={o.id} value={o.id}>
                        {dn} ({o.plan}) — {o.id.slice(0, 8)}…
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : selectedOrg ? (
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Workspace</p>
                <p className="text-sm text-foreground">
                  {currentPlanDisplay} ({currentPlanSlug}) —{" "}
                  <span className="font-mono text-xs text-muted-foreground">{selectedOrg.id.slice(0, 8)}…</span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Change plan to</label>
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
          </form>
        </CardContent>
      </Card>

      {/* Feature flags */}
      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Toggle feature flags on or off. Changes clear the in-process flag cache immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {flagsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flags configured yet.</p>
          ) : (
            <div className="space-y-3">
              {flags.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <span className="font-mono text-sm text-foreground">{f.name}</span>
                    {f.description && (
                      <p className="text-xs text-muted-foreground">{f.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${f.enabled ? "text-green-400" : "text-muted-foreground"}`}>
                      {f.enabled ? "On" : "Off"}
                    </span>
                    <Switch checked={f.enabled} onCheckedChange={() => void toggleFlag(f.id, f.enabled)} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(plan === "PRO+" || plan === "ENTERPRISE") && (
            <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
              <strong>Tip:</strong> AI Insights requires BOTH the plan (PRO+ or Enterprise) AND the{" "}
              <code className="font-mono">ai-insights</code> flag above to be enabled.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
