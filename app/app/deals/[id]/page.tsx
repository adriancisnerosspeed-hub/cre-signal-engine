import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DealDetailClient from "./DealDetailClient";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  latest_scan_id: string | null;
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

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
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
    .select("id, name, asset_type, market, latest_scan_id, created_at")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) {
    notFound();
  }

  const d = deal as Deal;
  let scan: DealScan | null = null;
  let risks: DealRisk[] = [];

  if (d.latest_scan_id) {
    const { data: scanRow } = await supabase
      .from("deal_scans")
      .select("id, extraction, status, created_at, model, prompt_version, cap_rate_in, exit_cap, noi_year1, ltv, hold_period_years")
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
        <DealDetailClient dealId={d.id} hasScan={!!scan} />
      </div>

      {!scan && (
        <section style={{ marginBottom: 32 }}>
          <p style={{ color: "#a1a1aa" }}>
            No scan yet. Run a Deal Risk Scan to extract assumptions and risks from your underwriting text.
          </p>
        </section>
      )}

      {scan && (
        <>
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
    </main>
  );
}
