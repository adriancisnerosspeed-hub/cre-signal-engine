-- Atomic increment for usage_daily to avoid race conditions.
-- Called by server (service role) only.

CREATE OR REPLACE FUNCTION public.increment_usage_daily(
  p_user_id uuid,
  p_date date,
  p_tokens_estimated int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO usage_daily (user_id, date, analyze_calls, tokens_estimated)
  VALUES (p_user_id, p_date, 1, p_tokens_estimated)
  ON CONFLICT (user_id, date) DO UPDATE SET
    analyze_calls = usage_daily.analyze_calls + 1,
    tokens_estimated = usage_daily.tokens_estimated + EXCLUDED.tokens_estimated;
END;
$$;

-- Allow service role (server) to call; authenticated not needed for writes.
GRANT EXECUTE ON FUNCTION public.increment_usage_daily(uuid, date, int) TO service_role;
