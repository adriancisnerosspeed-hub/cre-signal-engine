import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRiskTrend } from "@/lib/riskIndex";
import { loadRisksAndLinks, diffRisks, type DealRiskRow } from "@/lib/dealScanData";
import { AiInsightsPanel } from "@/app/app/deals/[id]/AiInsightsPanel";

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
      <main className="max-w-[800px] mx-auto p-6">
        <p className="text-muted-foreground text-sm">No workspace selected.</p>
      </main>
    );
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  const aiInsightsFlag = await isFeatureEnabled(service, "ai-insights");
  const showAiInsightsPanel = entitlements.canUseAiInsights && aiInsightsFlag;

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
    <main className="max-w-[800px] mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/app/deals/${dealId}/scans`}
          className="text-muted-foreground text-sm no-underline hover:underline"
        >
          ← Back to scan history
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-foreground mb-2">
          Scan snapshot
        </h1>
        <p className="text-muted-foreground text-sm">
          {d.name}
          {(d.asset_type || d.market) && ` · ${[d.asset_type, d.market].filter(Boolean).join(" · ")}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 text-xs text-muted-foreground">
        <span className="px-2 py-1 bg-muted/50 rounded">
          Scan mode: Fresh
        </span>
        {scan.model && (
          <span className="px-2 py-1 bg-muted/50 rounded">
            Model: {scan.model}
          </span>
        )}
        {scan.prompt_version && (
          <span className="px-2 py-1 bg-muted/50 rounded">
            Prompt version: {scan.prompt_version}
          </span>
        )}
        <span className="px-2 py-1 bg-muted/50 rounded">
          {new Date(scan.created_at).toLocaleString()}
        </span>
        {trend && (
          <span className="px-2 py-1 bg-muted/50 rounded">
            {trendLabels[trend]}
          </span>
        )}
      </div>

      {scan.risk_index_score != null && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            CRE Signal Risk Index™
          </h2>
          <div className="px-5 py-4 border border-border rounded-lg bg-card">
            <div className="text-xl font-bold text-foreground">
              {scan.risk_index_score} — {scan.risk_index_band ?? "—"}
            </div>
            {scan.risk_index_breakdown && (
              <div className="mt-2 text-[13px] text-muted-foreground">
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

      {showAiInsightsPanel && <AiInsightsPanel scanId={scanId} />}

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Assumptions
        </h2>
        {assumptions && Object.keys(assumptions).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-muted-foreground">Key</th>
                  <th className="text-right px-3 py-2 text-muted-foreground">Value</th>
                  <th className="text-left px-3 py-2 text-muted-foreground">Unit</th>
                  <th className="text-left px-3 py-2 text-muted-foreground">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(assumptions).map(([key, cell]) => (
                  <tr key={key} className="border-b border-border">
                    <td className="px-3 py-2 text-foreground">{key.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {cell.value != null ? cell.value : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{cell.unit ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{cell.confidence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No assumptions extracted.</p>
        )}
      </section>

      {prevScan && (diff.added.length > 0 || diff.removed.length > 0 || diff.severityChanges.length > 0) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Compare to previous scan
          </h2>
          <div className="px-5 py-4 border border-border rounded-lg bg-card text-sm">
            {diff.added.length > 0 && (
              <div className="mb-3">
                <strong style={{ color: "#22c55e" }}>Added risks ({diff.added.length}):</strong>
                <ul className="mt-1 pl-5 text-foreground">
                  {diff.added.map((r) => (
                    <li key={r.id}>{r.risk_type} — {r.severity_current}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.removed.length > 0 && (
              <div className="mb-3">
                <strong style={{ color: "#f87171" }}>Removed risks ({diff.removed.length}):</strong>
                <ul className="mt-1 pl-5 text-foreground">
                  {diff.removed.map((r) => (
                    <li key={r.id}>{r.risk_type} — {r.severity_current}</li>
                  ))}
                </ul>
              </div>
            )}
            {diff.severityChanges.length > 0 && (
              <div>
                <strong style={{ color: "#fbbf24" }}>Severity changes ({diff.severityChanges.length}):</strong>
                <ul className="mt-1 pl-5 text-foreground">
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
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Risks ({risks.length})
        </h2>
        {risks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No risks flagged.</p>
        ) : (
          <ul className="list-none p-0 m-0">
            {risks.map((r) => (
              <li
                key={r.id}
                className="px-5 py-4 border border-border rounded-lg mb-3 bg-card"
              >
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span className="font-semibold text-foreground">{r.risk_type}</span>
                  <span className="text-xs text-muted-foreground">
                    Severity: {r.severity_current}
                    {r.severity_original !== r.severity_current && ` (from ${r.severity_original})`}
                  </span>
                </div>
                {r.what_changed_or_trigger && (
                  <p className="mt-2 text-sm text-foreground">
                    {r.what_changed_or_trigger}
                  </p>
                )}
                {r.why_it_matters && (
                  <p className="mt-1 text-[13px] text-muted-foreground">{r.why_it_matters}</p>
                )}
                {r.who_this_affects && (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Affects: {r.who_this_affects}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground/70">
                  {r.recommended_action && `${r.recommended_action} · `}
                  {r.confidence && `Confidence: ${r.confidence}`}
                </p>
                {linksByRisk[r.id]?.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-border">
                    <p className="text-xs text-muted-foreground/70 mb-1">Linked macro signals:</p>
                    <ul className="m-0 pl-[18px] text-[13px] text-muted-foreground">
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
