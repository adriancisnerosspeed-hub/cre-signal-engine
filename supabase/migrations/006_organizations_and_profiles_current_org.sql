-- Migration: Organizations (workspaces) + organization_members + profiles.current_org_id
-- Order: create both tables + indexes; enable RLS; policies on organization_members first; then policies on organizations; then profiles; then trigger.
-- Note: Run migrations 001 and 002 first (002 creates profiles). If profiles is missing, current_org_id is skipped without error.

-- 1) organizations table + indexes (no RLS yet)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);

-- 2) organization_members table + indexes (no RLS yet)
CREATE TABLE IF NOT EXISTS organization_members (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(org_id);

-- 3) Enable RLS on both
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- 4) Policies on organization_members (reference organizations table only; no org RLS dependency)
DROP POLICY IF EXISTS "Members can select org members" ON organization_members;
CREATE POLICY "Members can select org members"
  ON organization_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om2
      WHERE om2.org_id = organization_members.org_id
        AND om2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert self as owner when org creator" ON organization_members;
CREATE POLICY "Users can insert self as owner when org creator"
  ON organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT EXISTS (SELECT 1 FROM organization_members om2 WHERE om2.org_id = organization_members.org_id)
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = organization_members.org_id AND o.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Org owners and admins can update members" ON organization_members;
CREATE POLICY "Org owners and admins can update members"
  ON organization_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om2
      WHERE om2.org_id = organization_members.org_id AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org owners and admins can delete members" ON organization_members;
CREATE POLICY "Org owners and admins can delete members"
  ON organization_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om2
      WHERE om2.org_id = organization_members.org_id AND om2.user_id = auth.uid()
        AND om2.role IN ('owner', 'admin')
    )
  );

-- 5) Policies on organizations (reference organization_members; table now exists)
DROP POLICY IF EXISTS "Users can select orgs they belong to" ON organizations;
CREATE POLICY "Users can select orgs they belong to"
  ON organizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert org with self as created_by" ON organizations;
CREATE POLICY "Users can insert org with self as created_by"
  ON organizations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update orgs they belong to" ON organizations;
CREATE POLICY "Users can update orgs they belong to"
  ON organizations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- 6) profiles.current_org_id (requires profiles table from migration 002; no-op if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_profiles_current_org_id ON profiles(current_org_id);
  END IF;
END $$;

-- 7) set_updated_at() and trigger on organizations
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
