import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlements } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { getOrComputeDealBenchmark } from "@/lib/benchmark/compute";
import { BENCHMARK_ERROR_CODES } from "@/lib/benchmark/constants";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: dealId } = await params;
  const snapshotId = new URL(request.url).searchParams.get("snapshot_id");

  const service = createServiceRoleClient();
  const { entitlements } = await getWorkspacePlanAndEntitlements(service, orgId);
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

  if (!snapshotId) {
    return NextResponse.json(
      { code: "SNAPSHOT_REQUIRED", error: "snapshot_id query parameter is required" },
      { status: 400 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("id, organization_id")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { data: snapshotRow } = await service
    .from("benchmark_cohort_snapshots")
    .select("id, cohort_id, as_of_timestamp, method_version, build_status")
    .eq("id", snapshotId)
    .single();

  if (!snapshotRow) {
    return NextResponse.json(
      { code: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_FOUND, error: "Snapshot not found" },
      { status: 404 }
    );
  }

  const snap = snapshotRow as { build_status: string };
  if (snap.build_status !== "SUCCESS") {
    return NextResponse.json(
      {
        code: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_READY,
        error: "Snapshot is not ready (build_status must be SUCCESS)",
      },
      { status: 400 }
    );
  }

  const result = await getOrComputeDealBenchmark(service, {
    dealId,
    snapshotId,
    metricKey: "risk_index_v2",
  });

  if (!result) {
    const { data: member } = await service
      .from("benchmark_snapshot_members")
      .select("deal_id")
      .eq("snapshot_id", snapshotId)
      .eq("deal_id", dealId)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        {
          code: BENCHMARK_ERROR_CODES.VALUE_MISSING_FOR_DEAL,
          error: "Deal is not in this cohort snapshot",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { code: BENCHMARK_ERROR_CODES.SNAPSHOT_NOT_FOUND, error: "Snapshot or metric unavailable" },
      { status: 404 }
    );
  }

  const sn = snapshotRow as { cohort_id: string; as_of_timestamp: string; method_version: string };
  const { data: cohort } = await service
    .from("benchmark_cohorts")
    .select("key")
    .eq("id", sn.cohort_id)
    .single();

  const cohortKey = cohort ? (cohort as { key: string }).key : null;
  const asOfTimestamp = sn.as_of_timestamp;
  const methodVersion = sn.method_version;

  return NextResponse.json({
    cohort_key: cohortKey,
    snapshot_id: result.snapshot_id,
    as_of_timestamp: asOfTimestamp,
    method_version: methodVersion,
    band_version: result.band_version,
    risk_percentile: result.direction_adjusted_percentile,
    risk_band: result.classification_band,
    percentile_midrank: result.percentile_midrank,
    rank_lt: result.count_lt,
    rank_eq: result.count_eq,
    n: result.n,
  });
}
