-- Role system refactor: platform roles vs workspace roles (never mixed).
-- 1) profiles.role: platform-only. Rename 'owner' → 'platform_admin'.
-- 2) organization_members.role: workspace-only. Standardize to OWNER, ADMIN, MEMBER.

-- ---------- 1) profiles: add platform_admin, backfill owner → platform_admin ----------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('free', 'pro', 'platform_admin'));

UPDATE profiles SET role = 'platform_admin' WHERE role = 'owner';

-- ---------- 2) organization_members: workspace roles OWNER, ADMIN, MEMBER ----------
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
UPDATE organization_members SET role = 'OWNER' WHERE role = 'owner';
UPDATE organization_members SET role = 'ADMIN'  WHERE role = 'admin';
UPDATE organization_members SET role = 'MEMBER' WHERE role = 'member';

ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER'));

-- ---------- 3) RLS helper: workspace OWNER/ADMIN can manage org ----------
CREATE OR REPLACE FUNCTION public.is_org_owner_or_admin(org_id uuid, user_id uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.org_id = is_org_owner_or_admin.org_id
      AND organization_members.user_id = is_org_owner_or_admin.user_id
      AND organization_members.role IN ('OWNER', 'ADMIN')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ---------- 4) organization_members INSERT policy: first member gets OWNER ----------
DROP POLICY IF EXISTS "Users can insert self as owner when org creator" ON organization_members;
CREATE POLICY "Users can insert self as OWNER when org creator"
  ON organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'OWNER'
    AND public.org_has_no_members(org_id)
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = org_id AND o.created_by = auth.uid())
  );

COMMENT ON COLUMN profiles.role IS 'Platform-level role only: free, pro, platform_admin. Do not mix with workspace roles.';
COMMENT ON COLUMN organization_members.role IS 'Workspace-level role only: OWNER, ADMIN, MEMBER. Do not mix with platform roles.';
