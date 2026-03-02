-- Migration: Risk policies and policy evaluations (audit-grade policy controls).
-- Depends on: 006 (organizations), 011 (is_org_member, is_org_owner_or_admin).

-- risk_policies: one policy = named set of rules per org
CREATE TABLE IF NOT EXISTS risk_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_shared BOOLEAN NOT NULL DEFAULT true,
  severity_threshold TEXT NOT NULL DEFAULT 'warn',
  rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_policies_org ON risk_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_risk_policies_org_enabled ON risk_policies(organization_id, is_enabled);

-- risk_policy_evaluations: snapshots for audit & exports
CREATE TABLE IF NOT EXISTS risk_policy_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES risk_policies(id) ON DELETE CASCADE,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_eval_org ON risk_policy_evaluations(organization_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_eval_policy ON risk_policy_evaluations(policy_id, evaluated_at DESC);

-- Trigger: update risk_policies.updated_at on row update
CREATE OR REPLACE FUNCTION risk_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_policies_updated_at_trigger ON risk_policies;
CREATE TRIGGER risk_policies_updated_at_trigger
  BEFORE UPDATE ON risk_policies
  FOR EACH ROW EXECUTE PROCEDURE risk_policies_updated_at();

-- RLS: risk_policies
ALTER TABLE risk_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can select risk_policies" ON risk_policies;
CREATE POLICY "Org members can select risk_policies"
  ON risk_policies FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Creator or org admin can insert risk_policies" ON risk_policies;
CREATE POLICY "Creator or org admin can insert risk_policies"
  ON risk_policies FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

DROP POLICY IF EXISTS "Creator or org admin can update risk_policies" ON risk_policies;
CREATE POLICY "Creator or org admin can update risk_policies"
  ON risk_policies FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid()) OR public.is_org_owner_or_admin(organization_id, auth.uid())
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Creator or org admin can delete risk_policies" ON risk_policies;
CREATE POLICY "Creator or org admin can delete risk_policies"
  ON risk_policies FOR DELETE TO authenticated
  USING (
    (created_by = auth.uid()) OR public.is_org_owner_or_admin(organization_id, auth.uid())
  );

-- RLS: risk_policy_evaluations (append-only; no UPDATE/DELETE)
ALTER TABLE risk_policy_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can select risk_policy_evaluations" ON risk_policy_evaluations;
CREATE POLICY "Org members can select risk_policy_evaluations"
  ON risk_policy_evaluations FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Org members can insert risk_policy_evaluations" ON risk_policy_evaluations;
CREATE POLICY "Org members can insert risk_policy_evaluations"
  ON risk_policy_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));
