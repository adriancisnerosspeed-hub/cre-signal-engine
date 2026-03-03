-- Phase 3: Audit log for cohort rule edits (optional). Append-only; RLS SELECT for org members.

CREATE TABLE IF NOT EXISTS benchmark_cohort_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES benchmark_cohorts(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_rule_json JSONB,
  new_rule_json JSONB NOT NULL,
  previous_rule_hash TEXT,
  new_rule_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_benchmark_cohort_audit_cohort ON benchmark_cohort_audit(cohort_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_cohort_audit_changed_at ON benchmark_cohort_audit(changed_at DESC);

ALTER TABLE benchmark_cohort_audit ENABLE ROW LEVEL SECURITY;

-- Org members can SELECT audit rows for cohorts they can see (workspace-scoped or global)
DROP POLICY IF EXISTS "Org members can read benchmark_cohort_audit" ON benchmark_cohort_audit;
CREATE POLICY "Org members can read benchmark_cohort_audit"
  ON benchmark_cohort_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM benchmark_cohorts c
      LEFT JOIN organization_members om ON om.org_id = c.workspace_id AND om.user_id = auth.uid()
      WHERE c.id = benchmark_cohort_audit.cohort_id
        AND (c.scope IN ('GLOBAL', 'SYSTEM') OR (c.scope = 'WORKSPACE' AND om.user_id IS NOT NULL))
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated; server uses service role to append on cohort update
COMMENT ON TABLE benchmark_cohort_audit IS 'Append-only audit of cohort rule_json changes. Written by server on cohort update.';
