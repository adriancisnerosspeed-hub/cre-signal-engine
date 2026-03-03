-- Phase 1: Risk score history for trajectory (score over time). Append-only; INSERT via service role from scan path only.

CREATE TABLE IF NOT EXISTS risk_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  score INT NOT NULL,
  percentile NUMERIC,
  risk_band TEXT,
  snapshot_id UUID REFERENCES benchmark_cohort_snapshots(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_score_history_deal_completed
  ON risk_score_history(deal_id, completed_at DESC);

ALTER TABLE risk_score_history ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT (for trajectory charts); no INSERT/UPDATE/DELETE for authenticated
DROP POLICY IF EXISTS "Org members can read risk_score_history" ON risk_score_history;
CREATE POLICY "Org members can read risk_score_history"
  ON risk_score_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = risk_score_history.deal_id
    )
  );

COMMENT ON TABLE risk_score_history IS 'Append-only history of risk scores per deal scan. Populated from scan-creation path (service role). Used for score-over-time trajectory.';
