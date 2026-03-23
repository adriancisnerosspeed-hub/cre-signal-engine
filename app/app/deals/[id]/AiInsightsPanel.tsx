"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type InsightItem = {
  text: string;
  source?: string;
  confidence?: string;
  macro_context?: string;
};

type ApiOk = {
  supplemental: boolean;
  insights: InsightItem[] | unknown;
  model?: string | null;
  disclaimer?: string;
  cached?: boolean;
};

function normalizeInsights(raw: unknown): InsightItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is InsightItem =>
      typeof i === "object" &&
      i !== null &&
      "text" in i &&
      typeof (i as InsightItem).text === "string"
  );
}

export function AiInsightsPanel({ scanId }: { scanId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/scans/${encodeURIComponent(scanId)}/ai-insights`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiOk & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  const insights = data ? normalizeInsights(data.insights) : [];

  return (
    <section className="mb-8">
      <Card className="border-foreground/15 bg-card/40">
        <CardHeader className="border-b border-foreground/10 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Supplemental AI Insights</CardTitle>
              <CardDescription className="text-muted-foreground mt-1 max-w-prose">
                Non-deterministic market and macro context — separate from the Risk Index.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Show</span>
              <Switch
                checked={open}
                onCheckedChange={(v) => {
                  setOpen(!!v);
                  if (v && !data && !loading) void load();
                }}
                aria-label="Toggle supplemental AI insights"
              />
            </div>
          </div>
        </CardHeader>
        {open && (
          <CardContent className="pt-4">
            <div
              className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
              role="status"
            >
              <strong className="font-semibold">Supplemental Predictive Layer — Human Judgment Required.</strong>{" "}
              These signals do not modify the CRE Signal Risk Index™ and are not a substitute for diligence.
            </div>

            {loading && (
              <p className="text-muted-foreground text-sm">Loading insights…</p>
            )}
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            {!loading && !error && data && (
              <>
                {data.disclaimer && (
                  <p className="text-muted-foreground mb-4 text-xs leading-relaxed">{data.disclaimer}</p>
                )}
                {data.cached && (
                  <p className="text-muted-foreground mb-3 text-xs">Showing cached results.</p>
                )}
                {insights.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No insight bullets returned.</p>
                ) : (
                  <ul className="space-y-4">
                    {insights.map((item, idx) => (
                      <li
                        key={idx}
                        className={cn(
                          "border-foreground/10 rounded-lg border px-3 py-2",
                          "bg-muted/30"
                        )}
                      >
                        <p className="text-foreground text-sm leading-relaxed">{item.text}</p>
                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {item.source && (
                            <span>
                              Source: <span className="text-foreground/80">{item.source}</span>
                            </span>
                          )}
                          {item.confidence && (
                            <span>
                              Confidence:{" "}
                              <span className="text-foreground/80">{item.confidence}</span>
                            </span>
                          )}
                          {item.macro_context && (
                            <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                              Macro: <span className="text-foreground/80">{item.macro_context}</span>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.model && (
                  <p className="text-muted-foreground mt-4 text-xs">Model: {data.model}</p>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>
    </section>
  );
}
