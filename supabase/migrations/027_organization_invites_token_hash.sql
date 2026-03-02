-- Store hashed invite token; lookup by token_hash on accept. Raw token only in email link.

ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Backfill: hash existing token so existing invite links still work (accept will try both token and token_hash)
UPDATE organization_invites
SET token_hash = encode(digest(token::text, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- New invites store only token_hash; token column nullable for new rows
ALTER TABLE organization_invites ALTER COLUMN token DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_invites_token_hash ON organization_invites(token_hash) WHERE token_hash IS NOT NULL;
