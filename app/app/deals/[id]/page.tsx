import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { formatAssumptionValue } from "@/lib/utils/formatAssumption";
import { getCurrentOrgId } from "@/lib/org";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { getRecommendedActions } from "@/lib/icRecommendedActions";
import { checkBandConsistency } from "@/lib/bandConsistency";
import { computeExplainabilityDiff } from "@/lib/explainabilityDiff";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DealDetailClient from "./DealDetailClient";
import DemoDealDeleteButton from "./DemoDealDeleteButton";
import RefreshPageButton from "./RefreshPageButton";
import ExportPdfButton from "./ExportPdfButton";
import IcNarrativeBlock from "./IcNarrativeBlock";
import IcStatusBlock from "./IcStatusBlock";
import PercentileBlock from "./PercentileBlock";
import ScenarioComparisonBlock from "./ScenarioComparisonBlock";
import RiskTrajectoryChart from "./RiskTrajectoryChart";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  latest_scan_id: string | null;
  ic_status: "PRE_IC" | "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED" | null;
  ic_decision_date: string | null;
  ic_notes: string | null;
  created_at: string;
  is_demo: boolean;
};

type DealScan = {
  id: string;
  extraction: Record<string, unknown>;
  status: string;
  created_at: string;
  model: string | null;
  prompt_version: string | null;
  cap_rate_in: number | null;
  exit_cap: number | null;
  noi_year1: number | null;
  ltv: number | null;
  hold_period_years: number | null;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_version?: string | null;
};

type DealRisk = {
  id: string;
  risk_type: string;
  severity_original: string;
  severity_current: string;
  what_changed_or_trigger: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  recommended_action: string | null;
  confidence: string | null;
};

