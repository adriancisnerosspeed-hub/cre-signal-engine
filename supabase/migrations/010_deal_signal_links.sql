-- Migration: deal_signal_links for overlay (macro signal ↔ deal risk)

CREATE TABLE IF NOT EXISTS deal_signal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_risk_id UUID NOT NULL REFERENCES deal_risks(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  link_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_signal_links_deal_risk_id ON deal_signal_links(deal_risk_id);
CREATE INDEX IF NOT EXISTS idx_deal_signal_links_signal_id ON deal_signal_links(signal_id);

ALTER TABLE deal_signal_links ENABLE ROW LEVEL SECURITY;

-- RLS: org-scoped via deal_risk → deal_scan → deal
DROP POLICY IF EXISTS "Members can select deal_signal_links" ON deal_signal_links;
CREATE POLICY "Members can select deal_signal_links"
  ON deal_signal_links FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deal_risks dr
      JOIN deal_scans ds ON ds.id = dr.deal_scan_id
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE dr.id = deal_signal_links.deal_risk_id
    )
  );

DROP POLICY IF EXISTS "Members can insert deal_signal_links" ON deal_signal_links;
CREATE POLICY "Members can insert deal_signal_links"
  ON deal_signal_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deal_risks dr
      JOIN deal_scans ds ON ds.id = dr.deal_scan_id
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE dr.id = deal_signal_links.deal_risk_id
    )
  );
