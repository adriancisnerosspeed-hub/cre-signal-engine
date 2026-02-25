-- Migration: deals and deal_inputs (no latest_scan_id yet; added after deal_scans exists)
-- Indexes: deals(organization_id), deal_inputs(deal_id, created_at DESC)

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT,
  market TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_organization_id ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Select/insert/update/delete for users who are members of the deal's org
DROP POLICY IF EXISTS "Members can select deals" ON deals;
CREATE POLICY "Members can select deals"
  ON deals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = deals.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can insert deals" ON deals;
CREATE POLICY "Members can insert deals"
  ON deals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = deals.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can update deals" ON deals;
CREATE POLICY "Members can update deals"
  ON deals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = deals.organization_id AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members can delete deals" ON deals;
CREATE POLICY "Members can delete deals"
  ON deals FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = deals.organization_id AND om.user_id = auth.uid()
    )
  );

-- updated_at trigger for deals
DROP TRIGGER IF EXISTS deals_updated_at ON deals;
CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- deal_inputs
CREATE TABLE IF NOT EXISTS deal_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_inputs_deal_id_created_at ON deal_inputs(deal_id, created_at DESC);

ALTER TABLE deal_inputs ENABLE ROW LEVEL SECURITY;

-- RLS: same as deals (via deal → org)
DROP POLICY IF EXISTS "Members can select deal_inputs" ON deal_inputs;
CREATE POLICY "Members can select deal_inputs"
  ON deal_inputs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_inputs.deal_id
    )
  );

DROP POLICY IF EXISTS "Members can insert deal_inputs" ON deal_inputs;
CREATE POLICY "Members can insert deal_inputs"
  ON deal_inputs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_inputs.deal_id
    )
  );

DROP POLICY IF EXISTS "Members can update deal_inputs" ON deal_inputs;
CREATE POLICY "Members can update deal_inputs"
  ON deal_inputs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_inputs.deal_id
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members can delete deal_inputs" ON deal_inputs;
CREATE POLICY "Members can delete deal_inputs"
  ON deal_inputs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_inputs.deal_id
    )
  );
