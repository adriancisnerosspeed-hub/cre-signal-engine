"use client";

import { useState } from "react";
import ForceRescanButton from "@/app/app/deals/[id]/ForceRescanButton";

type Contribution = { driver: string; points: number };
type ContributionPct = { driver: string; pct: number };

type Breakdown = {
  structural_weight?: number;
  market_weight?: number;
  confidence_factor?: number;
  stabilizer_benefit?: number;
  penalty_total?: number;
  contributions?: Contribution[];
  contribution_pct?: ContributionPct[];
  top_drivers?: string[];
  tier_drivers?: string[];
  edge_flags?: string[];
  validation_errors?: string[];
  review_flag?: boolean;
  injected_risk_types?: string[];
  risk_fingerprint?: string;
  driver_confidence_multipliers?: { driver: string; multiplier: number }[];
};

type RiskSummary = {
  risk_type: string;
  severity_original: string;
  severity_current: string;
  confidence: string | null;
};

type Props = {
  dealId: string;
  scanId: string;
  scan: {
    id: string;
    score: number | null;
    band: string | null;
    version: string | null;
    model: string | null;
    promptVersion: string | null;
    inputTextHash: string | null;
    scoringInputHash: string | null;
    breakdown: Breakdown | null;
    extraction: Record<string, unknown>;
  };
  risks: RiskSummary[];
};

const SEV_POINTS: Record<string, number> = { High: 8, Medium: 4, Low: 2 };
const CONF_FACTOR: Record<string, number> = { High: 1, Medium: 0.7, Low: 0.4 };

