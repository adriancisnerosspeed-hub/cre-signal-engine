-- Invite reliability: outbox for email sending, sent_at and status 'sent', partial unique for active invites.

-- organization_invites: add sent_at, allow status 'sent'
ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE organization_invites DROP CONSTRAINT IF EXISTS organization_invites_status_check;
ALTER TABLE organization_invites ADD CONSTRAINT organization_invites_status_check
  CHECK (status IN ('pending', 'sent', 'accepted', 'revoked', 'expired'));

-- One active invite per (org, email): replace global unique with partial unique so same email can be re-invited after accept/revoke/expire
ALTER TABLE organization_invites DROP CONSTRAINT IF EXISTS organization_invites_org_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invites_org_email_pending_sent
  ON organization_invites (org_id, email)
  WHERE status IN ('pending', 'sent');

-- email_outbox: queue for reliable sending (processor sends via cron)
CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  recipient text NOT NULL,
  payload_json jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status) WHERE status = 'QUEUED';

-- Claim up to lim QUEUED rows (FOR UPDATE SKIP LOCKED) and set status = 'SENDING'. Returns claimed rows.
CREATE OR REPLACE FUNCTION get_and_claim_outbox_rows(lim integer)
RETURNS SETOF email_outbox
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE email_outbox o
  SET status = 'SENDING', updated_at = now()
  FROM (
    SELECT id FROM email_outbox WHERE status = 'QUEUED' ORDER BY created_at LIMIT lim FOR UPDATE SKIP LOCKED
  ) locked
  WHERE o.id = locked.id
  RETURNING o.*;
$$;
