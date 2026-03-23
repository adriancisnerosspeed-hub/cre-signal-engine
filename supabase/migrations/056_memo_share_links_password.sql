-- Optional password protection for shared memo links (hash stored server-side).

ALTER TABLE memo_share_links
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN memo_share_links.password_hash IS 'bcrypt hash when share is password-protected; null means open link.';
