-- Migration 061: Monthly scan usage tracking for Starter (PRO) plan 10/month cap
-- Part of pricing tier alignment: enforces monthly scan limits per workspace.

CREATE TABLE public.monthly_scan_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,  -- format: '2026-03'
  scan_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, month_key)
);

CREATE INDEX idx_monthly_scan_usage_org ON public.monthly_scan_usage(org_id);

ALTER TABLE public.monthly_scan_usage ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (scan route uses service client)
CREATE POLICY "service_role_full" ON public.monthly_scan_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Atomic upsert RPC: prevents race conditions on concurrent scans.
-- Returns the new scan_count after incrementing.
CREATE OR REPLACE FUNCTION public.upsert_monthly_scan_usage(
  p_org_id uuid,
  p_month_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO monthly_scan_usage (org_id, month_key, scan_count)
  VALUES (p_org_id, p_month_key, 1)
  ON CONFLICT (org_id, month_key) DO UPDATE
    SET scan_count = monthly_scan_usage.scan_count + 1,
        updated_at = NOW()
  RETURNING scan_count INTO v_count;
  RETURN v_count;
END;
$$;
