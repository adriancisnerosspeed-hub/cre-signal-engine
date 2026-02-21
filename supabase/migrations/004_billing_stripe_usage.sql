-- Migration: Billing (Stripe) + usage tracking
-- Safe to run on existing DB.

-- A) stripe_customers
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can select own stripe_customers" ON stripe_customers;
CREATE POLICY "Users can select own stripe_customers"
  ON stripe_customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own stripe_customers" ON stripe_customers;
CREATE POLICY "Users can insert own stripe_customers"
  ON stripe_customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- B) subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can select own subscriptions" ON subscriptions;
CREATE POLICY "Users can select own subscriptions"
  ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- C) usage_daily
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  analyze_calls INT NOT NULL DEFAULT 0,
  tokens_estimated INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can select own usage_daily" ON usage_daily;
CREATE POLICY "Users can select own usage_daily"
  ON usage_daily FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Inserts/updates from server (analyze route, webhook) use service role; no INSERT/UPDATE policy for anon/authenticated.
-- profiles.role already exists ('free','owner','pro'); webhook will set role to 'pro' or 'free'.
