import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { getRecommendedActions } from "@/lib/icRecommendedActions";
import { checkBandConsistency } from "@/lib/bandConsistency";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DealDetailClient from "./DealDetailClient";
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
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "#a1a1aa" }}>No workspace selected.</p>
      </main>
    );
  }

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, name, asset_type, market, latest_scan_id, ic_status, ic_decision_date, ic_notes, created_at")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) {
    notFound();
  }

  const d = deal as Deal;
  let scan: DealScan | null = null;
  let risks: DealRisk[] = [];

  const entitlements = await getEntitlementsForUser(supabase, user.id);
  const plan = entitlements.plan;

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
    risk_index_breakdown?: { delta_comparable?: boolean; tier_drivers?: string[] } | null;
  }[];

  const bandConsistency = scan
    ? checkBandConsistency(scan.risk_index_score, scan.risk_index_band, scan.risk_index_version ?? null)
    : null;
  const bandMismatch = bandConsistency?.mismatch ?? false;
  const bandMismatchExpectedBand = bandConsistency?.expectedBand;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app/deals" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Back to deals
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", margin: 0 }}>
            {d.name}
          </h1>
          {(d.asset_type || d.market) && (
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#a1a1aa" }}>
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
          <DealDetailClient dealId={d.id} hasScan={!!scan} />
        </div>
      </div>

      <IcStatusBlock
        dealId={d.id}
        icStatus={d.ic_status}
        icDecisionDate={d.ic_decision_date}
        icNotes={d.ic_notes}
      />

      {!scan && (
        <section style={{ marginBottom: 32 }}>
          <p style={{ color: "#a1a1aa" }}>
            No scan yet. Run a Deal Risk Scan to extract assumptions and risks from your underwriting text.
          </p>
        </section>
      )}

      {scan && (
        <>
          <nav style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <Link
              href={`/app/deals/${dealId}`}
              style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === "overview" ? "#fafafa" : "#a1a1aa",
                textDecoration: "none",
                borderBottom: activeTab === "overview" ? "2px solid #fafafa" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              Overview
            </Link>
            <Link
              href={`/app/deals/${dealId}?tab=ic-summary`}
              style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === "ic-summary" ? "#fafafa" : "#a1a1aa",
                textDecoration: "none",
                borderBottom: activeTab === "ic-summary" ? "2px solid #fafafa" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              IC Summary
            </Link>
          </nav>

          {activeTab === "overview" && (
          <>
          {last5Scans.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
                Risk trajectory
              </h2>
              <div
                style={{
                  padding: "16px 20px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              >
                <RiskTrajectoryChart scans={last5Scans} />
              </div>
            </section>
          )}
          {last5Scans.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
                Recent scans
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                      style={{
                        display: "block",
                        padding: "12px 16px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        backgroundColor: "rgba(255,255,255,0.03)",
                        textDecoration: "none",
                        color: "inherit",
                        fontSize: 14,
                      }}
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
          />

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
              Assumptions
            </h2>
            {assumptions && Object.keys(assumptions).length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Key</th>
                      <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Value</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Unit</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(assumptions).map(([key, cell]) => (
                      <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{key.replace(/_/g, " ")}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                          {cell.value != null ? cell.value : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{cell.unit ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{cell.confidence ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "#a1a1aa", fontSize: 14 }}>No assumptions extracted.</p>
            )}
            <p style={{ marginTop: 8, fontSize: 12, color: "#71717a" }}>
              Scan: {new Date(scan.created_at).toLocaleString()}
              {scan.model && ` · ${scan.model}`}
              {" · "}
              <Link href={`/app/deals/${d.id}/scans`} style={{ color: "#a1a1aa" }}>
                Scan history
              </Link>
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
              Risks ({risks.length})
            </h2>
            {risks.length === 0 ? (
              <p style={{ color: "#a1a1aa", fontSize: 14 }}>No risks flagged.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {risks.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      padding: "16px 20px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      marginBottom: 12,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontWeight: 600, color: "#fafafa" }}>{r.risk_type}</span>
                      <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                        Severity: {r.severity_current}
                        {r.severity_original !== r.severity_current && ` (from ${r.severity_original})`}
                      </span>
                    </div>
                    {r.what_changed_or_trigger && (
                      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#e4e4e7" }}>{r.what_changed_or_trigger}</p>
                    )}
                    {r.why_it_matters && (
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>{r.why_it_matters}</p>
                    )}
                    {r.who_this_affects && (
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>Affects: {r.who_this_affects}</p>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71717a" }}>
                      {r.recommended_action && `${r.recommended_action} · `}
                      {r.confidence && `Confidence: ${r.confidence}`}
                    </p>
                    {linksByRisk[r.id]?.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <p style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Linked macro signals:</p>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#a1a1aa" }}>
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
                <section style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
                    CRE Signal Risk Index™
                  </h2>
                  <div
                    style={{
                      padding: "16px 20px",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fafafa" }}>
                      {scan.risk_index_score} — {scan.risk_index_band ?? "—"}
                    </div>
                    {bandMismatch && bandMismatchExpectedBand && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b" }} title="Stored band does not match score for current model version.">
                        Band mismatch detected (expected: {bandMismatchExpectedBand})
                      </div>
                    )}
                  </div>
                  <p style={{ marginTop: 8, fontSize: 13 }}>
                    <Link href="/app/methodology" style={{ color: "#a1a1aa" }}>
                      How this is scored →
                    </Link>
                  </p>
                </section>
              )}

              <PercentileBlock scanId={scan.id} plan={plan} />

              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
                  Deal Snapshot
                </h2>
                {assumptions && Object.keys(assumptions).length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                          <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Key</th>
                          <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Value</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Unit</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(assumptions)
                          .slice(0, 10)
                          .map(([key, cell]) => (
                            <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                              <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{key.replace(/_/g, " ")}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                                {cell.value != null ? cell.value : "—"}
                              </td>
                              <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{cell.unit ?? "—"}</td>
                              <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>{cell.confidence ?? "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "#a1a1aa", fontSize: 14 }}>No assumptions extracted.</p>
                )}
              </section>

              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
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
                    <p style={{ color: "#a1a1aa", fontSize: 14 }}>No risks flagged.</p>
                  ) : (
                    <>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {topRisks.map((r) => (
                          <li
                            key={r.id}
                            style={{
                              padding: "12px 16px",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              marginBottom: 8,
                              backgroundColor: "rgba(255,255,255,0.03)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                              <span style={{ fontWeight: 600, color: "#fafafa" }}>{r.risk_type}</span>
                              <span style={{ fontSize: 12, color: "#a1a1aa" }}>{r.severity_current}</span>
                            </div>
                            {r.what_changed_or_trigger && (
                              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#e4e4e7" }}>{r.what_changed_or_trigger}</p>
                            )}
                            {r.who_this_affects && (
                              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a1a1aa" }}>Affects: {r.who_this_affects}</p>
                            )}
                            {linksByRisk[r.id]?.length > 0 && (
                              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
                                Linked: {linksByRisk[r.id].map((l) => l.signal_type ?? "Signal").join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {riskOmitted && (
                        <p style={{ fontSize: 12, color: "#71717a", marginTop: 8, fontStyle: "italic" }}>
                          Additional risks not shown ({sorted.length} total).
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
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
                    <p style={{ color: "#a1a1aa", fontSize: 14 }}>No linked macro signals.</p>
                  ) : (
                    <>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#e4e4e7" }}>
                        {topSignals.map((item, i) => (
                          <li key={i}>
                            {item.signal_type && <strong>{item.signal_type}</strong>}
                            {item.what_changed && ` — ${item.what_changed.slice(0, 100)}${item.what_changed.length > 100 ? "…" : ""}`}
                          </li>
                        ))}
                      </ul>
                      {signalsOmitted && (
                        <p style={{ fontSize: 12, color: "#71717a", marginTop: 8, fontStyle: "italic" }}>
                          Additional macro signals not shown ({list.length} total).
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
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
                    <p style={{ color: "#a1a1aa", fontSize: 14 }}>No rule-based actions for this scan.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#e4e4e7" }}>
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

              <p style={{ fontSize: 12, color: "#71717a", marginTop: 24, fontStyle: "italic" }}>
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
