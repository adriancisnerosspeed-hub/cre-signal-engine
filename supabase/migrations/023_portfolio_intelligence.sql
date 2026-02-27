-- Portfolio Intelligence: deals latest denormalized fields, deal_scans versioning, portfolio_views.

-- deals: latest scan denormalized fields
ALTER TABLE deals ADD COLUMN IF NOT EXISTS latest_risk_score INT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS latest_risk_band TEXT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS latest_scanned_at TIMESTAMPTZ NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS scan_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_deals_org_market_key
  ON deals(organization_id, market_key) WHERE market_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_org_latest_risk_score
  ON deals(organization_id, latest_risk_score) WHERE latest_risk_score IS NOT NULL;

-- deal_scans: versioning + macro count persistence
ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS risk_index_version TEXT NULL;
ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS macro_linked_count INT NULL;

-- portfolio_views: saved filter/sort presets (per org; shared or personal)
CREATE TABLE IF NOT EXISTS portfolio_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_views_org ON portfolio_views(organization_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_views_created_by ON portfolio_views(created_by);

ALTER TABLE portfolio_views ENABLE ROW LEVEL SECURITY;

-- RLS: org members can SELECT shared views OR their own; INSERT/UPDATE/DELETE own only
DROP POLICY IF EXISTS "Members can select portfolio_views" ON portfolio_views;
CREATE POLICY "Members can select portfolio_views"
  ON portfolio_views FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (is_shared = true OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own portfolio_views" ON portfolio_views;
CREATE POLICY "Users can insert own portfolio_views"
  ON portfolio_views FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own portfolio_views" ON portfolio_views;
CREATE POLICY "Users can update own portfolio_views"
  ON portfolio_views FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete own portfolio_views" ON portfolio_views;
CREATE POLICY "Users can delete own portfolio_views"
  ON portfolio_views FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- updated_at trigger for portfolio_views
DROP TRIGGER IF EXISTS portfolio_views_updated_at ON portfolio_views;
CREATE TRIGGER portfolio_views_updated_at
  BEFORE UPDATE ON portfolio_views
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON COLUMN deals.latest_risk_score IS 'Denormalized from latest scan for portfolio queries';
COMMENT ON COLUMN deals.latest_scanned_at IS 'When latest scan completed';
COMMENT ON COLUMN deal_scans.risk_index_version IS 'Scoring logic version (e.g. 1.2) for defensibility';
COMMENT ON COLUMN deal_scans.macro_linked_count IS 'Unique macro categories linked (for penalty cap)';
