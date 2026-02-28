-- Migration: Immutable audit log for risk score changes (one row per completed scan).
-- No UPDATE/DELETE policies: rows cannot be modified once written.
-- Depends on: 024 (deal_scans), 025 (deals). Apply 024 and 025 before this.

CREATE TABLE IF NOT EXISTS risk_audit_log (
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  previous_score INT NULL CHECK (previous_score IS NULL OR (previous_score >= 0 AND previous_score <= 100)),
  new_score INT NOT NULL CHECK (new_score >= 0 AND new_score <= 100),
  delta INT NULL,
  band_change TEXT NULL,
  model_version TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scan_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_audit_log_deal_id ON risk_audit_log(deal_id);

COMMENT ON TABLE risk_audit_log IS 'Immutable log of risk index score changes per scan; append-only, no updates or deletes';

ALTER TABLE risk_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can read audit log for deals in their org
DROP POLICY IF EXISTS "Members can select risk_audit_log" ON risk_audit_log;
CREATE POLICY "Members can select risk_audit_log"
  ON risk_audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = risk_audit_log.deal_id
    )
  );

-- INSERT: org members can insert when completing a scan (no UPDATE/DELETE policies = immutable)
DROP POLICY IF EXISTS "Members can insert risk_audit_log" ON risk_audit_log;
CREATE POLICY "Members can insert risk_audit_log"
  ON risk_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = risk_audit_log.deal_id
    )
  );
