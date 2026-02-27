import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getPlanForUser } from "@/lib/entitlements";
import { exposureMarketKey, exposureMarketLabel } from "@/lib/normalizeMarket";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PortfolioPage() {
  const supabase = await createClient();
  const service = createServiceRoleClient();
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

  const plan = await getPlanForUser(service, user.id);

  const { data: dealsList } = await service
    .from("deals")
    .select("id, name, asset_type, market, market_key, market_label, latest_scan_id")
    .eq("organization_id", orgId)
    .not("latest_scan_id", "is", null);

  const deals = (dealsList ?? []) as {
    id: string;
    name: string;
    asset_type: string | null;
    market: string | null;
    market_key: string | null;
    market_label: string | null;
    latest_scan_id: string | null;
  }[];

  const scanIds = deals.map((d) => d.latest_scan_id).filter(Boolean) as string[];
  const scansMap: Record<string, { risk_index_score: number | null; risk_index_band: string | null }> = {};
  if (scanIds.length > 0) {
    const { data: scans } = await service
      .from("deal_scans")
      .select("id, risk_index_score, risk_index_band")
      .in("id", scanIds);
    for (const s of scans ?? []) {
      const row = s as { id: string; risk_index_score: number | null; risk_index_band: string | null };
      scansMap[row.id] = { risk_index_score: row.risk_index_score, risk_index_band: row.risk_index_band };
    }
  }

  const withScore = deals
    .filter((d) => {
      const scan = d.latest_scan_id ? scansMap[d.latest_scan_id] : null;
      return scan && scan.risk_index_score != null;
    })
    .map((d) => {
      const scan = scansMap[d.latest_scan_id!];
      return {
        id: d.id,
        name: d.name,
        asset_type: d.asset_type,
        market: d.market,
        market_key: d.market_key,
        market_label: d.market_label,
        risk_index_score: scan.risk_index_score as number,
        risk_index_band: scan.risk_index_band,
      };
    });

  const tierCounts: Record<string, number> = {};
  for (const d of withScore) {
    const band = d.risk_index_band ?? "—";
    tierCounts[band] = (tierCounts[band] ?? 0) + 1;
  }

  const top5 = [...withScore]
    .sort((a, b) => b.risk_index_score - a.risk_index_score)
    .slice(0, 5);

  const byAsset: Record<string, number> = {};
  for (const d of withScore) {
    const at = d.asset_type ?? "Unspecified";
    byAsset[at] = (byAsset[at] ?? 0) + 1;
  }

  const byMarket: Record<string, number> = {};
  const marketLabelByKey: Record<string, string> = {};
  for (const d of withScore) {
    const key = exposureMarketKey(d);
    byMarket[key] = (byMarket[key] ?? 0) + 1;
    if (!marketLabelByKey[key]) marketLabelByKey[key] = exposureMarketLabel(d);
  }

  const isFree = plan === "free";

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/app" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>
        Portfolio
      </h1>
      <p style={{ color: "#a1a1aa", fontSize: 14, marginBottom: 24 }}>
        Exposure overview for your workspace.
      </p>

      {isFree && (
        <div
          style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
          }}
        >
          <p style={{ color: "#e4e4e7", margin: 0 }}>Pro access required.</p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              marginTop: 8,
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      <div
        style={
          isFree
            ? {
                filter: "blur(6px)",
                userSelect: "none",
                pointerEvents: "none" as const,
              }
            : {}
        }
      >
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Distribution by Risk Tier
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {["High", "Elevated", "Moderate", "Low"].map((band) => (
                  <tr key={band} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{band}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                      {tierCounts[band] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Top 5 Highest Risk Deals
          </h2>
          {top5.length === 0 ? (
            <p style={{ color: "#a1a1aa", fontSize: 14 }}>No scanned deals.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Deal</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Score</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((d) => (
                    <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          href={`/app/deals/${d.id}`}
                          style={{ color: "#3b82f6", textDecoration: "none" }}
                        >
                          {d.name}
                        </Link>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                        {d.risk_index_score}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#a1a1aa" }}>
                        {d.risk_index_band ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Exposure by Asset Type
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Asset type</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byAsset)
                  .sort((a, b) => b[1] - a[1])
                  .map(([asset, count]) => (
                    <tr key={asset} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{asset}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                        {count}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
            Exposure by Market
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#a1a1aa" }}>Market</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#a1a1aa" }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byMarket)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => (
                    <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: "8px 12px", color: "#e4e4e7" }}>{marketLabelByKey[key] ?? key}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#fafafa" }}>
                        {count}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
