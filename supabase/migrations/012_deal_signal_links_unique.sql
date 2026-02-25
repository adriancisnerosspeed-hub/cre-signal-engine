-- Migration: Prevent duplicate (deal_risk_id, signal_id) in deal_signal_links
-- Remove duplicates first (keep one row per (deal_risk_id, signal_id) with smallest id)
DELETE FROM deal_signal_links a
USING deal_signal_links b
WHERE a.deal_risk_id = b.deal_risk_id AND a.signal_id = b.signal_id AND a.id > b.id;

ALTER TABLE deal_signal_links
  ADD CONSTRAINT deal_signal_links_deal_risk_signal_unique
  UNIQUE (deal_risk_id, signal_id);
