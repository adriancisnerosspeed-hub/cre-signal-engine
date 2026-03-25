"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { computeRiskIndex, RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { normalizeAssumptionsForScoringWithFlags } from "@/lib/assumptionNormalization";
import { applySeverityOverride } from "@/lib/riskSeverityOverrides";
import type { DealScanAssumptions, DealScanRisk } from "@/lib/dealScanContract";
import { toast } from "@/lib/toast";

function thumbValue(v: number | readonly number[]): number {
  return typeof v === "number" ? v : v[0] ?? 0;
}

const BASE_RISKS: DealScanRisk[] = [
  {
    risk_type: "DebtCostRisk",
    severity: "High",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "High",
    evidence_snippets: [],
  },
  {
    risk_type: "RefiRisk",
    severity: "High",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "High",
    evidence_snippets: [],
  },
  {
    risk_type: "MarketLiquidityRisk",
    severity: "Medium",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "Medium",
    evidence_snippets: [],
  },
  {
    risk_type: "ExitCapCompression",
    severity: "Medium",
    what_changed_or_trigger: "Sandbox",
    why_it_matters: "Test",
    who_this_affects: "Test",
    recommended_action: "Monitor",
    confidence: "High",
    evidence_snippets: [],
  },
];

export function RiskSandboxPanel() {
  const [ltv, setLtv] = useState(75);
  const [vacancy, setVacancy] = useState(8);
  const [capIn, setCapIn] = useState(5.5);
  const [exitCap, setExitCap] = useState(5.25);
  const [hold, setHold] = useState(5);
  const [debtRate, setDebtRate] = useState(6.5);

  const result = useMemo(() => {
    const assumptions: DealScanAssumptions = {
      ltv: { value: ltv, unit: "%", confidence: "High" },
      vacancy: { value: vacancy, unit: "%", confidence: "High" },
      cap_rate_in: { value: capIn, unit: "%", confidence: "High" },
      exit_cap: { value: exitCap, unit: "%", confidence: "High" },
      hold_period_years: { value: hold, unit: "years", confidence: "High" },
      debt_rate: { value: debtRate, unit: "%", confidence: "High" },
    };
    const { assumptions: assumptionsForScoring } = normalizeAssumptionsForScoringWithFlags(assumptions);
    const stabilizedRisks = BASE_RISKS.map((r) => ({
      ...r,
      severity_current: applySeverityOverride(r.risk_type, r.severity, assumptionsForScoring, { hasConstructionKeywords: false }),
    }));
    return computeRiskIndex({
      risks: stabilizedRisks.map((r) => ({
        severity_current: r.severity_current,
        confidence: r.confidence,
        risk_type: r.risk_type,
      })),
      assumptions: assumptionsForScoring,
      macroLinkedCount: 0,
    });
  }, [ltv, vacancy, capIn, exitCap, hold, debtRate]);

  async function downloadPdf() {
    try {
      const { buildIcMemoPdf } = await import("@/lib/export/buildIcMemoPdf");
      const drivers = (result.breakdown.top_drivers ?? []).join(", ");
      const narrative = [
        "Risk sandbox (owner dev) — sample export.",
        `Methodology version: ${RISK_INDEX_VERSION}`,
        `Score: ${result.score} — band: ${result.band}`,
        drivers ? `Top drivers: ${drivers}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const bytes = await buildIcMemoPdf({
        narrative,
        dealName: "Risk sandbox",
        scanCreatedAt: new Date().toISOString(),
        scanId: null,
        riskIndexScore: result.score,
        riskIndexBand: result.band,
      });

      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cre-signal-risk-sandbox.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF export failed", "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk index sandbox</CardTitle>
        <CardDescription>
          Client-side risk index computation with slider assumptions — same math as production; no OpenAI or database writes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>LTV</span>
              <span>{ltv}%</span>
            </div>
            <Slider min={50} max={90} value={[ltv]} onValueChange={(v) => setLtv(thumbValue(v))} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Vacancy</span>
              <span>{vacancy}%</span>
            </div>
            <Slider min={0} max={40} value={[vacancy]} onValueChange={(v) => setVacancy(thumbValue(v))} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cap rate in</span>
              <span>{capIn.toFixed(2)}%</span>
            </div>
            <Slider min={3} max={12} step={0.05} value={[capIn]} onValueChange={(v) => setCapIn(thumbValue(v))} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Exit cap</span>
              <span>{exitCap.toFixed(2)}%</span>
            </div>
            <Slider min={3} max={12} step={0.05} value={[exitCap]} onValueChange={(v) => setExitCap(thumbValue(v))} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Debt rate</span>
              <span>{debtRate.toFixed(2)}%</span>
            </div>
            <Slider min={3} max={10} step={0.05} value={[debtRate]} onValueChange={(v) => setDebtRate(thumbValue(v))} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Hold (years)</span>
              <span>{hold}</span>
            </div>
            <Slider min={1} max={15} value={[hold]} onValueChange={(v) => setHold(thumbValue(v))} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-2xl font-semibold tabular-nums">
            {result.score}{" "}
            <span className="text-base font-normal text-muted-foreground">({result.band})</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Version {RISK_INDEX_VERSION} — structural {result.breakdown.structural_weight.toFixed(1)} · market{" "}
            {result.breakdown.market_weight.toFixed(1)}
          </p>
        </div>

        <Button type="button" variant="outline" onClick={() => void downloadPdf()}>
          Download sample PDF
        </Button>
      </CardContent>
    </Card>
  );
}