const SEVERITY_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const CONFIDENCE_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: dealId } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "ic-summary" ? "ic-summary" : "overview";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return (
      <main className="max-w-[800px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
        <p className="text-gray-500 dark:text-gray-400">No workspace selected.</p>
      </main>
    );
  }

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, name, asset_type, market, latest_scan_id, ic_status, ic_decision_date, ic_notes, created_at, is_demo")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) {
    notFound();
  }

  const d = deal as Deal;
  let scan: DealScan | null = null;
  let risks: DealRisk[] = [];

  const [entitlements, workspaceEntitlements] = await Promise.all([
    getEntitlementsForUser(supabase, user.id),
    (async () => {
      const service = createServiceRoleClient();
      const { entitlements: ws } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
      return ws;
    })(),
  ]);
  const plan = entitlements.plan;
  const canUseTrajectory = workspaceEntitlements.canUseTrajectory;

  let narrativeContent: string | null = null;
  if (d.latest_scan_id) {
    const { data: narrativeRow } = await supabase
      .from("deal_scan_narratives")
      .select("content")
      .eq("deal_scan_id", d.latest_scan_id)
      .maybeSingle();
    narrativeContent = (narrativeRow as { content: string } | null)?.content ?? null;
  }

  if (d.latest_scan_id) {
    const { data: scanRow } = await supabase
      .from("deal_scans")
      .select("id, extraction, status, created_at, model, prompt_version, cap_rate_in, exit_cap, noi_year1, ltv, hold_period_years, risk_index_score, risk_index_band, risk_index_version")
      .eq("id", d.latest_scan_id)
      .single();

    if (scanRow) {
      scan = scanRow as DealScan;
      const { data: riskRows } = await supabase
        .from("deal_risks")
        .select("id, risk_type, severity_original, severity_current, what_changed_or_trigger, why_it_matters, who_this_affects, recommended_action, confidence")
        .eq("deal_scan_id", scan.id)
        .order("created_at", { ascending: true });
      risks = (riskRows ?? []) as DealRisk[];
    }
  }

  type LinkRow = { deal_risk_id: string; signal_id: string; link_reason: string | null };
  type SignalRow = { id: string; signal_type: string | null; what_changed: string | null };
  let linksByRisk: Record<string, { signal_id: string; link_reason: string | null; signal_type: string | null; what_changed: string | null }[]> = {};
  if (risks.length > 0) {
    const riskIds = risks.map((r) => r.id);
    const { data: linkRows } = await supabase
      .from("deal_signal_links")
      .select("deal_risk_id, signal_id, link_reason")
      .in("deal_risk_id", riskIds);
    const links = (linkRows ?? []) as LinkRow[];
    const signalIds = [...new Set(links.map((l) => l.signal_id))];
    let signalsMap: Record<string, SignalRow> = {};
    if (signalIds.length > 0) {
      const { data: signalRows } = await supabase
        .from("signals")
        .select("id, signal_type, what_changed")
        .in("id", signalIds);
      for (const s of (signalRows ?? []) as SignalRow[]) {
        signalsMap[String(s.id)] = s;
      }
    }
    for (const link of links) {
      const sig = signalsMap[String(link.signal_id)];
      if (!linksByRisk[link.deal_risk_id]) linksByRisk[link.deal_risk_id] = [];
      const arr = linksByRisk[link.deal_risk_id];
      const seen = new Set(arr.map((x) => String(x.signal_id)));
      if (!seen.has(String(link.signal_id))) {
        arr.push({
          signal_id: String(link.signal_id),
          link_reason: link.link_reason,
          signal_type: sig?.signal_type ?? null,
          what_changed: sig?.what_changed ?? null,
        });
      }
    }
    for (const riskId of Object.keys(linksByRisk)) {
      const arr = linksByRisk[riskId];
      const bySignalId = new Map<string, (typeof arr)[0]>();
      for (const link of arr) {
        const key = String(link.signal_id);
        if (!bySignalId.has(key)) bySignalId.set(key, link);
      }
      const dedupedById = [...bySignalId.values()];
      const byDisplayText = new Map<string, (typeof arr)[0]>();
      for (const link of dedupedById) {
        const displayText = `${link.signal_type ?? ""}\n${link.what_changed ?? ""}`.trim();
        if (!byDisplayText.has(displayText)) byDisplayText.set(displayText, link);
      }
      linksByRisk[riskId] = [...byDisplayText.values()];
    }
  }

  const assumptions = scan?.extraction?.assumptions as Record<string, { value?: number | null; unit?: string | null; confidence?: string }> | undefined;

  const { data: recentScans } = await supabase
    .from("deal_scans")
    .select("id, created_at, model, risk_index_score, risk_index_band, risk_index_breakdown")
    .eq("deal_id", dealId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(5);
  const last5Scans = (recentScans ?? []) as {
    id: string;
    created_at: string;
    model: string | null;
    risk_index_score: number | null;
    risk_index_band: string | null;
    risk_index_breakdown?: { delta_comparable?: boolean; tier_drivers?: string[]; contributions?: { driver: string; points: number }[] } | null;
  }[];

  const latestScan = last5Scans[0];
  const previousScan = last5Scans[1];
  const explainabilityDiff =
    latestScan?.risk_index_breakdown?.delta_comparable === true && previousScan
      ? computeExplainabilityDiff(
          latestScan.risk_index_breakdown,
          previousScan.risk_index_breakdown,
          true
        ).slice(0, 5)
      : [];

  const bandConsistency = scan
    ? checkBandConsistency(scan.risk_index_score, scan.risk_index_band, scan.risk_index_version ?? null)
    : null;
  const bandMismatch = bandConsistency?.mismatch ?? false;
  const bandMismatchExpectedBand = bandConsistency?.expectedBand;

  return (
    <main className="max-w-[800px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <div style={{ marginBottom: 24 }}>
        <Link href="/app/deals" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Back to deals
        </Link>
      </div>

      {d.is_demo && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(234, 179, 8, 0.12)",
            border: "1px solid rgba(234, 179, 8, 0.35)",
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {!d.latest_scan_id ? (
            <>
              <span style={{ color: "#eab308", fontSize: 14 }}>
                Scan pending… The demo scan may still be running. Check back in a moment or refresh.
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <RefreshPageButton />
                <DemoDealDeleteButton dealId={d.id} />
              </div>
            </>
          ) : (
            <>
              <span style={{ color: "#eab308", fontSize: 14 }}>
                This is a sample deal — replace with your own assumptions to get started.
              </span>
              <DemoDealDeleteButton dealId={d.id} />
            </>
          )}
        </div>
      )}

      <div className="flex justify-between items-start flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-gray-900 dark:text-white m-0">
            {d.name}
          </h1>
          {(d.asset_type || d.market) && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 m-0">
              {[d.asset_type, d.market].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {scan?.status === "completed" && (
            <ExportPdfButton
              scanId={scan.id}
              scanExportEnabled={entitlements.scan_export_enabled}
            />
          )}
          <DealDetailClient dealId={d.id} hasScan={!!scan} workspaceId={orgId} />
        </div>
      </div>

      <IcStatusBlock
        dealId={d.id}
        icStatus={d.ic_status}
        icDecisionDate={d.ic_decision_date}
        icNotes={d.ic_notes}
      />

      {!scan && (
        <section className="mb-8">
          <p className="text-gray-500 dark:text-gray-400">
            No scan yet. Run a Deal Risk Scan to extract assumptions and risks from your underwriting text.
          </p>
        </section>
      )}

      {scan && (
        <>
          <nav className="flex gap-2 mb-6 border-b border-gray-200 dark:border-white/10">
            <Link
              href={`/app/deals/${dealId}`}
              className={`py-2.5 px-4 text-sm font-semibold no-underline -mb-px border-b-2 ${
                activeTab === "overview"
                  ? "text-gray-900 dark:text-white border-gray-900 dark:border-white"
                  : "text-gray-500 dark:text-gray-400 border-transparent"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`/app/deals/${dealId}?tab=ic-summary`}
              className={`py-2.5 px-4 text-sm font-semibold no-underline -mb-px border-b-2 ${
                activeTab === "ic-summary"
                  ? "text-gray-900 dark:text-white border-gray-900 dark:border-white"
                  : "text-gray-500 dark:text-gray-400 border-transparent"
              }`}
            >
              IC Summary
            </Link>
          </nav>

          {activeTab === "overview" && (
          <>
          {last5Scans.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                Risk trajectory
              </h2>
              {canUseTrajectory ? (
                <div className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                  <RiskTrajectoryChart scans={last5Scans} />
                </div>
              ) : (
                <div className="py-4 px-5 border border-gray-200 dark:border-white/[0.08] rounded-lg bg-gray-50 dark:bg-white/[0.02]">
                  <p className="text-gray-500 dark:text-gray-400 text-sm m-0">
                    Available beginning at Analyst plan.{" "}
                    <Link href="/pricing" className="text-[#3b82f6]">View plans</Link>
                  </p>
                </div>
              )}
            </section>
          )}
          {entitlements.explainability_enabled && explainabilityDiff.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                Score Change Drivers
              </h2>
              <div className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {explainabilityDiff.map((item, i) => (
                    <li key={i} className={`py-1.5 text-sm ${i < explainabilityDiff.length - 1 ? "border-b border-gray-200 dark:border-white/[0.06]" : ""}`}>
                      <span className="text-gray-900 dark:text-zinc-200">{item.driver}</span>
                      {" "}
                      <span className="text-gray-500 dark:text-gray-400">
                        {item.previous_points} → {item.current_points}
                        {item.delta_points >= 0 ? " (+" : " ("}
                        {item.delta_points})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {last5Scans.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                Recent scans
              </h2>
              <div className="flex flex-col gap-2">
                {last5Scans.map((s, i) => {
                  const prevScore = last5Scans[i + 1]?.risk_index_score ?? null;
                  const currScore = s.risk_index_score ?? null;
                  const trend =
                    currScore != null && prevScore != null
                      ? currScore > prevScore
                        ? "↑"
                        : currScore < prevScore
                          ? "↓"
                          : "→"
                      : null;
                  return (
                    <Link
                      key={s.id}
                      href={`/app/deals/${dealId}/scans/${s.id}`}
                      className="block py-3 px-4 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.03] no-underline text-inherit text-sm"
                    >
                      {new Date(s.created_at).toLocaleString()}
                      {s.model && ` · ${s.model}`}
                      {s.risk_index_score != null && ` · CRE Signal Risk Index™: ${s.risk_index_score} — ${s.risk_index_band ?? "—"}`}
                      {trend && ` ${trend}`}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <ScenarioComparisonBlock
            dealId={dealId}
            scans={last5Scans.map((s) => ({ id: s.id, created_at: s.created_at, risk_index_band: s.risk_index_band }))}
            plan={plan}
            explainabilityEnabled={entitlements.explainability_enabled}
          />

          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
              Assumptions
            </h2>
            {assumptions && Object.keys(assumptions).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-300 dark:border-white/20">
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Key</th>
                      <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Value</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Unit</th>
                      <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(assumptions).map(([key, cell]) => (
                      <tr key={key} className="border-b border-gray-200 dark:border-white/[0.08]">
                        <td className="py-2 px-3 text-gray-900 dark:text-zinc-200">{key.replace(/_/g, " ")}</td>
                        <td className="py-2 px-3 text-right text-gray-900 dark:text-white font-medium">
                          {formatAssumptionValue(cell.value ?? null, cell.unit ?? null)}
                        </td>
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{cell.unit ?? "—"}</td>
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{cell.confidence ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No assumptions extracted.</p>
            )}
            <p className="mt-2 text-[12px] text-gray-400 dark:text-zinc-500">
              Scan: {new Date(scan.created_at).toLocaleString()}
              {scan.model && ` · ${scan.model}`}
              {" · "}
              <Link href={`/app/deals/${d.id}/scans`} className="text-gray-500 dark:text-gray-400">
                Scan history
              </Link>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
              Risks ({risks.length})
            </h2>
            {risks.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No risks flagged.</p>
            ) : (
              <ul className="list-none p-0 m-0">
                {risks.map((r) => (
                  <li
                    key={r.id}
                    className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg mb-3 bg-gray-50 dark:bg-white/[0.03]"
                  >
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{r.risk_type}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Severity: {r.severity_current}
                        {r.severity_original !== r.severity_current && ` (from ${r.severity_original})`}
                      </span>
                    </div>
                    {r.what_changed_or_trigger && (
                      <p className="mt-2 text-sm text-gray-900 dark:text-zinc-200 m-0">{r.what_changed_or_trigger}</p>
                    )}
                    {r.why_it_matters && (
                      <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400 m-0">{r.why_it_matters}</p>
                    )}
                    {r.who_this_affects && (
                      <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400 m-0">Affects: {r.who_this_affects}</p>
                    )}
                    <p className="mt-2 text-[12px] text-gray-400 dark:text-zinc-500 m-0">
                      {r.recommended_action && `${r.recommended_action} · `}
                      {r.confidence && `Confidence: ${r.confidence}`}
                    </p>
                    {linksByRisk[r.id]?.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-gray-200 dark:border-white/[0.08]">
                        <p className="text-[12px] text-gray-400 dark:text-zinc-500 mb-1">Linked macro signals:</p>
                        <ul className="m-0 pl-4 text-[13px] text-gray-500 dark:text-gray-400">
                          {linksByRisk[r.id].map((link) => (
                            <li key={link.signal_id}>
                              {link.signal_type && <strong>{link.signal_type}</strong>}
                              {link.what_changed && ` — ${link.what_changed.slice(0, 120)}${link.what_changed.length > 120 ? "…" : ""}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          </>
          )}

          {activeTab === "ic-summary" && scan && (
            <>
              {scan.risk_index_score != null && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                    CRE Signal Risk Index™
                  </h2>
                  <div className="py-4 px-5 border border-gray-200 dark:border-white/[0.15] rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                    <div className="text-xl font-bold text-gray-900 dark:text-white">
                      {scan.risk_index_score} — {scan.risk_index_band ?? "—"}
                    </div>
                    {bandMismatch && bandMismatchExpectedBand && (
                      <div className="mt-2 text-xs text-amber-500" title="Stored band does not match score for current model version.">
                        Band mismatch detected (expected: {bandMismatchExpectedBand})
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[13px]">
                    <Link href="/app/methodology" className="text-gray-500 dark:text-gray-400">
                      How this is scored →
                    </Link>
                  </p>
                </section>
              )}

              <PercentileBlock dealId={d.id} scanId={scan.id} plan={plan} />

              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                  Deal Snapshot
                </h2>
                {assumptions && Object.keys(assumptions).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-300 dark:border-white/20">
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Key</th>
                          <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Value</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Unit</th>
                          <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(assumptions)
                          .slice(0, 10)
                          .map(([key, cell]) => (
                            <tr key={key} className="border-b border-gray-200 dark:border-white/[0.08]">
                              <td className="py-2 px-3 text-gray-900 dark:text-zinc-200">{key.replace(/_/g, " ")}</td>
                              <td className="py-2 px-3 text-right text-gray-900 dark:text-white font-medium">
                                {formatAssumptionValue(cell.value ?? null, cell.unit ?? null)}
                              </td>
                              <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{cell.unit ?? "—"}</td>
                              <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{cell.confidence ?? "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No assumptions extracted.</p>
                )}
              </section>

              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                  Primary Risks
                </h2>
                {(() => {
                  const sorted = [...risks].sort((a, b) => {
                    const sev = (SEVERITY_ORDER[b.severity_current] ?? 0) - (SEVERITY_ORDER[a.severity_current] ?? 0);
                    if (sev !== 0) return sev;
                    return (CONFIDENCE_ORDER[b.confidence ?? ""] ?? 0) - (CONFIDENCE_ORDER[a.confidence ?? ""] ?? 0);
                  });
                  const topRisks = sorted.slice(0, 5);
                  const riskOmitted = sorted.length > 5;
                  return sorted.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No risks flagged.</p>
                  ) : (
                    <>
                      <ul className="list-none p-0 m-0">
                        {topRisks.map((r) => (
                          <li
                            key={r.id}
                            className="py-3 px-4 border border-gray-200 dark:border-white/10 rounded-lg mb-2 bg-gray-50 dark:bg-white/[0.03]"
                          >
                            <div className="flex justify-between items-center flex-wrap gap-2">
                              <span className="font-semibold text-gray-900 dark:text-white">{r.risk_type}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{r.severity_current}</span>
                            </div>
                            {r.what_changed_or_trigger && (
                              <p className="mt-1.5 text-[13px] text-gray-900 dark:text-zinc-200 m-0">{r.what_changed_or_trigger}</p>
                            )}
                            {r.who_this_affects && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 m-0">Affects: {r.who_this_affects}</p>
                            )}
                            {linksByRisk[r.id]?.length > 0 && (
                              <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500 m-0">
                                Linked: {linksByRisk[r.id].map((l) => l.signal_type ?? "Signal").join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {riskOmitted && (
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 italic">
                          Additional risks not shown ({sorted.length} total).
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                  Linked Macro Signals
                </h2>
                {(() => {
                  const seen = new Set<string>();
                  const list: { signal_type: string | null; what_changed: string | null }[] = [];
                  for (const r of risks) {
                    for (const link of linksByRisk[r.id] ?? []) {
                      const key = `${link.signal_type ?? ""}|${link.what_changed ?? ""}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        list.push({ signal_type: link.signal_type, what_changed: link.what_changed });
                      }
                    }
                  }
                  const topSignals = list.slice(0, 5);
                  const signalsOmitted = list.length > 5;
                  return list.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No linked macro signals.</p>
                  ) : (
                    <>
                      <ul className="m-0 pl-5 text-sm text-gray-900 dark:text-zinc-200">
                        {topSignals.map((item, i) => (
                          <li key={i}>
                            {item.signal_type && <strong>{item.signal_type}</strong>}
                            {item.what_changed && ` — ${item.what_changed.slice(0, 100)}${item.what_changed.length > 100 ? "…" : ""}`}
                          </li>
                        ))}
                      </ul>
                      {signalsOmitted && (
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 italic">
                          Additional macro signals not shown ({list.length} total).
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              <section className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
                  Recommended Actions
                </h2>
                {(() => {
                  const risksWithSignals = risks.map((r) => ({
                    severity_current: r.severity_current,
                    risk_type: r.risk_type,
                    signal_types: (linksByRisk[r.id] ?? []).map((l) => l.signal_type ?? "").filter(Boolean),
                  }));
                  const actions = getRecommendedActions(risksWithSignals);
                  return actions.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No rule-based actions for this scan.</p>
                  ) : (
                    <ul className="m-0 pl-5 text-sm text-gray-900 dark:text-zinc-200">
                      {actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  );
                })()}
              </section>

              <IcNarrativeBlock
                icNarrativeEnabled={entitlements.ic_narrative_enabled}
                scanExportEnabled={entitlements.scan_export_enabled}
                scanId={scan.id}
                narrativeContent={narrativeContent}
                dealName={d.name}
                scanCreatedAt={scan.created_at}
                riskIndexScore={scan.risk_index_score}
                riskIndexBand={scan.risk_index_band}
              />

              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-6 italic">
                CRE Signal Risk Index™ is an underwriting support tool. Final investment
                decisions should incorporate sponsor diligence and third-party validation.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
