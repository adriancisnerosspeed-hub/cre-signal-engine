-- Phase 1: Append-only governance decision log. No client INSERT; only service role in server code.
-- RLS: org members SELECT only.

CREATE TABLE IF NOT EXISTS governance_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  snapshot_id UUID REFERENCES benchmark_cohort_snapshots(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES risk_policies(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('approve', 'override', 'escalate')),
  note TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_decision_log_org_created
  ON governance_decision_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_decision_log_deal
  ON governance_decision_log(deal_id);
CREATE INDEX IF NOT EXISTS idx_governance_decision_log_policy
  ON governance_decision_log(policy_id);

ALTER TABLE governance_decision_log ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT only; no INSERT/UPDATE/DELETE for authenticated (writes via service role)
DROP POLICY IF EXISTS "Org members can read governance_decision_log" ON governance_decision_log;
CREATE POLICY "Org members can read governance_decision_log"
  ON governance_decision_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = governance_decision_log.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

COMMENT ON TABLE governance_decision_log IS 'Append-only audit log for governance decisions. Writes only via service role in server endpoints (e.g. policy override).';
