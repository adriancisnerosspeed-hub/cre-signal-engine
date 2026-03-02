-- Migration: Workspace (organization) plan + billing + usage for institutional pricing.
-- Depends on: 006 (organizations). Plan drives entitlements; Stripe is billing only.

-- 1) organizations: plan, billing_status, Stripe fields
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ;

-- CHECK constraints for allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_plan_check
      CHECK (plan IN ('FREE', 'PRO', 'ENTERPRISE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_billing_status_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_billing_status_check
      CHECK (billing_status IN ('inactive', 'active', 'past_due', 'canceled', 'trialing'));
  END IF;
END $$;

-- 2) workspace_usage: lifetime scan count per org (no daily, no resets)
CREATE TABLE IF NOT EXISTS workspace_usage (
  workspace_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  scans_lifetime_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE workspace_usage IS 'Lifetime scan count per workspace (org). Used for FREE plan cap only.';

-- 3) stripe_webhook_events: idempotency (do not process same event twice)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) stripe_webhook_audit: log unmatched or exceptional events (e.g. no_matching_org)
CREATE TABLE IF NOT EXISTS stripe_webhook_audit (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subscription_id TEXT,
  customer_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_audit_event_id ON stripe_webhook_audit(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_audit_created_at ON stripe_webhook_audit(created_at DESC);

-- 5) RPC: atomic scan creation with FREE cap (lock org + usage, check, increment, insert scan + risks)
-- Route then does runOverlay, risk index, update deal_scans score, insert audit, update deals.
CREATE OR REPLACE FUNCTION public.create_deal_scan_with_usage_check(
  p_workspace_id uuid,
  p_deal_id uuid,
  p_scan_row jsonb,
  p_risks jsonb
)
RETURNS uuid
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
  SELECT plan INTO v_plan FROM organizations WHERE id = p_workspace_id FOR UPDATE;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND';
  END IF;

  -- 2) Ensure workspace_usage row exists, then lock it
  INSERT INTO workspace_usage (workspace_id, scans_lifetime_count)
  VALUES (p_workspace_id, 0)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT scans_lifetime_count INTO v_count
  FROM workspace_usage WHERE workspace_id = p_workspace_id FOR UPDATE;

  -- 3) FREE cap check
  IF v_plan = 'FREE' AND v_count >= 3 THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  -- 4) Increment usage
  UPDATE workspace_usage
  SET scans_lifetime_count = scans_lifetime_count + 1, updated_at = NOW()
  WHERE workspace_id = p_workspace_id;

  -- 5) Insert deal_scans (no risk_index_*; route updates those after runOverlay + risk index)
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
  RETURNING id INTO v_scan_id;

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

  RETURN v_scan_id;
END;
$$;

COMMENT ON FUNCTION public.create_deal_scan_with_usage_check(uuid,uuid,jsonb,jsonb) IS
  'Atomic: lock org+usage, enforce FREE scan cap, increment usage, insert scan+risks. Raises PLAN_LIMIT_REACHED if FREE and count>=3.';

GRANT EXECUTE ON FUNCTION public.create_deal_scan_with_usage_check(uuid,uuid,jsonb,jsonb) TO service_role;
