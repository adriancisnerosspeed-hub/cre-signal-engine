CREATE TABLE memo_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES deal_scans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_memo_share_links_token ON memo_share_links(token) WHERE revoked_at IS NULL;
CREATE INDEX idx_memo_share_links_scan ON memo_share_links(scan_id);

ALTER TABLE memo_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_share_links" ON memo_share_links
  FOR ALL USING (
    organization_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
