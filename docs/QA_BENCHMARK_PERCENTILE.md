# QA: Benchmark Percentile (No Determinism Drift)

## Context

- **Legacy route** `GET /api/deals/scans/[scanId]/percentile` computed percentile live from completed scans by `asset_type`, with no snapshot or cohort-size gate. It is **deprecated** (410 GONE, `LEGACY_ROUTE_DEPRECATED`).
- **Snapshot-based** percentile is the only supported path: `GET /api/deals/[dealId]/benchmark?snapshot_id=...`. All percentiles must reference a cohort snapshot and method version.

## QA Checklist

- [ ] **No percentile without snapshot**
  - No UI or API returns a percentile unless it is tied to a `snapshot_id` and (where applicable) `cohort_key`, `method_version`, `band_version`.
  - Deal detail “Risk Benchmarking” block uses the snapshot-based deal benchmark API; it obtains a default snapshot via `/api/benchmarks/cohorts` and `/api/benchmarks/snapshots?cohort_id=...`, then calls `/api/deals/[id]/benchmark?snapshot_id=...`.

- [ ] **Legacy route returns 410**
  - `GET /api/deals/scans/:scanId/percentile` returns status **410 GONE** and body `code: "LEGACY_ROUTE_DEPRECATED"` with a migration hint to the snapshot-based endpoint.

- [ ] **Deal benchmark requires snapshot_id**
  - `GET /api/deals/:id/benchmark` without `snapshot_id` returns **400** with `code: "SNAPSHOT_REQUIRED"`.
  - With a FAILED or PARTIAL snapshot, the API does not return percentile; callers see `SNAPSHOT_NOT_FOUND` or `INSUFFICIENT_COHORT_N` as appropriate.

- [ ] **Exports and support bundle match UI**
  - When a deal export or support bundle is generated with a `snapshot_id`, the included percentile and band match the snapshot-based methodology (same `snapshot_id`, `method_version`, `band_version`).
  - Support bundle benchmark artifacts (e.g. `deal_benchmark.json`) and PDF benchmark line are consistent with the snapshot referenced.

- [ ] **Deterministic error codes**
  - `LEGACY_ROUTE_DEPRECATED`, `SNAPSHOT_REQUIRED`, `SNAPSHOT_NOT_FOUND`, `INSUFFICIENT_COHORT_N`, `VALUE_MISSING_FOR_DEAL` are returned where specified and used by UI/export handling.

## Callers updated

| Caller | Change |
|--------|--------|
| `app/app/deals/[id]/PercentileBlock.tsx` | Uses snapshot-based flow: fetch cohorts → snapshots for first cohort → first SUCCESS snapshot → `GET /api/deals/[dealId]/benchmark?snapshot_id=...`. Handles `NO_COHORT_AVAILABLE`, `SNAPSHOT_NOT_READY`, `SNAPSHOT_NOT_FOUND`, `VALUE_MISSING_FOR_DEAL`. |
| `app/app/deals/[id]/page.tsx` | Passes `dealId` into `PercentileBlock` in addition to `scanId` and `plan`. |

## Tests

- `app/api/deals/scans/[scanId]/percentile/route.test.ts`: Legacy route returns 410 and `LEGACY_ROUTE_DEPRECATED`.
- `app/api/deals/[id]/benchmark/route.test.ts`: Missing `snapshot_id` returns 400 and `SNAPSHOT_REQUIRED`.
