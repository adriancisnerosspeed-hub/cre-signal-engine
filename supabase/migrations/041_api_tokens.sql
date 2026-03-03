-- Phase 3: API tokens for Enterprise read-only v1 API. Token-based auth only; no session.

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT api_tokens_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_org ON api_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT tokens for their org (to list/revoke)
DROP POLICY IF EXISTS "Org members can read api_tokens" ON api_tokens;
CREATE POLICY "Org members can read api_tokens"
  ON api_tokens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = api_tokens.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Only OWNER/ADMIN can INSERT (create token)
DROP POLICY IF EXISTS "Org owner or admin can insert api_tokens" ON api_tokens;
CREATE POLICY "Org owner or admin can insert api_tokens"
  ON api_tokens FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_owner_or_admin(organization_id, auth.uid())
  );

-- Only OWNER/ADMIN can DELETE (revoke token)
DROP POLICY IF EXISTS "Org owner or admin can delete api_tokens" ON api_tokens;
CREATE POLICY "Org owner or admin can delete api_tokens"
  ON api_tokens FOR DELETE TO authenticated
  USING (
    public.is_org_owner_or_admin(organization_id, auth.uid())
  );

-- No UPDATE policy for regular auth; service role will update last_used_at
COMMENT ON TABLE api_tokens IS 'Enterprise API tokens for v1 read-only API. Only hash stored. Created/revoked by OWNER/ADMIN.';
