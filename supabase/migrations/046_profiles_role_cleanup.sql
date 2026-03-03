-- Roles hardening: profiles.role cleanup. Remove legacy free/pro; only platform_admin, platform_dev, platform_support, user.
-- Entitlements must not depend on profiles.role except platform_admin bypass (workspace plan only).

-- Drop constraint first so we can set role = 'user' (current constraint only allows free, pro, platform_admin)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Migrate existing values
UPDATE profiles SET role = 'user' WHERE role IN ('free', 'pro');
UPDATE profiles SET role = 'platform_admin' WHERE role = 'owner';

-- Re-add constraint and default
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('platform_admin', 'platform_dev', 'platform_support', 'user'));

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user';

COMMENT ON COLUMN profiles.role IS 'Platform-level role only: platform_admin, platform_dev, platform_support, user. Bypass only for platform_admin; entitlements from workspace plan.';
