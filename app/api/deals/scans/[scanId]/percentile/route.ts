import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy percentile route — DEPRECATED.
 * Percentiles must be snapshot-based and cohort-size gated (governance).
 * Use GET /api/deals/[id]/benchmark?snapshot_id=... instead.
 */
export async function GET(
  _request: Request,
  _context: { params: Promise<{ scanId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      code: "LEGACY_ROUTE_DEPRECATED",
      error:
        "Percentile must be requested via snapshot-based benchmark. Use GET /api/deals/[dealId]/benchmark?snapshot_id=...",
      migration: "GET /api/deals/[dealId]/benchmark?snapshot_id=<snapshot_id>",
    },
    { status: 410 }
  );
}
