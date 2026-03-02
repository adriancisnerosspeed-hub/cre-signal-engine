-- Benchmark layer hardening: snapshot membership provenance + RLS write = service only.
-- Depends on: 029 (benchmark_cohorts, benchmark_cohort_snapshots, benchmark_snapshot_members, deal_benchmarks).

-- 1) Snapshot membership provenance: store scan_id used for eligibility
ALTER TABLE benchmark_snapshot_members
  ADD COLUMN IF NOT EXISTS scan_id UUID REFERENCES deal_scans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_benchmark_members_scan ON benchmark_snapshot_members(scan_id) WHERE scan_id IS NOT NULL;

COMMENT ON COLUMN benchmark_snapshot_members.scan_id IS 'Scan used for eligibility (deal_id + scan_id = provenance for snapshot hash).';

-- 2) RLS: benchmark_cohorts — write restricted to service role (drop authenticated write policies)
DROP POLICY IF EXISTS "Org admins can insert benchmark_cohorts" ON benchmark_cohorts;
DROP POLICY IF EXISTS "Org admins can update benchmark_cohorts" ON benchmark_cohorts;
DROP POLICY IF EXISTS "Org admins can delete benchmark_cohorts" ON benchmark_cohorts;

-- 3) RLS: benchmark_cohort_snapshots — write service only
DROP POLICY IF EXISTS "Org members can insert snapshots for workspace cohorts" ON benchmark_cohort_snapshots;

-- 4) RLS: benchmark_snapshot_members — write service only
DROP POLICY IF EXISTS "Insert members with snapshot insert" ON benchmark_snapshot_members;

-- 5) RLS: benchmark_snapshot_distributions — write service only
DROP POLICY IF EXISTS "Insert distributions with snapshot" ON benchmark_snapshot_distributions;

-- 6) RLS: deal_benchmarks — write service only; immutability (no authenticated update/insert)
DROP POLICY IF EXISTS "Insert deal_benchmarks for org deals" ON deal_benchmarks;
DROP POLICY IF EXISTS "Update deal_benchmarks for org deals" ON deal_benchmarks;
