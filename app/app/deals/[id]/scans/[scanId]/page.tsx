import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRiskTrend } from "@/lib/riskIndex";
import { loadRisksAndLinks, diffRisks, type DealRiskRow } from "@/lib/dealScanData";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
};

type ScanRow = {
  id: string;
  deal_id: string;
  extraction: Record<string, unknown>;
  status: string;
  created_at: string;
  model: string | null;
  prompt_version: string | null;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_breakdown: {
    structural_weight?: number;
    market_weight?: number;
    confidence_factor?: number;
    previous_score?: number;
    delta_comparable?: boolean;
  } | null;
};

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string; scanId: string }>;
}) {
  const { id: dealId, scanId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
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
    .select("id, name, asset_type, market")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) notFound();
  const d = deal as Deal;

  const { data: scanRow, error: scanError } = await supabase
    .from("deal_scans")
    .select(
      "id, deal_id, extraction, status, created_at, model, prompt_version, risk_index_score, risk_index_band, risk_index_breakdown"
    )
    .eq("id", scanId)
    .single();

  if (scanError || !scanRow || (scanRow as { deal_id: string }).deal_id !== dealId) notFound();
  const scan = scanRow as ScanRow;

  const { data: riskRows } = await supabase
    .from("deal_risks")
    .select(
      "id, risk_type, severity_original, severity_current, what_changed_or_trigger, why_it_matters, who_this_affects, recommended_action, confidence"
    )
    .eq("deal_scan_id", scanId)
    .order("created_at", { ascending: true });
  const risks = (riskRows ?? []) as DealRiskRow[];
  const linksByRisk = await loadRisksAndLinks(
    supabase,
    risks.map((r) => r.id)
  );

  const { data: prevScanRows } = await supabase
    .from("deal_scans")
    .select("id, created_at")
    .eq("deal_id", dealId)
    .lt("created_at", scan.created_at)
    .order("created_at", { ascending: false })
    .limit(1);
  const prevScan = prevScanRows?.[0] as { id: string } | undefined;
  let prevRisks: DealRiskRow[] = [];
  let diff: { added: DealRiskRow[]; removed: DealRiskRow[]; severityChanges: { risk: DealRiskRow; previousSeverity: string }[] } = {
    added: [],
    removed: [],
    severityChanges: [],
  };
  if (prevScan) {
    const { data: pr } = await supabase
      .from("deal_risks")
      .select(
        "id, risk_type, severity_original, severity_current, what_changed_or_trigger, why_it_matters, who_this_affects, recommended_action, confidence"
      )
      .eq("deal_scan_id", prevScan.id)
      .order("created_at", { ascending: true });
    prevRisks = (pr ?? []) as DealRiskRow[];
    diff = diffRisks(risks, prevRisks);
  }

  const { data: prevScoreRow } = prevScan
    ? await supabase
        .from("deal_scans")
        .select("risk_index_score")
        .eq("id", prevScan.id)
        .single()
    : { data: null };
  const prevScore = (prevScoreRow as { risk_index_score: number | null } | null)?.risk_index_score ?? null;
  const trend = getRiskTrend(scan.risk_index_score ?? null, prevScore);
  const trendLabels: Record<string, string> = {
    increased: "↑ Increased Risk",
    decreased: "↓ Decreased Risk",
    stable: "→ Stable",
  };

  const assumptions = scan.extraction?.assumptions as Record<
    string,
    { value?: number | null; unit?: string | null; confidence?: string }
  > | undefined;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/app/deals/${dealId}/scans`}
          style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}
        >
          ← Back to scan history
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
          Scan snapshot
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: 14 }}>
          {d.name}
          {(d.asset_type || d.market) && ` · ${[d.asset_type, d.market].filter(Boolean).join(" · ")}`}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          fontSize: 12,
          color: "#a1a1aa",
        }}
      >
        <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
          Scan mode: Fresh
        </span>
        {scan.model && (
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
            Model: {scan.model}
          </span>
        )}
        {scan.prompt_version && (
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
            Prompt version: {scan.prompt_version}
          </span>
        )}
        <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
          {new Date(scan.created_at).toLocaleString()}
        </span>
        {trend && (
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
            {trendLabels[trend]}
          </span>
        )}
      </div>

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
            {scan.risk_index_breakdown && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#a1a1aa" }}>
                Structural risk weighting: {scan.risk_index_breakdown.structural_weight ?? "—"} · Market
                risk weighting: {scan.risk_index_breakdown.market_weight ?? "—"} · Confidence
                adjustment: {scan.risk_index_breakdown.confidence_factor ?? "—"}
                {scan.risk_index_breakdown.previous_score != null && scan.risk_index_breakdown.delta_comparable === false && (
                  <div style={{ marginTop: 4, color: "rgb(200, 140, 0)" }}>Version drift — delta not comparable</div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

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
      </section>

      {prevScan && (diff.added.length > 0 || diff.removed.length > 0 || diff.severityChanges.length > 0) && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Compare to previous scan
          </h2>
          <div
            style={{
              padding: "16px 20px",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.03)",
              fontSize: 14,
            }}
          >
            {diff.added.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#22c55e" }}>Added risks ({diff.added.length}):</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20, color: "#e4e4e7" }}>
                  {diff.added.map((r) => (
                    <li key={r.id}>{r.risk_type} — {r.severity_current}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.removed.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ color: "#f87171" }}>Removed risks ({diff.removed.length}):</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20, color: "#e4e4e7" }}>
                  {diff.removed.map((r) => (
                    <li key={r.id}>{r.risk_type} — {r.severity_current}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.severityChanges.length > 0 && (
              <div>
                <strong style={{ color: "#fbbf24" }}>Severity changes ({diff.severityChanges.length}):</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 20, color: "#e4e4e7" }}>
                  {diff.severityChanges.map(({ risk, previousSeverity }) => (
                    <li key={risk.id}>
                      {risk.risk_type}: {previousSeverity} → {risk.severity_current}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#fafafa" }}>{r.risk_type}</span>
                  <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                    Severity: {r.severity_current}
                    {r.severity_original !== r.severity_current && ` (from ${r.severity_original})`}
                  </span>
                </div>
                {r.what_changed_or_trigger && (
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "#e4e4e7" }}>
                    {r.what_changed_or_trigger}
                  </p>
                )}
                {r.why_it_matters && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>{r.why_it_matters}</p>
                )}
                {r.who_this_affects && (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>
                    Affects: {r.who_this_affects}
                  </p>
                )}
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71717a" }}>
                  {r.recommended_action && `${r.recommended_action} · `}
                  {r.confidence && `Confidence: ${r.confidence}`}
                </p>
                {linksByRisk[r.id]?.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <p style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>Linked macro signals:</p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#a1a1aa" }}>
                      {linksByRisk[r.id].map((link) => (
                        <li key={link.signal_id}>
                          {link.signal_type && <strong>{link.signal_type}</strong>}
                          {link.what_changed &&
                            ` — ${link.what_changed.slice(0, 120)}${link.what_changed.length > 120 ? "…" : ""}`}
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
    </main>
  );
}
