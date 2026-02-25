import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsageBanner from "../UsageBanner";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  created_at: string;
};

export default async function DealsPage() {
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
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>Deals</h1>
        <p style={{ color: "#a1a1aa", marginTop: 8 }}>
          No workspace selected. Please sign in again or contact support.
        </p>
      </main>
    );
  }

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, name, asset_type, market, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    const errMsg = error?.message ?? String(error);
    const errCode = (error as { code?: string })?.code;
    console.error("Error fetching deals:", errMsg, errCode ? { code: errCode } : "");
  }

  const list = (deals ?? []) as Deal[];

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <UsageBanner />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>Deals</h1>
        <Link
          href="/app/deals/new"
          style={{
            padding: "10px 20px",
            backgroundColor: "var(--foreground)",
            color: "var(--background)",
            textDecoration: "none",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          New deal
        </Link>
      </div>

      {list.length === 0 ? (
        <p style={{ color: "#a1a1aa" }}>
          No deals yet.{" "}
          <Link href="/app/deals/new" style={{ color: "#3b82f6" }}>
            Create your first deal
          </Link>
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {list.map((deal) => (
            <li
              key={deal.id}
              style={{
                padding: "16px 20px",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                marginBottom: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              <Link
                href={`/app/deals/${deal.id}`}
                style={{
                  color: "var(--foreground)",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                {deal.name}
              </Link>
              {(deal.asset_type || deal.market) && (
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>
                  {[deal.asset_type, deal.market].filter(Boolean).join(" · ")}
                </p>
              )}
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#71717a" }}>
                {new Date(deal.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
