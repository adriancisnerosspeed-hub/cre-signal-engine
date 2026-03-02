-- Migration: Benchmark Layer — cohorts, snapshots, distributions, deal_benchmarks.
-- Constants (application-side): MIN_COHORT_N=200, BENCHMARK_VALUE_QUANTIZATION=1e-6,
--   PERCENTILE_METHOD_VERSION='midrank_v1', BAND_VERSION='risk_band_v1'.
-- Depends on: 006 (organizations), 007 (deals), 008 (deal_scans), 011 (is_org_member).

-- Enums
DO $$ BEGIN
  CREATE TYPE benchmark_cohort_scope AS ENUM ('GLOBAL', 'WORKSPACE', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE benchmark_cohort_status AS ENUM ('ACTIVE', 'DEPRECATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE benchmark_build_status AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE benchmark_source_type AS ENUM ('INTERNAL_DEALS', 'EXTERNAL_FEED', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- benchmark_cohorts
CREATE TABLE IF NOT EXISTS benchmark_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  scope benchmark_cohort_scope NOT NULL,
  workspace_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status benchmark_cohort_status NOT NULL DEFAULT 'ACTIVE',
  version INT NOT NULL DEFAULT 1,
  rule_hash TEXT,
  source_type benchmark_source_type NOT NULL DEFAULT 'INTERNAL_DEALS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_cohorts_key ON benchmark_cohorts(key);
CREATE INDEX IF NOT EXISTS idx_benchmark_cohorts_workspace ON benchmark_cohorts(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_benchmark_cohorts_scope ON benchmark_cohorts(scope);

-- benchmark_cohort_snapshots
CREATE TABLE IF NOT EXISTS benchmark_cohort_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES benchmark_cohorts(id) ON DELETE CASCADE,
  cohort_version INT NOT NULL,
  as_of_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_hash TEXT,
  n_eligible INT NOT NULL DEFAULT 0,
  quantization DOUBLE PRECISION NOT NULL,
  method_version TEXT NOT NULL DEFAULT 'midrank_v1',
  build_status benchmark_build_status NOT NULL,
  build_error TEXT,
  notes TEXT,
  source_name TEXT,
  source_dataset_version TEXT,
  source_ingested_at TIMESTAMPTZ,
  source_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_cohort ON benchmark_cohort_snapshots(cohort_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_as_of ON benchmark_cohort_snapshots(cohort_id, as_of_timestamp);

-- benchmark_snapshot_members
CREATE TABLE IF NOT EXISTS benchmark_snapshot_members (
  snapshot_id UUID NOT NULL REFERENCES benchmark_cohort_snapshots(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  included_at_score_version TEXT,
  PRIMARY KEY (snapshot_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_members_deal ON benchmark_snapshot_members(deal_id);

-- benchmark_snapshot_distributions
CREATE TABLE IF NOT EXISTS benchmark_snapshot_distributions (
  snapshot_id UUID NOT NULL REFERENCES benchmark_cohort_snapshots(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  values_sorted JSONB NOT NULL,
  n INT NOT NULL,
  min_val DOUBLE PRECISION,
  max_val DOUBLE PRECISION,
  median_val DOUBLE PRECISION,
  PRIMARY KEY (snapshot_id, metric_key)
);

-- deal_benchmarks
CREATE TABLE IF NOT EXISTS deal_benchmarks (
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES benchmark_cohort_snapshots(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  value_quantized DOUBLE PRECISION NOT NULL,
  percentile_midrank DOUBLE PRECISION NOT NULL,
  count_lt INT NOT NULL,
  count_eq INT NOT NULL,
  n INT NOT NULL,
  direction_adjusted_percentile DOUBLE PRECISION NOT NULL,
  classification_band TEXT NOT NULL,
  band_version TEXT NOT NULL DEFAULT 'risk_band_v1',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, snapshot_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_deal_benchmarks_deal ON deal_benchmarks(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_benchmarks_snapshot ON deal_benchmarks(snapshot_id);

-- benchmark_audit_log (minimal: snapshot created/failed)
CREATE TABLE IF NOT EXISTS benchmark_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES benchmark_cohort_snapshots(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  build_status benchmark_build_status,
  n_eligible INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_audit_log_snapshot ON benchmark_audit_log(snapshot_id);

-- RLS: benchmark_cohorts
ALTER TABLE benchmark_cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can select benchmark_cohorts" ON benchmark_cohorts;
CREATE POLICY "Org members can select benchmark_cohorts"
  ON benchmark_cohorts FOR SELECT TO authenticated
  USING (
    scope = 'GLOBAL' OR scope = 'SYSTEM'
    OR (scope = 'WORKSPACE' AND workspace_id IS NOT NULL AND public.is_org_member(workspace_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Org admins can insert benchmark_cohorts" ON benchmark_cohorts;
CREATE POLICY "Org admins can insert benchmark_cohorts"
  ON benchmark_cohorts FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'WORKSPACE' AND workspace_id IS NOT NULL AND public.is_org_member(workspace_id, auth.uid()))
    OR (scope IN ('GLOBAL', 'SYSTEM'))
  );

DROP POLICY IF EXISTS "Org admins can update benchmark_cohorts" ON benchmark_cohorts;
CREATE POLICY "Org admins can update benchmark_cohorts"
  ON benchmark_cohorts FOR UPDATE TO authenticated
  USING (
    (scope = 'WORKSPACE' AND workspace_id IS NOT NULL AND public.is_org_member(workspace_id, auth.uid()))
    OR (scope IN ('GLOBAL', 'SYSTEM'))
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org admins can delete benchmark_cohorts" ON benchmark_cohorts;
CREATE POLICY "Org admins can delete benchmark_cohorts"
  ON benchmark_cohorts FOR DELETE TO authenticated
  USING (
    (scope = 'WORKSPACE' AND workspace_id IS NOT NULL AND public.is_org_member(workspace_id, auth.uid()))
    OR (scope IN ('GLOBAL', 'SYSTEM'))
  );

-- RLS: benchmark_cohort_snapshots (read via cohort visibility)
ALTER TABLE benchmark_cohort_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select snapshots for visible cohorts" ON benchmark_cohort_snapshots;
CREATE POLICY "Select snapshots for visible cohorts"
  ON benchmark_cohort_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM benchmark_cohorts bc
      WHERE bc.id = benchmark_cohort_snapshots.cohort_id
      AND (
        bc.scope IN ('GLOBAL', 'SYSTEM')
        OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid()))
      )
    )
  );

-- Insert/update/delete snapshots: service role or admin only (no policy = deny for authenticated; use service role in API)
DROP POLICY IF EXISTS "Service role inserts snapshots" ON benchmark_cohort_snapshots;
-- Allow org members to insert if they can see the cohort (for build API called with auth)
CREATE POLICY "Org members can insert snapshots for workspace cohorts"
  ON benchmark_cohort_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benchmark_cohorts bc
      WHERE bc.id = cohort_id
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

-- RLS: benchmark_snapshot_members
ALTER TABLE benchmark_snapshot_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select members for visible snapshots" ON benchmark_snapshot_members;
CREATE POLICY "Select members for visible snapshots"
  ON benchmark_snapshot_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM benchmark_cohort_snapshots bcs
      JOIN benchmark_cohorts bc ON bc.id = bcs.cohort_id
      WHERE bcs.id = snapshot_id
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

CREATE POLICY "Insert members with snapshot insert"
  ON benchmark_snapshot_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benchmark_cohort_snapshots bcs
      JOIN benchmark_cohorts bc ON bc.id = bcs.cohort_id
      WHERE bcs.id = snapshot_id
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

-- RLS: benchmark_snapshot_distributions
ALTER TABLE benchmark_snapshot_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select distributions for visible snapshots" ON benchmark_snapshot_distributions;
CREATE POLICY "Select distributions for visible snapshots"
  ON benchmark_snapshot_distributions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM benchmark_cohort_snapshots bcs
      JOIN benchmark_cohorts bc ON bc.id = bcs.cohort_id
      WHERE bcs.id = snapshot_id
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

CREATE POLICY "Insert distributions with snapshot"
  ON benchmark_snapshot_distributions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benchmark_cohort_snapshots bcs
      JOIN benchmark_cohorts bc ON bc.id = bcs.cohort_id
      WHERE bcs.id = snapshot_id
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

-- RLS: deal_benchmarks (read/write via deal's org)
ALTER TABLE deal_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select deal_benchmarks for org deals"
  ON deal_benchmarks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_benchmarks.deal_id
    )
  );

CREATE POLICY "Insert deal_benchmarks for org deals"
  ON deal_benchmarks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_benchmarks.deal_id
    )
  );

CREATE POLICY "Update deal_benchmarks for org deals"
  ON deal_benchmarks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      JOIN organization_members om ON om.org_id = d.organization_id AND om.user_id = auth.uid()
      WHERE d.id = deal_benchmarks.deal_id
    )
  )
  WITH CHECK (true);

-- RLS: benchmark_audit_log (read-only for users who can see snapshots)
ALTER TABLE benchmark_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select audit log for visible snapshots" ON benchmark_audit_log;
CREATE POLICY "Select audit log for visible snapshots"
  ON benchmark_audit_log FOR SELECT TO authenticated
  USING (
    snapshot_id IS NULL
    OR EXISTS (
      SELECT 1 FROM benchmark_cohort_snapshots bcs
      JOIN benchmark_cohorts bc ON bc.id = bcs.cohort_id
      WHERE bcs.id = bcs.cohort_id AND bcs.id = (SELECT cohort_id FROM benchmark_cohort_snapshots WHERE id = benchmark_audit_log.snapshot_id)
      AND (bc.scope IN ('GLOBAL', 'SYSTEM') OR (bc.scope = 'WORKSPACE' AND bc.workspace_id IS NOT NULL AND public.is_org_member(bc.workspace_id, auth.uid())))
    )
  );

DROP POLICY IF EXISTS "Select audit log for visible snapshots" ON benchmark_audit_log;
CREATE POLICY "Select benchmark_audit_log"
  ON benchmark_audit_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert benchmark_audit_log"
  ON benchmark_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE benchmark_cohorts IS 'Benchmark cohort definitions (versioned rules); scope GLOBAL/WORKSPACE/SYSTEM';
COMMENT ON TABLE benchmark_cohort_snapshots IS 'Frozen cohort snapshot for deterministic percentile ranking';
COMMENT ON TABLE deal_benchmarks IS 'Per-deal per-snapshot benchmark results (percentile, band)';
