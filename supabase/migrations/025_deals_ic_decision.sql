-- IC Decision Tracking: status, decision date, notes on deals.
-- IC status does not affect risk score; used for portfolio IC performance summary.

DO $$ BEGIN
  CREATE TYPE ic_status_enum AS ENUM (
    'PRE_IC',
    'APPROVED',
    'APPROVED_WITH_CONDITIONS',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS ic_status ic_status_enum NULL DEFAULT 'PRE_IC';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ic_decision_date DATE NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ic_notes TEXT NULL;

COMMENT ON COLUMN deals.ic_status IS 'Investment Committee decision status; does not affect risk score';
COMMENT ON COLUMN deals.ic_decision_date IS 'Date of IC decision';
COMMENT ON COLUMN deals.ic_notes IS 'Notes from IC (conditions, rationale, etc.)';
