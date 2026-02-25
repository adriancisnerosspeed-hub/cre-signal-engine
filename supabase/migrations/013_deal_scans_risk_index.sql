-- Migration: CRE Signal Risk Index™ — stored per scan (version-aware, no retroactive change)
-- Add columns to deal_scans for numeric score (0-100), band, and optional breakdown.

ALTER TABLE deal_scans
  ADD COLUMN IF NOT EXISTS risk_index_score INT CHECK (risk_index_score >= 0 AND risk_index_score <= 100),
  ADD COLUMN IF NOT EXISTS risk_index_band TEXT CHECK (risk_index_band IN ('Low', 'Moderate', 'Elevated', 'High')),
  ADD COLUMN IF NOT EXISTS risk_index_breakdown JSONB;

CREATE INDEX IF NOT EXISTS idx_deal_scans_risk_index_band ON deal_scans(risk_index_band) WHERE risk_index_band IS NOT NULL;
