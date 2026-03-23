-- Leads: inserts via service_role (RLS bypass); platform_admin can read.
-- Idempotent: safe if the table was created in a prior partial run.

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  firm TEXT,
  deal_assumptions JSONB DEFAULT '{}',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_platform_admin" ON leads;
CREATE POLICY "leads_select_platform_admin"
  ON leads FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE leads IS 'Marketing/demo leads; writes from server with service role; platform_admin can list.';
