-- Migration: IC Memorandum Narrative storage (one per deal_scan)

CREATE TABLE IF NOT EXISTS deal_scan_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_scan_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_scan_narratives_deal_scan_id ON deal_scan_narratives(deal_scan_id);

ALTER TABLE deal_scan_narratives ENABLE ROW LEVEL SECURITY;

-- RLS: same as deal_scans (org via deal)
DROP POLICY IF EXISTS "Members can select deal_scan_narratives" ON deal_scan_narratives;
CREATE POLICY "Members can select deal_scan_narratives"
  ON deal_scan_narratives FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_scan_narratives.deal_scan_id
    )
  );

DROP POLICY IF EXISTS "Members can insert deal_scan_narratives" ON deal_scan_narratives;
CREATE POLICY "Members can insert deal_scan_narratives"
  ON deal_scan_narratives FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_scan_narratives.deal_scan_id
    )
  );

DROP POLICY IF EXISTS "Members can update deal_scan_narratives" ON deal_scan_narratives;
CREATE POLICY "Members can update deal_scan_narratives"
  ON deal_scan_narratives FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = deal_scan_narratives.deal_scan_id
    )
  )
  WITH CHECK (true);
