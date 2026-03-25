"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

export function TestToolsPanel() {
  const [scanId, setScanId] = useState("");
  const [forceRescanDealId, setForceRescanDealId] = useState("");
  const [dryRunJson, setDryRunJson] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [outboxBusy, setOutboxBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);

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

  async function processOutbox() {
    setOutboxBusy(true);
    try {
      const res = await fetch("/api/owner/process-outbox", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const { processed, sent, failed } = json as { processed: number; sent: number; failed: number };
      if (processed === 0) {
        toast("No queued emails to process", "info");
      } else {
        toast(`Processed ${processed}: ${sent} sent, ${failed} failed`, sent > 0 ? "info" : "error");
      }
      setDryRunJson(JSON.stringify(json, null, 2));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setOutboxBusy(false);
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

  async function forceRescan() {
    const id = forceRescanDealId.trim();
    if (!id) {
      toast("Enter a deal ID", "error");
      return;
    }
    setRescanBusy(true);
    try {
      const res = await fetch("/api/deals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: id, force: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rescan failed");
      setDryRunJson(JSON.stringify(json, null, 2));
      const score = json.risk_index_score;
      const band = json.risk_index_band;
      if (json.reused) {
        toast(`Cached: ${score} (${band})`, "info");
      } else {
        toast(`Scan complete: ${score ?? json.scan_id?.slice(0, 8)} (${band ?? "—"})`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setRescanBusy(false);
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
          Resend test email, process queued emails, risk index dry-run (no OpenAI), and AI insights for a scan in your current workspace (requires PRO+ entitlements and the ai-insights flag).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Email</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void sendTestEmail()}>
              Send test email
            </Button>
            <Button type="button" variant="outline" disabled={outboxBusy} onClick={() => void processOutbox()}>
              {outboxBusy ? "Processing…" : "Process email queue"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Process email queue</strong> manually runs the cron outbox processor — use this after sending an invite to deliver it immediately instead of waiting for the cron job.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => void runDryScan()}>
            Run risk index dry-run
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Force rescan (bypass all caches)</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={forceRescanDealId}
              onChange={(e) => setForceRescanDealId(e.target.value)}
              placeholder="Deal UUID"
              className="font-mono text-xs sm:max-w-md"
            />
            <Button type="button" variant="secondary" disabled={rescanBusy} onClick={() => void forceRescan()}>
              {rescanBusy ? "Scanning…" : "Force Rescan"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Bypasses all cache layers (text-hash, scoring-input-hash) and forces fresh AI extraction + scoring. Owner-only.
          </p>
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
