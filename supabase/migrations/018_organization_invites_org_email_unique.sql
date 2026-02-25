-- One pending invite per (org, email). Enforces "An invite for this email already exists" (409).
-- Normalize email to lowercase so constraint matches app behavior (insert uses trim + lower).

UPDATE organization_invites SET email = lower(trim(email));

DELETE FROM organization_invites a
USING organization_invites b
WHERE a.org_id = b.org_id AND a.email = b.email AND a.id > b.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organization_invites'::regclass
      AND conname = 'organization_invites_org_email_unique'
  ) THEN
    ALTER TABLE organization_invites
      ADD CONSTRAINT organization_invites_org_email_unique UNIQUE (org_id, email);
  END IF;
END $$;
