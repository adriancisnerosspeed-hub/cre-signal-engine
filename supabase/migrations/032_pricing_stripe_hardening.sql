-- Migration: Pricing/Stripe hardening
-- 1) RPC create_deal_scan_with_usage_check: only service_role can execute
-- 2) Cap check returns composite {ok, scan_id, code} instead of raising (deterministic)
-- 3) billing_audit_log for plan/status transitions

-- Drop so we can change return type (uuid -> TABLE); then recreate and lock down permissions
DROP FUNCTION IF EXISTS public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb);

-- Recreate: return composite so cap enforcement never throws; route maps code deterministically
CREATE FUNCTION public.create_deal_scan_with_usage_check(
  p_workspace_id uuid,
  p_deal_id uuid,
  p_scan_row jsonb,
  p_risks jsonb
)
RETURNS TABLE(ok boolean, scan_id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_count int;
  v_scan_id uuid;
  v_r jsonb;
BEGIN
  -- 1) Lock org, get plan
  SELECT o.plan INTO v_plan FROM organizations o WHERE o.id = p_workspace_id FOR UPDATE;
  IF v_plan IS NULL THEN
    ok := false;
    scan_id := NULL;
    code := 'ORGANIZATION_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Ensure workspace_usage row exists, then lock it
  INSERT INTO workspace_usage (workspace_id, scans_lifetime_count)
  VALUES (p_workspace_id, 0)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT w.scans_lifetime_count INTO v_count
  FROM workspace_usage w WHERE w.workspace_id = p_workspace_id FOR UPDATE;

  -- 3) FREE cap check: return deterministic code instead of raising
  IF v_plan = 'FREE' AND v_count >= 3 THEN
    ok := false;
    scan_id := NULL;
    code := 'PLAN_LIMIT_REACHED';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4) Increment usage
  UPDATE workspace_usage
  SET scans_lifetime_count = scans_lifetime_count + 1, updated_at = NOW()
  WHERE workspace_usage.workspace_id = p_workspace_id;

  -- 5) Insert deal_scans
  INSERT INTO deal_scans (
    deal_id, deal_input_id, input_text_hash, extraction, status, completed_at,
    model, prompt_version, cap_rate_in, exit_cap, noi_year1, ltv, hold_period_years,
    asset_type, market
  ) VALUES (
    p_deal_id,
    (p_scan_row->>'deal_input_id')::uuid,
    p_scan_row->>'input_text_hash',
    COALESCE(p_scan_row->'extraction', '{}'::jsonb),
    COALESCE(p_scan_row->>'status', 'completed'),
    (p_scan_row->>'completed_at')::timestamptz,
    p_scan_row->>'model',
    p_scan_row->>'prompt_version',
    (p_scan_row->>'cap_rate_in')::numeric,
    (p_scan_row->>'exit_cap')::numeric,
    (p_scan_row->>'noi_year1')::numeric,
    (p_scan_row->>'ltv')::numeric,
    (p_scan_row->>'hold_period_years')::numeric,
    p_scan_row->>'asset_type',
    p_scan_row->>'market'
  )
  RETURNING deal_scans.id INTO v_scan_id;

  -- 6) Insert deal_risks
  FOR v_r IN SELECT * FROM jsonb_array_elements(p_risks)
  LOOP
    INSERT INTO deal_risks (
      deal_scan_id, risk_type, severity_original, severity_current,
      what_changed_or_trigger, why_it_matters, who_this_affects,
      recommended_action, confidence, evidence_snippets
    ) VALUES (
      v_scan_id,
      v_r->>'risk_type',
      v_r->>'severity_original',
      v_r->>'severity_current',
      v_r->>'what_changed_or_trigger',
      v_r->>'why_it_matters',
      v_r->>'who_this_affects',
      v_r->>'recommended_action',
      v_r->>'confidence',
      COALESCE(v_r->'evidence_snippets', '[]'::jsonb)
    );
  END LOOP;

  ok := true;
  scan_id := v_scan_id;
  code := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.create_deal_scan_with_usage_check(uuid,uuid,jsonb,jsonb) IS
  'Atomic: lock org+usage, enforce FREE scan cap, increment usage, insert scan+risks. Returns (ok, scan_id, code); code=PLAN_LIMIT_REACHED when FREE and count>=3. Service role only.';

-- Only service_role can execute (no authenticated/anon)
REVOKE EXECUTE ON FUNCTION public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb) TO service_role;

-- Billing audit log: plan/status transitions for "why did we downgrade this org?"
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id TEXT,
  old_plan TEXT,
  new_plan TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_log_org ON billing_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_log_created_at ON billing_audit_log(created_at DESC);

COMMENT ON TABLE billing_audit_log IS 'Audit trail when org plan or billing_status changes (Stripe webhook).';
