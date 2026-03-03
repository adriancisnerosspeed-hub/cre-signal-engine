import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentOrgId } from "@/lib/org";
import { getWorkspacePlanAndEntitlementsForUser } from "@/lib/entitlements/workspace";
import { ENTITLEMENT_ERROR_CODES } from "@/lib/entitlements/errors";
import { buildSnapshot } from "@/lib/benchmark/snapshotBuilder";
import { computeBatch } from "@/lib/benchmark/compute";
import { METRIC_RISK_INDEX_V2, BENCHMARK_ERROR_CODES } from "@/lib/benchmark/constants";
import { logSnapshotBuilt } from "@/lib/eventLog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
  if (!entitlements.canBuildSnapshot) {
    return NextResponse.json(
      {
        code: ENTITLEMENT_ERROR_CODES.ENTERPRISE_REQUIRED,
        message: "Snapshot building requires Enterprise plan.",
        required_plan: "ENTERPRISE",
      },
      { status: 403 }
    );
  }

  const { data: member } = await service
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (member as { role?: string } | null)?.role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only workspace owners and admins can build snapshots.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  let body: {
    cohort_id?: string;
    as_of_timestamp?: string;
    metric_keys?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cohortId = typeof body.cohort_id === "string" ? body.cohort_id.trim() : "";
  const asOfTimestamp = typeof body.as_of_timestamp === "string" ? body.as_of_timestamp.trim() : "";

  if (!cohortId || !asOfTimestamp) {
    return NextResponse.json(
      { error: "cohort_id and as_of_timestamp are required" },
      { status: 400 }
    );
  }

  const { data: cohort } = await supabase
    .from("benchmark_cohorts")
    .select("id, workspace_id, scope")
    .eq("id", cohortId)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { code: "COHORT_NOT_FOUND", error: "Cohort not found" },
      { status: 404 }
    );
  }

  const c = cohort as { workspace_id: string | null; scope: string };
  const canBuild =
    c.scope === "GLOBAL" ||
    c.scope === "SYSTEM" ||
    (c.scope === "WORKSPACE" && c.workspace_id === orgId);

  if (!canBuild) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metricKeys = Array.isArray(body.metric_keys)
    ? body.metric_keys.length > 0
      ? body.metric_keys
      : [METRIC_RISK_INDEX_V2]
    : [METRIC_RISK_INDEX_V2];

  const result = await buildSnapshot(service, {
    cohortId,
    asOfTimestamp,
    metricKeys,
  });

  if (!result.snapshotId) {
    return NextResponse.json(
      {
        code: result.buildError ?? "BUILD_FAILED",
        error: result.buildError ?? "Snapshot build failed",
        build_status: result.buildStatus,
        n_eligible: result.nEligible,
      },
      { status: 400 }
    );
  }

  if (result.buildStatus === "SUCCESS") {
    for (const metricKey of metricKeys) {
      await computeBatch(service, { snapshotId: result.snapshotId, metricKey });
    }
  }

  logSnapshotBuilt({
    org_id: orgId,
    user_id: user.id,
    cohort_id: cohortId,
    snapshot_id: result.snapshotId ?? "",
    build_status: result.buildStatus,
    n_eligible: result.nEligible,
  });

  return NextResponse.json({
    snapshot_id: result.snapshotId,
    build_status: result.buildStatus,
    build_error: result.buildError,
    n_eligible: result.nEligible,
  });
}
