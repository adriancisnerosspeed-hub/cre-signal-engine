-- Phase 2: Policy overrides — one override per (deal, policy). Audit via governance_decision_log (service role).

CREATE TABLE IF NOT EXISTS policy_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES risk_policies(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES benchmark_cohort_snapshots(id) ON DELETE SET NULL,
  reason TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, policy_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_deal ON policy_overrides(deal_id);
CREATE INDEX IF NOT EXISTS idx_policy_overrides_policy ON policy_overrides(policy_id);

ALTER TABLE policy_overrides ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT overrides for deals in their org
DROP POLICY IF EXISTS "Org members can read policy_overrides" ON policy_overrides;
CREATE POLICY "Org members can read policy_overrides"
  ON policy_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = policy_overrides.deal_id
    )
  );

-- Only org OWNER/ADMIN can INSERT (override endpoint validates and uses this)
DROP POLICY IF EXISTS "Org owner or admin can insert policy_overrides" ON policy_overrides;
CREATE POLICY "Org owner or admin can insert policy_overrides"
  ON policy_overrides FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
        AND om.role IN ('OWNER', 'ADMIN')
      WHERE d.id = policy_overrides.deal_id
    )
  );

COMMENT ON TABLE policy_overrides IS 'Governance overrides per deal/policy. When created, server inserts into governance_decision_log via service role.';
