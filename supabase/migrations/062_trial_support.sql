-- Migration 062: Trial support for organizations
-- Adds trial_ends_at and trial_plan columns so FREE orgs can temporarily
-- receive paid-plan entitlements. The plan column stays 'FREE' during trial;
-- the entitlements layer and this RPC check the overlay columns.

-- 1) Add trial columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_plan TEXT DEFAULT NULL;

-- trial_plan must be a valid paid plan slug if set
ALTER TABLE organizations ADD CONSTRAINT organizations_trial_plan_check
  CHECK (trial_plan IS NULL OR trial_plan IN ('PRO', 'PRO+', 'ENTERPRISE'));

-- Index for efficient trial queries
CREATE INDEX IF NOT EXISTS idx_organizations_trial_ends_at
  ON organizations(trial_ends_at) WHERE trial_ends_at IS NOT NULL;

-- 2) Update create_deal_scan_with_usage_check to respect active trial
-- Trial users (plan='FREE' but trial_ends_at > NOW() and trial_plan set)
-- should NOT hit the 3-scan FREE cap.
DROP FUNCTION IF EXISTS public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb);

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
  v_trial_ends timestamptz;
  v_trial_plan text;
  v_count int;
  v_scan_id uuid;
  v_r jsonb;
BEGIN
  -- 1) Lock org, get plan + trial fields
  SELECT o.plan, o.trial_ends_at, o.trial_plan
    INTO v_plan, v_trial_ends, v_trial_plan
    FROM organizations o WHERE o.id = p_workspace_id FOR UPDATE;

  IF v_plan IS NULL THEN
    ok := false;
    scan_id := NULL;
    code := 'ORGANIZATION_NOT_FOUND';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Trial overlay: if FREE with active trial, use trial_plan for cap check
  IF v_plan = 'FREE'
     AND v_trial_ends IS NOT NULL
     AND v_trial_plan IS NOT NULL
     AND v_trial_ends > NOW() THEN
    v_plan := v_trial_plan;
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
  'Atomic: lock org+usage, enforce FREE scan cap (trial-aware), increment usage, insert scan+risks. Returns (ok, scan_id, code); code=PLAN_LIMIT_REACHED when FREE (non-trialing) and count>=3. Service role only.';

REVOKE EXECUTE ON FUNCTION public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deal_scan_with_usage_check(uuid, uuid, jsonb, jsonb) TO service_role;
