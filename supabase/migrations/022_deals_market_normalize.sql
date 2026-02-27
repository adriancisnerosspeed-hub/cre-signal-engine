-- Add canonical market fields for deterministic Exposure by Market grouping.
-- New/updated deals get market_key + market_label from normalizeMarket() in app.
-- Existing rows: market_key/market_label stay NULL; app derives from market on read.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS market_key text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS market_label text;

CREATE INDEX IF NOT EXISTS idx_deals_market_key ON deals(market_key) WHERE market_key IS NOT NULL;

COMMENT ON COLUMN deals.market_key IS 'Canonical key for grouping: lower(city)|STATE e.g. dallas|TX';
COMMENT ON COLUMN deals.market_label IS 'Display label e.g. Dallas, TX';
