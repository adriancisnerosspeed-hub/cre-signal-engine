import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { getPortfolioSummary } from "@/lib/portfolioSummary";
import { BENCHMARK_ERROR_CODES } from "@/lib/benchmark/constants";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id);
  if (!entitlements.canUseBenchmark) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.FEATURE_NOT_AVAILABLE,
        message: "Benchmark access is not available on this plan.",
        required_plan: "PRO",
      },
      { status: 403 }
    );
  }

  const snapshotId = new URL(request.url).searchParams.get("snapshot_id");
  if (!snapshotId) {
    return NextResponse.json(
      { code: "SNAPSHOT_REQUIRED", error: "snapshot_id query parameter is required" },
      { status: 400 }
    );
  }

  const { data: snapshot } = await service
    .from("benchmark_cohort_snapshots")
    .select("id, cohort_id, as_of_timestamp, build_status, n_eligible, method_version")
    .eq("id", snapshotId)
    .single();

  if (!snapshot) {
    return NextResponse.json(
      { code: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_FOUND, error: "Snapshot not found" },
      { status: 404 }
    );
  }

  const sn = snapshot as {
    cohort_id: string;
    as_of_timestamp: string;
    build_status: string;
    n_eligible: number;
    method_version: string;
  };

  if (sn.build_status !== "SUCCESS") {
    return NextResponse.json({
      cohort_key: null,
      snapshot_id: snapshotId,
      as_of_timestamp: sn.as_of_timestamp,
      method_version: sn.method_version,
      band_version: "risk_band_v1",
      code: BENCHMARK_ERROR_CODES.INSUFFICIENT_COHORT_N,
      band_distribution: {},
      concentration: { p90_plus_pct: 0, p90_plus_count: 0 },
    });
  }

  const { data: cohort } = await service
    .from("benchmark_cohorts")
    .select("key")
    .eq("id", sn.cohort_id)
    .single();

  const cohortKey = cohort ? (cohort as { key: string }).key : null;
  const portfolio = await getPortfolioSummary(service, orgId);
  const portfolioDealIds = new Set(portfolio.deals.map((d) => d.id));

  if (portfolioDealIds.size === 0) {
    return NextResponse.json({
      cohort_key: cohortKey,
      snapshot_id: snapshotId,
      as_of_timestamp: sn.as_of_timestamp,
      method_version: sn.method_version,
      band_version: "risk_band_v1",
      band_distribution: { SEVERE: 0, ELEVATED: 0, TYPICAL: 0, LOW: 0, VERY_LOW: 0 },
      concentration: { p90_plus_pct: 0, p90_plus_count: 0 },
      n_portfolio_deals: 0,
      n_with_benchmark: 0,
    });
  }

  const { data: benchmarks } = await service
    .from("deal_benchmarks")
    .select("deal_id, classification_band, direction_adjusted_percentile")
    .eq("snapshot_id", snapshotId)
    .eq("metric_key", "risk_index_v2")
    .in("deal_id", Array.from(portfolioDealIds));

  const bandCounts: Record<string, number> = {
    SEVERE: 0,
    ELEVATED: 0,
    TYPICAL: 0,
    LOW: 0,
    VERY_LOW: 0,
  };
  let p90PlusCount = 0;

  for (const row of benchmarks ?? []) {
    const r = row as { deal_id: string; classification_band: string; direction_adjusted_percentile: number };
    if (!portfolioDealIds.has(r.deal_id)) continue;
    bandCounts[r.classification_band] = (bandCounts[r.classification_band] ?? 0) + 1;
    if (r.direction_adjusted_percentile >= 90) p90PlusCount++;
  }

  const nWithBenchmark = (benchmarks ?? []).length;
  const p90PlusPct = nWithBenchmark > 0 ? (p90PlusCount / nWithBenchmark) * 100 : 0;

  return NextResponse.json({
    cohort_key: cohortKey,
    snapshot_id: snapshotId,
    as_of_timestamp: sn.as_of_timestamp,
    method_version: sn.method_version,
    band_version: "risk_band_v1",
    band_distribution: bandCounts,
    concentration: {
      p90_plus_pct: Math.round(p90PlusPct * 10) / 10,
      p90_plus_count: p90PlusCount,
    },
    n_portfolio_deals: portfolioDealIds.size,
    n_with_benchmark: nWithBenchmark,
  });
}
