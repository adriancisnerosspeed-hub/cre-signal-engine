-- Migration: RPC to increment deal scans with org_id (for usage_daily.organization_id).

CREATE OR REPLACE FUNCTION public.increment_usage_daily_deal_scans_v2(
  p_user_id uuid,
  p_date date,
  p_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO usage_daily (user_id, date, analyze_calls, tokens_estimated, deal_scans, organization_id)
  VALUES (p_user_id, p_date, 0, 0, 1, p_org_id)
  ON CONFLICT (user_id, date) DO UPDATE SET
    deal_scans = usage_daily.deal_scans + 1,
    organization_id = COALESCE(usage_daily.organization_id, p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_usage_daily_deal_scans_v2(uuid, date, uuid) TO service_role;
