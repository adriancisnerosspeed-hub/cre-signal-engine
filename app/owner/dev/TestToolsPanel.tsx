"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

export function TestToolsPanel() {
  const [scanId, setScanId] = useState("");
  const [dryRunJson, setDryRunJson] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  async function sendTestEmail() {
    try {
      const res = await fetch("/api/owner/test-email", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast("Test email sent", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function runDryScan() {
    try {
      const res = await fetch("/api/owner/test-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setDryRunJson(JSON.stringify(json, null, 2));
      toast("Dry run complete", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function fetchAiInsights() {
    const id = scanId.trim();
    if (!id) {
      toast("Enter a deal scan ID", "error");
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch(`/api/deals/scans/${encodeURIComponent(id)}/ai-insights`, { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setDryRunJson(JSON.stringify(json, null, 2));
      toast("AI insights response loaded", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test tools</CardTitle>
        <CardDescription>
          Resend test email, risk index dry-run (no OpenAI), and AI insights for a scan in your current workspace (requires PRO+ entitlements and the ai-insights flag).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void sendTestEmail()}>
            Send test email
          </Button>
          <Button type="button" variant="outline" onClick={() => void runDryScan()}>
            Run risk index dry-run
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">AI insights (GET existing route)</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
              placeholder="Deal scan UUID"
              className="font-mono text-xs sm:max-w-md"
            />
            <Button type="button" variant="secondary" disabled={aiBusy} onClick={() => void fetchAiInsights()}>
              {aiBusy ? "Loading…" : "Fetch AI insights"}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Stripe webhook</p>
          <p className="text-sm text-muted-foreground">
            Send a signed test event from your machine:{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">stripe trigger checkout.session.completed</code>{" "}
            with your CLI pointed at the same webhook secret as production, or use the Debug tab for configuration status.
          </p>
        </div>

        {dryRunJson ? (
          <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">{dryRunJson}</pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
