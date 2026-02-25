-- Migration: Fix infinite recursion in organization_members (and simplify organizations) RLS
-- Policies that read organization_members from within organization_members trigger RLS again.
-- Use SECURITY DEFINER helpers so the check bypasses RLS. Bootstrap (service role) is unchanged.

-- Helper: true if user_id is a member of org_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid, user_id uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.org_id = is_org_member.org_id
      AND organization_members.user_id = is_org_member.user_id
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Helper: true if user_id is owner or admin of org_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_org_owner_or_admin(org_id uuid, user_id uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.org_id = is_org_owner_or_admin.org_id
      AND organization_members.user_id = is_org_owner_or_admin.user_id
      AND organization_members.role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Helper: true if the org has no members (for "insert self as first owner" check)
CREATE OR REPLACE FUNCTION public.org_has_no_members(org_uuid uuid)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM organization_members WHERE org_id = org_uuid);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ---------- organization_members: use helpers (no self-query) ----------
DROP POLICY IF EXISTS "Members can select org members" ON organization_members;
CREATE POLICY "Members can select org members"
  ON organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert self as owner when org creator" ON organization_members;
CREATE POLICY "Users can insert self as owner when org creator"
  ON organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND public.org_has_no_members(org_id)
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = org_id AND o.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Org owners and admins can update members" ON organization_members;
CREATE POLICY "Org owners and admins can update members"
  ON organization_members FOR UPDATE TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()))
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org owners and admins can delete members" ON organization_members;
CREATE POLICY "Org owners and admins can delete members"
  ON organization_members FOR DELETE TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));

-- ---------- organizations: use helper instead of querying organization_members ----------
DROP POLICY IF EXISTS "Users can select orgs they belong to" ON organizations;
CREATE POLICY "Users can select orgs they belong to"
  ON organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));

DROP POLICY IF EXISTS "Users can update orgs they belong to" ON organizations;
CREATE POLICY "Users can update orgs they belong to"
  ON organizations FOR UPDATE TO authenticated
  USING (public.is_org_member(id, auth.uid()))
  WITH CHECK (true);
