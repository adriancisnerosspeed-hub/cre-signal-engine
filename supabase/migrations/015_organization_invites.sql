-- Migration: Organization invites (Pro-only feature; gate in app by workspace_invites_enabled)

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_org_id ON organization_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(org_id, email);

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

-- Members can select invites for their org; owners/admins can insert and delete
DROP POLICY IF EXISTS "Members can select org invites" ON organization_invites;
CREATE POLICY "Members can select org invites"
  ON organization_invites FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "Owners and admins can insert org invites" ON organization_invites;
CREATE POLICY "Owners and admins can insert org invites"
  ON organization_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

DROP POLICY IF EXISTS "Owners and admins can delete org invites" ON organization_invites;
CREATE POLICY "Owners and admins can delete org invites"
  ON organization_invites FOR DELETE TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));
