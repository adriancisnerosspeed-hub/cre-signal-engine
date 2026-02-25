-- Audit trail: do not delete invites on accept; set status and accepted_at.

ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Enforce valid status (backfill existing rows to pending if null)
UPDATE organization_invites SET status = 'pending' WHERE status IS NULL OR status NOT IN ('pending', 'accepted', 'revoked', 'expired');
ALTER TABLE organization_invites DROP CONSTRAINT IF EXISTS organization_invites_status_check;
ALTER TABLE organization_invites ADD CONSTRAINT organization_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'));

CREATE INDEX IF NOT EXISTS idx_organization_invites_status ON organization_invites(org_id, status);
