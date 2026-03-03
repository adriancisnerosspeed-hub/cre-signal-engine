-- PATCH 1 hardening: UNIQUE(scan_id) on risk_score_history for idempotent INSERT ... ON CONFLICT (scan_id) DO NOTHING.
-- Ensures at most one history row per scan; no duplicate on RPC retry.

-- Remove duplicates if any (keep one row per scan_id, e.g. lowest id)
DELETE FROM risk_score_history a
USING risk_score_history b
WHERE a.scan_id = b.scan_id AND a.id > b.id;

ALTER TABLE risk_score_history
  ADD CONSTRAINT risk_score_history_scan_id_key UNIQUE (scan_id);

COMMENT ON CONSTRAINT risk_score_history_scan_id_key ON risk_score_history IS 'One history row per scan; enables ON CONFLICT (scan_id) DO NOTHING for idempotent finalize.';
