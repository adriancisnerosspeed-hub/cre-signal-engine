-- Migration: deal_scans, deal_risks; then add deals.latest_scan_id; indexes.
-- Order: create deal_scans first so deals can reference it.

CREATE TABLE IF NOT EXISTS deal_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  deal_input_id UUID REFERENCES deal_inputs(id) ON DELETE SET NULL,
  input_text_hash TEXT,
  extraction JSONB NOT NULL DEFAULT '{}',
  model TEXT,
  prompt_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Optional key columns for querying
  cap_rate_in NUMERIC,
  exit_cap NUMERIC,
  noi_year1 NUMERIC,
  ltv NUMERIC,
  hold_period_years NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_deal_scans_deal_id_created_at ON deal_scans(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_scans_deal_id_input_text_hash ON deal_scans(deal_id, input_text_hash);

ALTER TABLE deal_scans ENABLE ROW LEVEL SECURITY;

-- RLS: org-scoped via deal
DROP POLICY IF EXISTS "Members can select deal_scans" ON deal_scans;
CREATE POLICY "Members can select deal_scans"
  ON deal_scans FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_scans.deal_id
    )
  );

DROP POLICY IF EXISTS "Members can insert deal_scans" ON deal_scans;
CREATE POLICY "Members can insert deal_scans"
  ON deal_scans FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_scans.deal_id
    )
  );

DROP POLICY IF EXISTS "Members can update deal_scans" ON deal_scans;
CREATE POLICY "Members can update deal_scans"
  ON deal_scans FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_scans.deal_id
    )
  )
  WITH CHECK (true);

-- deal_risks
CREATE TABLE IF NOT EXISTS deal_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  risk_type TEXT NOT NULL,
  severity_original TEXT NOT NULL,
  severity_current TEXT NOT NULL,
  what_changed_or_trigger TEXT,
  why_it_matters TEXT,
  who_this_affects TEXT,
  recommended_action TEXT,
  confidence TEXT,
  evidence_snippets JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_risks_deal_scan_id ON deal_risks(deal_scan_id);

ALTER TABLE deal_risks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can select deal_risks" ON deal_risks;
CREATE POLICY "Members can select deal_risks"
  ON deal_risks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_risks.deal_scan_id
    )
  );

DROP POLICY IF EXISTS "Members can insert deal_risks" ON deal_risks;
CREATE POLICY "Members can insert deal_risks"
  ON deal_risks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_risks.deal_scan_id
    )
  );

DROP POLICY IF EXISTS "Members can update deal_risks" ON deal_risks;
CREATE POLICY "Members can update deal_risks"
  ON deal_risks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_risks.deal_scan_id
    )
  )
  WITH CHECK (true);

-- Add deals.latest_scan_id after deal_scans exists
ALTER TABLE deals ADD COLUMN IF NOT EXISTS latest_scan_id UUID REFERENCES deal_scans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_latest_scan_id ON deals(latest_scan_id);
