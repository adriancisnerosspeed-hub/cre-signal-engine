-- Run this in Supabase SQL Editor if you get "Could not find the 'user_id' column of 'runs'"
-- Then redeploy or wait a minute for schema cache to refresh.

-- 1. Add user_id to runs and signals (if missing)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON signals(user_id);

-- 3. RLS (skip if you already ran 001)
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own runs" ON runs;
DROP POLICY IF EXISTS "Users can select their own runs" ON runs;
CREATE POLICY "Users can insert their own runs" ON runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select their own runs" ON runs FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own signals" ON signals;
DROP POLICY IF EXISTS "Users can select their own signals" ON signals;
CREATE POLICY "Users can insert their own signals" ON signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select their own signals" ON signals FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. Optional: add created_at to runs for rate limiting (if missing)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
