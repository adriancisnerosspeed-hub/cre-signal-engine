-- Retry fields and claim logic: next_attempt_at, max_attempts; claim only eligible rows.

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;

-- Claim eligible rows: QUEUED, or FAILED with attempt_count < max_attempts and next_attempt_at due (not null and <= now())
CREATE OR REPLACE FUNCTION get_and_claim_outbox_rows(lim integer)
RETURNS SETOF email_outbox
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE email_outbox o
  SET status = 'SENDING', updated_at = now()
  FROM (
    SELECT id FROM email_outbox
    WHERE (
      status = 'QUEUED'
      OR (
        status = 'FAILED'
        AND attempt_count < max_attempts
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at <= now()
      )
    )
    ORDER BY created_at
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  ) locked
  WHERE o.id = locked.id
  RETURNING o.*;
$$;
