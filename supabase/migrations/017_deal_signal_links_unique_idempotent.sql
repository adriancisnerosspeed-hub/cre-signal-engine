-- Idempotent: ensure UNIQUE(deal_risk_id, signal_id) on deal_signal_links (no duplicate macro links).
-- Safe to run after 010/012; removes any remaining duplicates then adds constraint if missing.

DELETE FROM deal_signal_links a
USING deal_signal_links b
WHERE a.deal_risk_id = b.deal_risk_id AND a.signal_id = b.signal_id AND a.id > b.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deal_signal_links'::regclass
      AND conname = 'deal_signal_links_deal_risk_signal_unique'
  ) THEN
    ALTER TABLE deal_signal_links
      ADD CONSTRAINT deal_signal_links_deal_risk_signal_unique
      UNIQUE (deal_risk_id, signal_id);
  END IF;
END $$;
