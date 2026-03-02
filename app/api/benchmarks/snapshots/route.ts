import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

/**
 * List benchmark snapshots (for UI to pick a default snapshot_id).
 * Query: cohort_id (optional) — filter by cohort; returns recent snapshots by created_at desc.
 * RLS-safe: when cohort_id is provided, verifies cohort is visible to requester (404 if not).
 */
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

  const { searchParams } = new URL(request.url);
  const cohortId = searchParams.get("cohort_id");
  const limit = Math.min(Number.parseInt(searchParams.get("limit") ?? "10", 10) || 10, 50);

  if (cohortId) {
    const { data: cohort } = await supabase
      .from("benchmark_cohorts")
      .select("id")
      .eq("id", cohortId)
      .single();
    if (!cohort) {
      return NextResponse.json(
        { code: "COHORT_NOT_FOUND", error: "Cohort not found or not visible" },
        { status: 404 }
      );
    }
  }

  let query = supabase
    .from("benchmark_cohort_snapshots")
    .select("id, cohort_id, cohort_version, as_of_timestamp, created_at, n_eligible, build_status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cohortId) {
    query = query.eq("cohort_id", cohortId);
  }

  const { data: snapshots, error } = await query;

  if (error) {
    console.error("[benchmarks/snapshots] list error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (snapshots ?? []) as {
    id: string;
    cohort_id: string;
    cohort_version: number;
    as_of_timestamp: string;
    created_at: string;
    n_eligible: number;
    build_status: string;
  }[];

  const list = rows.map((s) => ({
    snapshot_id: s.id,
    cohort_id: s.cohort_id,
    cohort_version: s.cohort_version,
    as_of_timestamp: s.as_of_timestamp,
    created_at: s.created_at,
    n_eligible: s.n_eligible,
    build_status: s.build_status,
  }));

  return NextResponse.json(list);
}
