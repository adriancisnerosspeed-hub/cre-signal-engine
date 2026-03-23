"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { captureClientEvent } from "@/lib/analyticsClient";

const DEAL_TYPES = [
  "Multifamily",
  "Office",
  "Industrial",
  "Retail",
  "Hospitality",
  "Mixed-use",
  "Other",
] as const;

type DealType = (typeof DEAL_TYPES)[number];

export default function DemoSnapshotForm({ className }: { className?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [dealType, setDealType] = useState<DealType>("Multifamily");
  const [rawAssumptions, setRawAssumptions] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/leads/demo-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          firm: firm.trim(),
          dealType,
          rawAssumptions: rawAssumptions.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
        return;
      }
      setStatus("success");
      setMessage("Check your inbox for the sample PDF and booking link.");
      captureClientEvent("demo_snapshot_lead_submitted", {
        deal_type: dealType,
      });
      setName("");
      setEmail("");
      setFirm("");
      setRawAssumptions("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <Card
      className={cn(
        "border-border bg-card text-card-foreground shadow-lg ring-1 ring-black/5 dark:bg-card/95 dark:ring-white/10",
        className
      )}
      size="sm"
    >
      <CardHeader className="gap-1">
        <CardTitle className="text-lg font-semibold tracking-tight">
          Instant Risk Snapshot
        </CardTitle>
        <CardDescription>
          Get a personalized sample IC memo PDF — no login. We will email it with a short booking
          link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="demo-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="demo-name"
              name="name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background"
              placeholder="Alex Morgan"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="demo-email" className="text-xs font-medium text-muted-foreground">
              Work email
            </label>
            <Input
              id="demo-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background"
              placeholder="you@firm.com"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="demo-firm" className="text-xs font-medium text-muted-foreground">
              Firm
            </label>
            <Input
              id="demo-firm"
              name="firm"
              required
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              className="bg-background"
              placeholder="Atlas Capital Partners"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="demo-deal-type" className="text-xs font-medium text-muted-foreground">
              Deal type
            </label>
            <select
              id="demo-deal-type"
              name="dealType"
              value={dealType}
              onChange={(e) => setDealType(e.target.value as DealType)}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="demo-raw" className="text-xs font-medium text-muted-foreground">
              Optional: paste assumptions (JSON or notes)
            </label>
            <textarea
              id="demo-raw"
              name="rawAssumptions"
              rows={3}
              value={rawAssumptions}
              onChange={(e) => setRawAssumptions(e.target.value)}
              className="min-h-[72px] w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder='e.g. {"noi": 2.1e6, "ltv": 0.62} or free text'
            />
          </div>
          <Button
            type="submit"
            disabled={status === "loading"}
            className="mt-1 w-full bg-blue-600 text-white hover:bg-blue-500"
            size="lg"
          >
            {status === "loading" ? "Sending…" : "Email my sample IC memo"}
          </Button>
          {message && (
            <p
              className={cn(
                "text-center text-sm",
                status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}
              role="status"
            >
              {message}
            </p>
          )}
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            Sample output is illustrative. Not investment advice. By submitting, you agree we may
            follow up about CRE Signal Engine.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
