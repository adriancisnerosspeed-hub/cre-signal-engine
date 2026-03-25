"use client";

import { useEffect, useState } from "react";

/* ---------- types ---------- */

type RiskRow = {
  risk_type: string;
  severity_original: string;
  severity_current: string;
  confidence: string | null;
};

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
  delta_comparable?: boolean;
  delta_score?: number;
  delta_band?: string;
  deterioration_flag?: boolean;
  driver_confidence_multipliers?: { driver: string; multiplier: number }[];
};

type Assumption = { value?: number | null; unit?: string | null; confidence?: string };

type ScanVersion = {
  id: string;
  created_at: string;
  model: string | null;
  prompt_version: string | null;
  score: number | null;
  band: string | null;
  version: string | null;
  breakdown: Breakdown | null;
  input_text_hash: string | null;
  scoring_input_hash: string | null;
  assumptions: Record<string, Assumption> | null;
  risks: RiskRow[];
  audit: {
    previous_score: number | null;
    new_score: number;
    delta: number;
    band_change: string | null;
    model_version: string | null;
  } | null;
};

/* ---------- helpers ---------- */

const SEV_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const SEVERITY_POINTS: Record<string, number> = { High: 8, Medium: 4, Low: 2 };
const CONFIDENCE_FACTOR: Record<string, number> = { High: 1, Medium: 0.7, Low: 0.4 };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPts(n: number) {
  return n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function pill(color: string, text: string) {
  return (
    <span
      className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: color, color: "#fff" }}
    >
      {text}
    </span>
  );
}

function bandColor(band: string | null) {
  switch (band) {
    case "Low":
      return "#22c55e";
    case "Moderate":
      return "#eab308";
    case "Elevated":
      return "#f97316";
    case "High":
      return "#ef4444";
    default:
      return "#6b7280";
  }
}

/* ---------- diff engine ---------- */

type RiskDiff = {
  risk_type: string;
  change: "added" | "removed" | "severity_changed" | "confidence_changed" | "unchanged";
  fromSev?: string;
  toSev?: string;
  fromConf?: string | null;
  toConf?: string | null;
  pointImpact?: string;
};

function diffRisks(older: RiskRow[], newer: RiskRow[]): RiskDiff[] {
  const oldMap = new Map(older.map((r) => [r.risk_type, r]));
  const newMap = new Map(newer.map((r) => [r.risk_type, r]));
  const allTypes = new Set([...oldMap.keys(), ...newMap.keys()]);
  const diffs: RiskDiff[] = [];

  for (const rt of allTypes) {
    const o = oldMap.get(rt);
    const n = newMap.get(rt);
    if (!o && n) {
      const pts = (SEVERITY_POINTS[n.severity_current] ?? 0) * (CONFIDENCE_FACTOR[n.confidence ?? "Medium"] ?? 0.7);
      diffs.push({ risk_type: rt, change: "added", toSev: n.severity_current, toConf: n.confidence, pointImpact: `+${pts.toFixed(1)} pts` });
    } else if (o && !n) {
      const pts = (SEVERITY_POINTS[o.severity_current] ?? 0) * (CONFIDENCE_FACTOR[o.confidence ?? "Medium"] ?? 0.7);
      diffs.push({ risk_type: rt, change: "removed", fromSev: o.severity_current, fromConf: o.confidence, pointImpact: `-${pts.toFixed(1)} pts` });
    } else if (o && n) {
      if (o.severity_current !== n.severity_current) {
        const oldPts = (SEVERITY_POINTS[o.severity_current] ?? 0) * (CONFIDENCE_FACTOR[o.confidence ?? "Medium"] ?? 0.7);
        const newPts = (SEVERITY_POINTS[n.severity_current] ?? 0) * (CONFIDENCE_FACTOR[n.confidence ?? "Medium"] ?? 0.7);
        diffs.push({
          risk_type: rt,
          change: "severity_changed",
          fromSev: o.severity_current,
          toSev: n.severity_current,
          pointImpact: `${fmtPts(newPts - oldPts)} pts`,
        });
      } else if (o.confidence !== n.confidence) {
        const oldPts = (SEVERITY_POINTS[o.severity_current] ?? 0) * (CONFIDENCE_FACTOR[o.confidence ?? "Medium"] ?? 0.7);
        const newPts = (SEVERITY_POINTS[n.severity_current] ?? 0) * (CONFIDENCE_FACTOR[n.confidence ?? "Medium"] ?? 0.7);
        diffs.push({
          risk_type: rt,
          change: "confidence_changed",
          fromConf: o.confidence,
          toConf: n.confidence,
          pointImpact: `${fmtPts(newPts - oldPts)} pts`,
        });
      } else {
        diffs.push({ risk_type: rt, change: "unchanged" });
      }
    }
  }

  const order = { added: 0, removed: 1, severity_changed: 2, confidence_changed: 3, unchanged: 4 };
  return diffs.sort((a, b) => order[a.change] - order[b.change]);
}

