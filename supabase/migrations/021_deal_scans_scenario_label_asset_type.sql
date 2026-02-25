-- Scenario comparison (Base/Conservative) and percentile benchmarking (same asset_type).

ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS scenario_label text;
ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS asset_type text;
ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS market text;

-- Backfill from deals for existing scans
UPDATE deal_scans ds
SET asset_type = d.asset_type, market = d.market
FROM deals d
WHERE ds.deal_id = d.id AND (ds.asset_type IS NULL OR ds.market IS NULL);

CREATE INDEX IF NOT EXISTS idx_deal_scans_asset_type_risk_score
  ON deal_scans(asset_type, risk_index_score)
  WHERE status = 'completed' AND risk_index_score IS NOT NULL;