function fmtPts(n: number): string {
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

export default function ScanDevTools({ dealId, scanId, scan, risks }: Props) {
  const [open, setOpen] = useState(false);
  const [showExtraction, setShowExtraction] = useState(false);
  const bd = scan.breakdown;

  const overriddenRisks = risks.filter(
    (r) => r.severity_original !== r.severity_current
  );
  const injectedTypes = new Set(bd?.injected_risk_types ?? []);

  return (
    <div className="mb-6 border border-amber-500/30 rounded-lg bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
      >
        <span>⚙ Scan Dev Tools</span>
        <span className="text-xs text-amber-400/60">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          {/* Force Rescan */}
          <div>
            <ForceRescanButton dealId={dealId} />
          </div>

          {/* Score + Hashes */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Scoring Identity
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <span className="text-gray-500">Score</span>
              <span className="text-gray-200 font-mono">
                {scan.score ?? "—"} ({scan.band ?? "—"})
              </span>
              <span className="text-gray-500">Version</span>
              <span className="text-gray-200 font-mono text-[11px]">{scan.version ?? "—"}</span>
              <span className="text-gray-500">Model</span>
              <span className="text-gray-200 font-mono text-[11px]">{scan.model ?? "—"}</span>
              <span className="text-gray-500">Prompt ver</span>
              <span className="text-gray-200 font-mono text-[11px]">{scan.promptVersion ?? "—"}</span>
              <span className="text-gray-500">Input text hash</span>
              <span className="text-gray-200 font-mono text-[11px]">
                {scan.inputTextHash?.slice(0, 16) ?? "—"}…
              </span>
              <span className="text-gray-500">Scoring input hash</span>
              <span className="text-gray-200 font-mono text-[11px]">
                {scan.scoringInputHash?.slice(0, 16) ?? "—"}…
              </span>
              <span className="text-gray-500">Scan ID</span>
              <span className="text-gray-200 font-mono text-[11px]">{scanId}</span>
            </div>
          </div>

          {/* Breakdown Metrics */}
          {bd && (
            <div>
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Score Breakdown
              </h4>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <MetricCard label="Base" value="40" />
                <MetricCard label="Penalties" value={`+${bd.penalty_total?.toFixed(1) ?? "?"}`} color="#ef4444" />
                <MetricCard label="Stabilizers" value={`-${bd.stabilizer_benefit?.toFixed(1) ?? "?"}`} color="#22c55e" />
                <MetricCard
                  label="Final"
                  value={String(scan.score ?? "?")}
                  color={scan.band === "High" ? "#ef4444" : scan.band === "Elevated" ? "#f97316" : scan.band === "Moderate" ? "#eab308" : "#22c55e"}
                />
              </div>

              {/* Tier overrides */}
              {bd.tier_drivers && bd.tier_drivers.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Band Floor Overrides</span>
                  <p className="text-xs text-red-300 mt-1 m-0">{bd.tier_drivers.join(", ")}</p>
                </div>
              )}

              {/* Injected risks */}
              {bd.injected_risk_types && bd.injected_risk_types.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Injected Risks</span>
                  <p className="text-xs text-cyan-300 mt-1 m-0">{bd.injected_risk_types.join(", ")}</p>
                </div>
              )}

              {/* Edge flags */}
              {bd.edge_flags && bd.edge_flags.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Edge Flags</span>
                  <p className="text-xs text-amber-300 mt-1 m-0">{bd.edge_flags.join(", ")}</p>
                </div>
              )}

              {/* Validation errors */}
              {bd.validation_errors && bd.validation_errors.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Validation Errors</span>
                  <p className="text-xs text-red-300 mt-1 m-0">{bd.validation_errors.join(", ")}</p>
                </div>
              )}

              {/* Contributions */}
              {bd.contributions && bd.contributions.length > 0 && (
                <div className="mb-3">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Score Contributions</span>
                  <div className="mt-1 space-y-0.5">
                    {bd.contributions
                      .slice()
                      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                      .map((c) => {
                        const pct = bd.contribution_pct?.find((p) => p.driver === c.driver)?.pct;
                        const confMult = bd.driver_confidence_multipliers?.find((m) => m.driver === c.driver)?.multiplier;
                        return (
                          <div key={c.driver} className="flex justify-between text-xs">
                            <span className="text-gray-300">
                              {c.driver}
                              {pct != null && <span className="text-gray-500 ml-1">({pct}%)</span>}
                              {confMult != null && confMult !== 1 && (
                                <span className="text-gray-600 ml-1">×{confMult}</span>
                              )}
                            </span>
                            <span className={c.points > 0 ? "text-red-400 font-mono" : c.points < 0 ? "text-green-400 font-mono" : "text-gray-500 font-mono"}>
                              {fmtPts(c.points)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Top drivers */}
              {bd.top_drivers && bd.top_drivers.length > 0 && (
                <div className="text-xs text-gray-500">
                  Top drivers: {bd.top_drivers.join(", ")}
                </div>
              )}

              {/* Review flag */}
              {bd.review_flag && (
                <div className="mt-1 text-xs text-amber-400">⚠ Review flag active</div>
              )}

              {/* Risk fingerprint */}
              {bd.risk_fingerprint && (
                <div className="mt-2 text-[10px] text-gray-600 font-mono break-all">
                  Fingerprint: {bd.risk_fingerprint}
                </div>
              )}
            </div>
          )}

          {/* Risk Severity Table */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Risks ({risks.length})
            </h4>
            <div className="space-y-0.5">
              {risks.map((r) => {
                const pts = (SEV_POINTS[r.severity_current] ?? 2) * (CONF_FACTOR[r.confidence ?? "Medium"] ?? 0.7);
                const isOverridden = r.severity_original !== r.severity_current;
                const isInjected = injectedTypes.has(r.risk_type);
                return (
                  <div key={r.risk_type} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-200">{r.risk_type}</span>
                      {isInjected && (
                        <span className="text-[9px] font-medium text-cyan-400 border border-cyan-400/30 rounded px-1">injected</span>
                      )}
                      {isOverridden && (
                        <span className="text-[9px] font-medium text-amber-400 border border-amber-400/30 rounded px-1">
                          {r.severity_original}→{r.severity_current}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <span>{r.severity_current}</span>
                      <span className="text-gray-600">/</span>
                      <span>{r.confidence ?? "?"}</span>
                      <span className="text-gray-600 font-mono w-12 text-right">{fmtPts(pts)} pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {overriddenRisks.length > 0 && (
              <p className="mt-2 text-[10px] text-amber-400/60">
                {overriddenRisks.length} risk{overriddenRisks.length > 1 ? "s" : ""} had severity overridden by deterministic rules
              </p>
            )}
          </div>

          {/* Raw Extraction */}
          <div>
            <button
              type="button"
              onClick={() => setShowExtraction(!showExtraction)}
              className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
            >
              {showExtraction ? "▼" : "▶"} Raw Extraction JSON
            </button>
            {showExtraction && (
              <pre className="mt-2 max-h-80 overflow-auto rounded border border-gray-700 bg-gray-900/50 p-3 text-[11px] text-gray-300 font-mono">
                {JSON.stringify(scan.extraction, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-gray-700 bg-gray-800/50 px-3 py-2 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold mt-0.5" style={color ? { color } : { color: "#e5e7eb" }}>
        {value}
      </div>
    </div>
  );
}
