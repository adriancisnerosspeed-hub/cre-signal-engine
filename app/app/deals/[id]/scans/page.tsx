import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRiskTrend } from "@/lib/riskIndex";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  organization_id: string;
};

type ScanRow = {
  id: string;
  created_at: string;
  model: string | null;
  prompt_version: string | null;
  status: string;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_count?: number;
};

export default async function DealScansPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
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
    .select("id, name, asset_type, market, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) notFound();
  const d = deal as Deal;

  const { data: scans } = await supabase
    .from("deal_scans")
    .select("id, created_at, model, prompt_version, status, risk_index_score, risk_index_band")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  const scanList = (scans ?? []) as ScanRow[];
  const scanIds = scanList.map((s) => s.id);
  const riskCountByScan: Record<string, number> = {};
  scanIds.forEach((id) => (riskCountByScan[id] = 0));
  if (scanIds.length > 0) {
    const { data: allRisks } = await supabase
      .from("deal_risks")
      .select("deal_scan_id")
      .in("deal_scan_id", scanIds);
    for (const r of allRisks ?? []) {
      const sid = (r as { deal_scan_id: string }).deal_scan_id;
      riskCountByScan[sid] = (riskCountByScan[sid] ?? 0) + 1;
    }
  }
  scanList.forEach((s) => {
    s.risk_count = riskCountByScan[s.id] ?? 0;
  });

  const trendLabels: Record<string, string> = {
    increased: "↑ Increased Risk",
    decreased: "↓ Decreased Risk",
    stable: "→ Stable",
  };

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/app/deals/${dealId}`}
          style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}
        >
          ← Back to deal
        </Link>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Scan history
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 24 }}>
        {d.name}
        {(d.asset_type || d.market) && ` · ${[d.asset_type, d.market].filter(Boolean).join(" · ")}`}
      </p>

      {scanList.length === 0 ? (
        <p style={{ color: "#a1a1aa" }}>No scans yet. Run a deal risk scan from the deal page.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scanList.map((scan, i) => {
            const prevScore = scanList[i + 1]?.risk_index_score ?? null;
            const trend = getRiskTrend(scan.risk_index_score ?? null, prevScore);
            return (
              <Link
                key={scan.id}
                href={`/app/deals/${dealId}/scans/${scan.id}`}
                style={{
                  display: "block",
                  padding: "16px 20px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: "#fafafa" }}>
                      {new Date(scan.created_at).toLocaleString()}
                    </span>
                    {scan.model && (
                      <span style={{ marginLeft: 8, fontSize: 13, color: "#a1a1aa" }}>
                        {scan.model}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                    {scan.risk_index_score != null && (
                      <>
                        <span style={{ color: "#e4e4e7" }}>
                          CRE Signal Risk Index™: {scan.risk_index_score} — {scan.risk_index_band ?? "—"}
                        </span>
                        {trend && (
                          <span style={{ color: "#71717a" }}>{trendLabels[trend]}</span>
                        )}
                      </>
                    )}
                    <span style={{ color: "#a1a1aa" }}>
                      {scan.risk_count ?? 0} risk{scan.risk_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                {scan.prompt_version && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71717a" }}>
                    Prompt version: {scan.prompt_version}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