type AssumptionDiff = {
  key: string;
  oldVal: number | null | undefined;
  newVal: number | null | undefined;
  changed: boolean;
};

function diffAssumptions(
  older: Record<string, Assumption> | null,
  newer: Record<string, Assumption> | null
): AssumptionDiff[] {
  const allKeys = new Set([
    ...Object.keys(older ?? {}),
    ...Object.keys(newer ?? {}),
  ]);
  const diffs: AssumptionDiff[] = [];
  for (const key of allKeys) {
    const o = (older ?? {})[key]?.value ?? null;
    const n = (newer ?? {})[key]?.value ?? null;
    diffs.push({ key, oldVal: o, newVal: n, changed: o !== n });
  }
  return diffs.sort((a, b) => (a.changed === b.changed ? 0 : a.changed ? -1 : 1));
}

function diffContributions(
  older: Contribution[] | undefined,
  newer: Contribution[] | undefined
): { driver: string; oldPts: number; newPts: number; delta: number }[] {
  const oldMap = new Map((older ?? []).map((c) => [c.driver, c.points]));
  const newMap = new Map((newer ?? []).map((c) => [c.driver, c.points]));
  const allDrivers = new Set([...oldMap.keys(), ...newMap.keys()]);
  const diffs: { driver: string; oldPts: number; newPts: number; delta: number }[] = [];
  for (const driver of allDrivers) {
    const o = oldMap.get(driver) ?? 0;
    const n = newMap.get(driver) ?? 0;
    diffs.push({ driver, oldPts: o, newPts: n, delta: n - o });
  }
  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/* ---------- component ---------- */

export default function ScoreDebugPanel({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const [scans, setScans] = useState<ScanVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanA, setScanA] = useState<string>(""); // older
  const [scanB, setScanB] = useState<string>(""); // newer

  useEffect(() => {
    if (!open || scans.length > 0) return;
    setLoading(true);
    fetch(`/api/deals/${dealId}/score-debug`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setScans(d.scans ?? []);
          if (d.scans?.length >= 2) {
            setScanB(d.scans[0].id);
            setScanA(d.scans[1].id);
          } else if (d.scans?.length === 1) {
            setScanB(d.scans[0].id);
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, dealId, scans.length]);

  const a = scans.find((s) => s.id === scanA);
  const b = scans.find((s) => s.id === scanB);
  const sameVersion = a?.version && b?.version && a.version === b.version;

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
      >
        <span className="text-base">&#9881;</span>
        {open ? "Close Score Debug" : "Score Debug"}
      </button>

      {open && (
        <div className="mt-3 border border-amber-500/30 rounded-lg bg-amber-500/[0.04] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 border-b border-amber-500/20 bg-amber-500/[0.06]">
            <h3 className="text-sm font-bold text-amber-400 m-0">
              Score Debug — Deterministic Diff
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5 m-0">
              Owner-only. Compare any two scan versions to see exactly what caused the score to change.
            </p>
          </div>

          <div className="p-5">
            {loading && <p className="text-sm text-gray-400">Loading scan history…</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}

            {!loading && !error && scans.length === 0 && (
              <p className="text-sm text-gray-400">No completed scans found.</p>
            )}

            {!loading && scans.length > 0 && (
              <>
                {/* Version selectors */}
                <div className="flex flex-wrap gap-4 mb-5">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Baseline (older)
                    </label>
                    <select
                      value={scanA}
                      onChange={(e) => setScanA(e.target.value)}
                      className="w-full text-sm bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:border-amber-500/50 focus:outline-none"
                    >
                      <option value="">— select —</option>
                      {scans.map((s) => (
                        <option key={s.id} value={s.id}>
                          {fmtDate(s.created_at)} · Score: {s.score ?? "—"} ({s.band ?? "—"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Compare (newer)
                    </label>
                    <select
                      value={scanB}
                      onChange={(e) => setScanB(e.target.value)}
                      className="w-full text-sm bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:border-amber-500/50 focus:outline-none"
                    >
                      <option value="">— select —</option>
                      {scans.map((s) => (
                        <option key={s.id} value={s.id}>
                          {fmtDate(s.created_at)} · Score: {s.score ?? "—"} ({s.band ?? "—"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Single scan inspector */}
                {scanB && !scanA && b && (
                  <SingleScanBreakdown scan={b} />
                )}

                {/* Comparison */}
                {a && b && a.id !== b.id && (
                  <ComparisonView older={a} newer={b} sameVersion={!!sameVersion} />
                )}

                {a && b && a.id === b.id && (
                  <p className="text-sm text-gray-500 italic">Select two different scans to compare.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- single scan breakdown ---------- */

function SingleScanBreakdown({ scan }: { scan: ScanVersion }) {
  const bd = scan.breakdown;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl font-bold text-white">{scan.score}</span>
        {pill(bandColor(scan.band), scan.band ?? "—")}
        <span className="text-xs text-gray-500">{scan.version}</span>
      </div>

      {bd && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Base" value="40" />
            <MetricCard label="Penalties" value={`+${bd.penalty_total?.toFixed(1) ?? "?"}`} color="#ef4444" />
            <MetricCard label="Stabilizers" value={`-${bd.stabilizer_benefit?.toFixed(1) ?? "?"}`} color="#22c55e" />
            <MetricCard
              label="Final"
              value={String(scan.score ?? "?")}
              color={bandColor(scan.band)}
            />
          </div>

          {bd.tier_drivers && bd.tier_drivers.length > 0 && (
            <div className="mb-4 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Band Floor Overrides</span>
              <p className="text-sm text-red-300 mt-1 m-0">{bd.tier_drivers.join(", ")}</p>
            </div>
          )}

          {bd.contributions && bd.contributions.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Score Contributions
              </h4>
              <div className="space-y-1">
                {bd.contributions
                  .slice()
                  .sort((x, y) => Math.abs(y.points) - Math.abs(x.points))
                  .map((c) => (
                    <div key={c.driver} className="flex justify-between text-sm">
                      <span className="text-gray-300">{c.driver}</span>
                      <span className={c.points > 0 ? "text-red-400" : c.points < 0 ? "text-green-400" : "text-gray-500"}>
                        {fmtPts(c.points)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <ScanMetadata scan={scan} />
        </>
      )}

      {!bd && (
        <p className="text-sm text-gray-500 italic">No breakdown data stored for this scan.</p>
      )}
    </div>
  );
}

/* ---------- comparison view ---------- */

function ComparisonView({
  older,
  newer,
  sameVersion,
}: {
  older: ScanVersion;
  newer: ScanVersion;
  sameVersion: boolean;
}) {
  const scoreDelta = (newer.score ?? 0) - (older.score ?? 0);
  const riskDiffs = diffRisks(older.risks, newer.risks);
  const assumptionDiffs = diffAssumptions(older.assumptions, newer.assumptions);
  const contribDiffs = diffContributions(
    older.breakdown?.contributions,
    newer.breakdown?.contributions
  );
  const changedAssumptions = assumptionDiffs.filter((d) => d.changed);
  const changedContribs = contribDiffs.filter((c) => c.delta !== 0);
  const changedRisks = riskDiffs.filter((r) => r.change !== "unchanged");
  const sameInputHash = older.input_text_hash && older.input_text_hash === newer.input_text_hash;
  const sameScoringHash = older.scoring_input_hash && older.scoring_input_hash === newer.scoring_input_hash;

  return (
    <div>
      {/* Score delta header */}
      <div className="flex items-center gap-4 mb-5 p-4 rounded-lg bg-white/[0.03] border border-white/10">
        <div className="text-center">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider">Baseline</div>
          <div className="text-xl font-bold text-white">{older.score ?? "—"}</div>
          {pill(bandColor(older.band), older.band ?? "—")}
        </div>
        <div className="text-2xl text-gray-500">→</div>
        <div className="text-center">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider">Compare</div>
          <div className="text-xl font-bold text-white">{newer.score ?? "—"}</div>
          {pill(bandColor(newer.band), newer.band ?? "—")}
        </div>
        <div className="text-center ml-auto">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider">Delta</div>
          <div
            className={`text-xl font-bold ${
              scoreDelta > 0 ? "text-red-400" : scoreDelta < 0 ? "text-green-400" : "text-gray-400"
            }`}
          >
            {scoreDelta > 0 ? "+" : ""}{scoreDelta}
          </div>
          {Math.abs(scoreDelta) >= 8 && (
            <span className="text-[10px] text-red-400 font-semibold">SIGNIFICANT</span>
          )}
        </div>
      </div>

      {/* Diagnostic flags */}
      <div className="space-y-2 mb-5">
        {!sameVersion && (
          <DiagnosticFlag
            type="warning"
            text="Different scoring versions — delta may reflect methodology changes, not input changes."
            detail={`${older.version} → ${newer.version}`}
          />
        )}
        {sameInputHash && (
          <DiagnosticFlag
            type="info"
            text="Same input text hash — raw deal text was identical."
          />
        )}
        {sameScoringHash && (
          <DiagnosticFlag
            type="info"
            text="Same scoring input hash — normalized risks+assumptions were identical. Score should be identical."
          />
        )}
        {sameScoringHash && scoreDelta !== 0 && (
          <DiagnosticFlag
            type="error"
            text="BUG: Scoring input hash matches but scores differ. This indicates non-determinism in the scoring engine."
          />
        )}
        {changedRisks.length === 0 && changedAssumptions.length === 0 && scoreDelta !== 0 && !sameScoringHash && (
          <DiagnosticFlag
            type="warning"
            text="Score changed but no visible risk/assumption differences. Likely caused by structural scoring changes (stabilizers, completeness, macro count, or tier overrides)."
          />
        )}
      </div>

      {/* Explanation summary */}
      <div className="mb-5 p-4 rounded-lg bg-white/[0.03] border border-white/10">
        <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          What Changed
        </h4>
        {scoreDelta === 0 && changedRisks.length === 0 && changedAssumptions.length === 0 ? (
          <p className="text-sm text-gray-400 m-0">
            Scores are identical. No differences detected between these two scans.
          </p>
        ) : (
          <ExplanationSummary
            scoreDelta={scoreDelta}
            changedRisks={changedRisks}
            changedAssumptions={changedAssumptions}
            changedContribs={changedContribs}
            older={older}
            newer={newer}
          />
        )}
      </div>

      {/* Contribution diff */}
      {changedContribs.length > 0 && (
        <Section title="Score Contribution Diff">
          <div className="space-y-1">
            {contribDiffs.map((c) => (
              <div key={c.driver} className="flex justify-between text-sm">
                <span className="text-gray-300">{c.driver}</span>
                <div className="flex gap-3 items-center">
                  <span className="text-gray-500 text-xs w-14 text-right">{c.oldPts.toFixed(1)}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-gray-300 text-xs w-14 text-right">{c.newPts.toFixed(1)}</span>
                  <span
                    className={`text-xs w-16 text-right font-semibold ${
                      c.delta > 0 ? "text-red-400" : c.delta < 0 ? "text-green-400" : "text-gray-600"
                    }`}
                  >
                    {c.delta !== 0 ? fmtPts(c.delta) : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Risk diff */}
      <Section title={`Risk Diff (${changedRisks.length} changed, ${riskDiffs.length} total)`}>
        {riskDiffs.length === 0 ? (
          <p className="text-sm text-gray-500 m-0">No risks in either scan.</p>
        ) : (
          <div className="space-y-1.5">
            {riskDiffs.map((d) => (
              <div key={d.risk_type} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  {d.change === "added" && <span className="text-[10px] font-bold text-green-400">NEW</span>}
                  {d.change === "removed" && <span className="text-[10px] font-bold text-red-400">GONE</span>}
                  {d.change === "severity_changed" && <span className="text-[10px] font-bold text-amber-400">SEV</span>}
                  {d.change === "confidence_changed" && <span className="text-[10px] font-bold text-blue-400">CONF</span>}
                  <span className={d.change === "unchanged" ? "text-gray-600" : "text-gray-200"}>
                    {d.risk_type}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {d.change === "added" && <>{d.toSev} / {d.toConf ?? "?"} · <span className="text-red-400">{d.pointImpact}</span></>}
                  {d.change === "removed" && <><s>{d.fromSev}</s> / <s>{d.fromConf ?? "?"}</s> · <span className="text-green-400">{d.pointImpact}</span></>}
                  {d.change === "severity_changed" && <>{d.fromSev} → {d.toSev} · <span className="text-amber-400">{d.pointImpact}</span></>}
                  {d.change === "confidence_changed" && <>{d.fromConf} → {d.toConf} · <span className="text-blue-400">{d.pointImpact}</span></>}
                  {d.change === "unchanged" && <span className="text-gray-600">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Assumption diff */}
      {changedAssumptions.length > 0 && (
        <Section title={`Assumption Changes (${changedAssumptions.length})`}>
          <div className="space-y-1">
            {assumptionDiffs.filter(d => d.changed).map((d) => (
              <div key={d.key} className="flex justify-between text-sm">
                <span className="text-gray-300">{d.key.replace(/_/g, " ")}</span>
                <span className="text-xs text-gray-400">
                  {d.oldVal ?? "null"} → {d.newVal ?? "null"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Stabilizer/penalty summary diff */}
      {older.breakdown && newer.breakdown && (
        <Section title="Scoring Mechanics">
          <div className="grid grid-cols-2 gap-3">
            <MechanicDiff
              label="Penalty Total"
              oldVal={older.breakdown.penalty_total}
              newVal={newer.breakdown.penalty_total}
              higherIsWorse
            />
            <MechanicDiff
              label="Stabilizer Benefit"
              oldVal={older.breakdown.stabilizer_benefit}
              newVal={newer.breakdown.stabilizer_benefit}
            />
            <MechanicDiff
              label="Structural Weight"
              oldVal={older.breakdown.structural_weight}
              newVal={newer.breakdown.structural_weight}
            />
            <MechanicDiff
              label="Market Weight"
              oldVal={older.breakdown.market_weight}
              newVal={newer.breakdown.market_weight}
            />
          </div>
          {/* Tier drivers diff */}
          {(older.breakdown.tier_drivers?.length || newer.breakdown.tier_drivers?.length) && (
            <div className="mt-3">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tier Overrides</span>
              <div className="flex gap-4 mt-1 text-xs">
                <div>
                  <span className="text-gray-500">Baseline: </span>
                  <span className="text-gray-300">{older.breakdown.tier_drivers?.join(", ") || "none"}</span>
                </div>
                <div>
                  <span className="text-gray-500">Compare: </span>
                  <span className="text-gray-300">{newer.breakdown.tier_drivers?.join(", ") || "none"}</span>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Hash & metadata */}
      <Section title="Metadata">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <MetadataRow label="Date" oldVal={fmtDate(older.created_at)} newVal={fmtDate(newer.created_at)} />
          <MetadataRow label="Model" oldVal={older.model} newVal={newer.model} />
          <MetadataRow label="Version" oldVal={older.version} newVal={newer.version} />
          <MetadataRow label="Input Hash" oldVal={older.input_text_hash?.slice(0, 12)} newVal={newer.input_text_hash?.slice(0, 12)} />
          <MetadataRow label="Scoring Hash" oldVal={older.scoring_input_hash?.slice(0, 12)} newVal={newer.scoring_input_hash?.slice(0, 12)} />
        </div>
      </Section>
    </div>
  );
}

/* ---------- explanation summary ---------- */

function ExplanationSummary({
  scoreDelta,
  changedRisks,
  changedAssumptions,
  changedContribs,
  older,
  newer,
}: {
  scoreDelta: number;
  changedRisks: RiskDiff[];
  changedAssumptions: AssumptionDiff[];
  changedContribs: { driver: string; oldPts: number; newPts: number; delta: number }[];
  older: ScanVersion;
  newer: ScanVersion;
}) {
  const lines: string[] = [];
  const direction = scoreDelta > 0 ? "increased" : "decreased";

  if (scoreDelta !== 0) {
    lines.push(
      `Score ${direction} by ${Math.abs(scoreDelta)} points (${older.score} → ${newer.score}).`
    );
  }

  const added = changedRisks.filter((r) => r.change === "added");
  const removed = changedRisks.filter((r) => r.change === "removed");
  const sevChanged = changedRisks.filter((r) => r.change === "severity_changed");

  if (added.length > 0) {
    lines.push(`${added.length} new risk(s) appeared: ${added.map((r) => r.risk_type).join(", ")}.`);
  }
  if (removed.length > 0) {
    lines.push(`${removed.length} risk(s) removed: ${removed.map((r) => r.risk_type).join(", ")}.`);
  }
  if (sevChanged.length > 0) {
    lines.push(
      `${sevChanged.length} risk(s) changed severity: ${sevChanged.map((r) => `${r.risk_type} (${r.fromSev}→${r.toSev})`).join(", ")}.`
    );
  }

  if (changedAssumptions.length > 0) {
    lines.push(
      `${changedAssumptions.length} assumption(s) changed: ${changedAssumptions.map((a) => a.key.replace(/_/g, " ")).join(", ")}.`
    );
  }

  // Stabilizer diff
  const stabOld = older.breakdown?.stabilizer_benefit ?? 0;
  const stabNew = newer.breakdown?.stabilizer_benefit ?? 0;
  if (stabOld !== stabNew) {
    lines.push(
      `Stabilizer benefit changed: ${stabOld.toFixed(1)} → ${stabNew.toFixed(1)} (${fmtPts(stabNew - stabOld)} net score impact).`
    );
  }

  // Tier override diff
  const tierOld = older.breakdown?.tier_drivers ?? [];
  const tierNew = newer.breakdown?.tier_drivers ?? [];
  const addedTiers = tierNew.filter((t) => !tierOld.includes(t));
  const removedTiers = tierOld.filter((t) => !tierNew.includes(t));
  if (addedTiers.length > 0) {
    lines.push(`New band floor override(s): ${addedTiers.join(", ")}. This can force the score upward.`);
  }
  if (removedTiers.length > 0) {
    lines.push(`Removed band floor override(s): ${removedTiers.join(", ")}. This may allow the score to drop.`);
  }

  // Top contributors
  const biggestMover = changedContribs[0];
  if (biggestMover && Math.abs(biggestMover.delta) >= 2) {
    lines.push(
      `Largest single driver shift: "${biggestMover.driver}" moved ${fmtPts(biggestMover.delta)} pts.`
    );
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-gray-300 m-0 leading-relaxed">{line}</p>
      ))}
    </div>
  );
}

/* ---------- sub-components ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center p-2 rounded bg-white/[0.03] border border-white/[0.06]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold" style={{ color: color ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function MechanicDiff({
  label,
  oldVal,
  newVal,
  higherIsWorse,
}: {
  label: string;
  oldVal?: number;
  newVal?: number;
  higherIsWorse?: boolean;
}) {
  const o = oldVal ?? 0;
  const n = newVal ?? 0;
  const delta = n - o;
  const changed = delta !== 0;
  const colorClass = !changed
    ? "text-gray-500"
    : higherIsWorse
      ? delta > 0
        ? "text-red-400"
        : "text-green-400"
      : delta > 0
        ? "text-green-400"
        : "text-red-400";

  return (
    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.05]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm text-gray-400">{o.toFixed(1)}</span>
        <span className="text-gray-600 text-xs">→</span>
        <span className="text-sm text-gray-200">{n.toFixed(1)}</span>
        {changed && (
          <span className={`text-[10px] font-semibold ${colorClass}`}>
            ({fmtPts(delta)})
          </span>
        )}
      </div>
    </div>
  );
}

function MetadataRow({
  label,
  oldVal,
  newVal,
}: {
  label: string;
  oldVal: string | null | undefined;
  newVal: string | null | undefined;
}) {
  const changed = oldVal !== newVal;
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <div>
        <span className={changed ? "text-amber-400" : "text-gray-400"}>
          {oldVal ?? "—"} → {newVal ?? "—"}
        </span>
      </div>
    </>
  );
}

function DiagnosticFlag({
  type,
  text,
  detail,
}: {
  type: "info" | "warning" | "error";
  text: string;
  detail?: string;
}) {
  const styles = {
    info: { border: "border-blue-500/20", bg: "bg-blue-500/[0.06]", text: "text-blue-400", icon: "ℹ" },
    warning: { border: "border-amber-500/20", bg: "bg-amber-500/[0.06]", text: "text-amber-400", icon: "⚠" },
    error: { border: "border-red-500/20", bg: "bg-red-500/[0.06]", text: "text-red-400", icon: "✕" },
  };
  const s = styles[type];
  return (
    <div className={`px-3 py-2 rounded ${s.border} border ${s.bg} text-sm`}>
      <span className={`${s.text} font-semibold mr-1.5`}>{s.icon}</span>
      <span className="text-gray-300">{text}</span>
      {detail && <span className="text-gray-500 ml-2 text-xs">({detail})</span>}
    </div>
  );
}

function ScanMetadata({ scan }: { scan: ScanVersion }) {
  return (
    <div className="mt-4 pt-3 border-t border-white/[0.06]">
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Metadata</h4>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <span className="text-gray-500">Date</span>
        <span className="text-gray-400">{fmtDate(scan.created_at)}</span>
        <span className="text-gray-500">Model</span>
        <span className="text-gray-400">{scan.model ?? "—"}</span>
        <span className="text-gray-500">Version</span>
        <span className="text-gray-400">{scan.version ?? "—"}</span>
        <span className="text-gray-500">Input Hash</span>
        <span className="text-gray-400 font-mono">{scan.input_text_hash?.slice(0, 16) ?? "—"}</span>
        <span className="text-gray-500">Scoring Hash</span>
        <span className="text-gray-400 font-mono">{scan.scoring_input_hash?.slice(0, 16) ?? "—"}</span>
        {scan.audit && (
          <>
            <span className="text-gray-500">Audit Delta</span>
            <span className="text-gray-400">{scan.audit.delta > 0 ? "+" : ""}{scan.audit.delta} ({scan.audit.band_change ?? "—"})</span>
          </>
        )}
      </div>
    </div>
  );
}
