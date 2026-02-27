-- Backtest/calibration hook: optional actual_outcome fields for future model calibration.
-- Store realized outcomes (e.g. default, disposition) to compare against risk index predictions.

ALTER TABLE deal_scans
  ADD COLUMN IF NOT EXISTS actual_outcome_type TEXT,
  ADD COLUMN IF NOT EXISTS actual_outcome_value NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_outcome_metadata JSONB;

COMMENT ON COLUMN deal_scans.actual_outcome_type IS 'E.g. disposition, default_flag, loss_rate; used for backtest calibration.';
COMMENT ON COLUMN deal_scans.actual_outcome_value IS 'Numeric outcome when applicable (e.g. loss rate 0.02).';
COMMENT ON COLUMN deal_scans.actual_outcome_at IS 'When the outcome was observed or recorded.';
COMMENT ON COLUMN deal_scans.actual_outcome_metadata IS 'Optional extra context (e.g. source, notes) for calibration.';
