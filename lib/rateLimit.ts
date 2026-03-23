/**
 * Org-level scan rate limiting (rolling window). Enforcement is in API routes; not a substitute for plan limits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const ORG_SCAN_RATE_LIMIT_PER_HOUR = 20;

export type OrgScanRateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number | null;
};

/**
 * Counts deal_scans rows for the org created in the last `windowMs` (any status) to cap abuse.
 */
export async function getOrgScanCountInWindow(
  service: SupabaseClient,
  orgId: string,
  windowMs: number
): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data: deals, error: dealsError } = await service
    .from("deals")
    .select("id")
    .eq("organization_id", orgId);

  if (dealsError || !deals?.length) {
    return 0;
  }

  const dealIds = (deals as { id: string }[]).map((d) => d.id);
  const { count, error } = await service
    .from("deal_scans")
    .select("id", { count: "exact", head: true })
    .in("deal_id", dealIds)
    .gte("created_at", since);

  if (error) {
    console.warn("[rateLimit] deal_scans count error:", error);
    return 0;
  }

  return count ?? 0;
}

export async function checkOrgScanRateLimit(
  service: SupabaseClient,
  orgId: string,
  options?: { maxPerHour?: number; windowMs?: number }
): Promise<OrgScanRateLimitResult> {
  const maxPerHour = options?.maxPerHour ?? ORG_SCAN_RATE_LIMIT_PER_HOUR;
  const windowMs = options?.windowMs ?? 60 * 60 * 1000;
  const count = await getOrgScanCountInWindow(service, orgId, windowMs);
  const allowed = count < maxPerHour;

  return {
    allowed,
    count,
    limit: maxPerHour,
    retryAfterSec: allowed ? null : Math.ceil(windowMs / 1000),
  };
}
