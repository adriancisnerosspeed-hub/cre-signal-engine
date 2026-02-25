-- Lifetime scan cap for Free plan. Only path that modifies total_full_scans_used is increment_total_full_scans().

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_full_scans_used integer NOT NULL DEFAULT 0;

-- SECURITY DEFINER: atomic increment, returns new value. No negative or manual adjustment.
-- Grant only to service_role; API calls with service role after successful scan commit.
CREATE OR REPLACE FUNCTION public.increment_total_full_scans(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE profiles
  SET total_full_scans_used = total_full_scans_used + 1
  WHERE id = p_user_id
  RETURNING total_full_scans_used INTO new_count;
  IF new_count IS NULL THEN
    RETURN 0;
  END IF;
  RETURN new_count;
END;
$$;

COMMENT ON FUNCTION public.increment_total_full_scans(uuid) IS 'Only mutation path for total_full_scans_used. Call once per successful full scan (Free plan only).';

GRANT EXECUTE ON FUNCTION public.increment_total_full_scans(uuid) TO service_role;
