import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CacheRow = {
  insights: unknown;
  model: string | null;
  expires_at: string | null;
  created_at: string;
};

type EdgePayload = {
  supplemental?: boolean;
  insights?: unknown;
  model?: string;
  disclaimer?: string;
  cached?: boolean;
  error?: string;
};

function isCacheValid(row: CacheRow): boolean {
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await context.params;
  const supabase = await createClient();
  const service = createServiceRoleClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureProfile(supabase, user).catch(() => {});
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(
    service,
    orgId,
    user.id
  );
  if (!entitlements.canUseAiInsights) {
    return NextResponse.json(
      { error: "AI Insights require Analyst+ (PRO+ or Enterprise)" },
      { status: 403 }
    );
  }

  const flagOn = await isFeatureEnabled(service, "ai-insights");
  if (!flagOn) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  const { data: scan } = await service
    .from("deal_scans")
    .select("id, deal_id")
    .eq("id", scanId)
    .maybeSingle();

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { data: deal } = await service
    .from("deals")
    .select("organization_id")
    .eq("id", (scan as { deal_id: string }).deal_id)
    .maybeSingle();

  if (!deal || (deal as { organization_id: string }).organization_id !== orgId) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const { data: cacheRows } = await service
    .from("ai_insights_cache")
    .select("insights, model, expires_at, created_at")
    .eq("deal_scan_id", scanId)
    .order("created_at", { ascending: false })
    .limit(1);

  const cacheRow = cacheRows?.[0] as CacheRow | undefined;
  if (cacheRow && isCacheValid(cacheRow)) {
    return NextResponse.json({
      supplemental: true,
      insights: cacheRow.insights,
      model: cacheRow.model ?? undefined,
      cached: true,
      disclaimer:
        "Supplemental predictive layer — not deterministic; does not replace the CRE Signal Risk Index™ or human underwriting judgment.",
    } satisfies EdgePayload);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const { data: fnData, error: fnError } = await supabase.functions.invoke("ai-insights", {
    body: { deal_scan_id: scanId },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (fnError) {
    console.error("[ai-insights] invoke:", fnError);
    return NextResponse.json(
      { error: fnError.message ?? "Insights generation failed" },
      { status: 502 }
    );
  }

  const payload = fnData as EdgePayload | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid response from insights service" }, { status: 502 });
  }
  if (payload.error) {
    return NextResponse.json({ error: payload.error }, { status: 502 });
  }

  return NextResponse.json({
    supplemental: true,
    insights: payload.insights,
    model: payload.model,
    disclaimer: payload.disclaimer,
    cached: payload.cached ?? false,
  });
}
