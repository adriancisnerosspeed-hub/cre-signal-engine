-- Migration: Digest preferences and send logging
-- Safe to run on existing DB. Adds user_preferences and digest_sends with RLS.

-- ========== A) user_preferences ==========
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_types TEXT[] NOT NULL DEFAULT ARRAY['Pricing','Credit Availability','Credit Risk','Liquidity','Supply-Demand','Policy','Deal-Specific'],
  actions TEXT[] NOT NULL DEFAULT ARRAY['Act','Monitor'],
  min_confidence TEXT NOT NULL DEFAULT 'Medium' CHECK (min_confidence IN ('Low','Medium','High')),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  digest_time_local TEXT NOT NULL DEFAULT '07:00',
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;

CREATE POLICY "Users can select own preferences"
  ON user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ========== B) digest_sends ==========
CREATE TABLE IF NOT EXISTS digest_sends (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  scheduled_for_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  num_signals INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digest_sends_user_scheduled ON digest_sends(user_id, scheduled_for_date);

ALTER TABLE digest_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own digest_sends" ON digest_sends;

CREATE POLICY "Users can select own digest_sends"
  ON digest_sends FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Inserts/updates from app (manual send) use authenticated user context.
-- Cron uses service role and bypasses RLS for inserts; no policy needed for anon/authenticated insert.
CREATE POLICY "Users can insert own digest_sends"
  ON digest_sends FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
