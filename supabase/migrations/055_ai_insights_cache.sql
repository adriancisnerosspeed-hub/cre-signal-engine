-- Cached supplemental AI insights per deal scan; org members read via deal join.

CREATE TABLE ai_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  insights JSONB NOT NULL DEFAULT '[]',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_insights_cache_deal_scan_id ON ai_insights_cache(deal_scan_id);
CREATE INDEX idx_ai_insights_cache_expires_at ON ai_insights_cache(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE ai_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_cache_select_org_members"
  ON ai_insights_cache FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM deal_scans ds
      JOIN deals d ON d.id = ds.deal_id
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE ds.id = ai_insights_cache.deal_scan_id
    )
  );

CREATE POLICY "ai_insights_cache_select_platform_admin"
  ON ai_insights_cache FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE ai_insights_cache IS 'Non-deterministic AI insight payloads; writes via service role; org members read.';
