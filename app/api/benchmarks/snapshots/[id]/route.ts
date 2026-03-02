import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Snapshot id required" }, { status: 400 });
  }

  const { data: snapshot, error } = await supabase
    .from("benchmark_cohort_snapshots")
    .select(
      "id, cohort_id, cohort_version, as_of_timestamp, created_at, snapshot_hash, n_eligible, quantization, method_version, build_status, build_error"
    )
    .eq("id", id)
    .single();

  if (error || !snapshot) {
    return NextResponse.json(
      { code: "SNAPSHOT_NOT_FOUND", error: "Snapshot not found" },
      { status: 404 }
    );
  }

  const { data: cohort } = await supabase
    .from("benchmark_cohorts")
    .select("key")
    .eq("id", (snapshot as { cohort_id: string }).cohort_id)
    .single();

  const cohortKey = (cohort as { key: string } | null)?.key ?? null;

  return NextResponse.json({
    snapshot_id: (snapshot as { id: string }).id,
    cohort_id: (snapshot as { cohort_id: string }).cohort_id,
    cohort_key: cohortKey,
    cohort_version: (snapshot as { cohort_version: number }).cohort_version,
    as_of_timestamp: (snapshot as { as_of_timestamp: string }).as_of_timestamp,
    created_at: (snapshot as { created_at: string }).created_at,
    snapshot_hash: (snapshot as { snapshot_hash: string | null }).snapshot_hash,
    n_eligible: (snapshot as { n_eligible: number }).n_eligible,
    method_version: (snapshot as { method_version: string }).method_version,
    build_status: (snapshot as { build_status: string }).build_status,
    build_error: (snapshot as { build_error: string | null }).build_error,
  });
}
