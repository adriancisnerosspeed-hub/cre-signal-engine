-- Migration: usage_daily.deal_scans column + optional organization_id; RPC to increment deal_scans.

ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS deal_scans INT NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.increment_usage_daily_deal_scans(
  p_user_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO usage_daily (user_id, date, analyze_calls, tokens_estimated, deal_scans)
  VALUES (p_user_id, p_date, 0, 0, 1)
  ON CONFLICT (user_id, date) DO UPDATE SET
    deal_scans = usage_daily.deal_scans + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_usage_daily_deal_scans(uuid, date) TO service_role;
