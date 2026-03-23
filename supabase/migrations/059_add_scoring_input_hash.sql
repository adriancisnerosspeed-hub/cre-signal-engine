-- v3 determinism: scoring-input-level cache
-- Stores a SHA-256 hash of the canonical scoring inputs (risk_types + severities + confidences + assumption values)
-- so that repeat scans producing identical normalized inputs reuse the exact same score.

ALTER TABLE deal_scans ADD COLUMN IF NOT EXISTS scoring_input_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_deal_scans_scoring_input_hash
  ON deal_scans(deal_id, scoring_input_hash)
  WHERE scoring_input_hash IS NOT NULL AND status = 'completed';
