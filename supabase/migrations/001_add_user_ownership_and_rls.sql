-- Migration: Add user ownership and RLS to runs and signals tables
-- Date: 2026-02-20
-- Description: Adds user_id columns, enables RLS, and creates policies for per-user data isolation

-- Step 1: Add user_id columns (nullable initially for safe migration)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_user_id ON signals(user_id);

-- Step 3: Enable Row Level Security
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can insert their own runs" ON runs;
DROP POLICY IF EXISTS "Users can select their own runs" ON runs;
DROP POLICY IF EXISTS "Users can insert their own signals" ON signals;
DROP POLICY IF EXISTS "Users can select their own signals" ON signals;

-- Step 5: Create RLS policies for runs table
CREATE POLICY "Users can insert their own runs"
  ON runs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own runs"
  ON runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 6: Create RLS policies for signals table
CREATE POLICY "Users can insert their own signals"
  ON signals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own signals"
  ON signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 7: Optional - Add constraint to enforce NOT NULL after backfill
-- NOTE: Uncomment these lines AFTER you've backfilled existing rows with user_id values
-- or if you're starting fresh and want to enforce NOT NULL immediately.
-- 
-- ALTER TABLE runs ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE signals ALTER COLUMN user_id SET NOT NULL;
