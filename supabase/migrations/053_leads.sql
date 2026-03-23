-- Leads: inserts via service_role (RLS bypass); platform_admin can read.

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  firm TEXT,
  deal_assumptions JSONB DEFAULT '{}',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_email ON leads(email);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_platform_admin"
  ON leads FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE leads IS 'Marketing/demo leads; writes from server with service role; platform_admin can list.';
