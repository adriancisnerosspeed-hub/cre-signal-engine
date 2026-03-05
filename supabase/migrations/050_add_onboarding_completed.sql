ALTER TABLE organizations ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN organizations.onboarding_completed IS 'True once the user has completed or skipped the onboarding flow';
