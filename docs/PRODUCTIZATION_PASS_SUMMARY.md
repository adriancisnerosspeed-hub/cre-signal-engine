# Final Productization Pass — Summary

## 1. Consolidated Diff Summary (by file)

### New files
- **`app/api/internal/fixtures/route.ts`** — Internal POST route for QA fixture generation. Auth + owner/ENABLE_FIXTURES gate. Creates deal + 1–2 scans per fixture type (UNIT_INFERENCE, EXTREME_LEVERAGE, VERSION_DRIFT, DRIVER_CAP, DETERIORATION). Returns `{ deal_id, scan_ids }`.
- **`app/api/deals/[id]/export-support-bundle/route.ts`** — GET route for Pro users. Builds in-memory ZIP: `latest_scan.json`, `deal-export.pdf`, `methodology.pdf`, `risk_audit_log.json`, `backtest_summary.json` (if exists). Filename: `cre-signal-support-bundle-{dealName}-{timestamp}.zip`.
- **`app/api/deals/[id]/export-support-bundle/route.test.ts`** — Tests ZIP structure (4–5 files, expected entry names).
- **`lib/fixtureBuilder.ts`** — Pure fixture scenario builder: `buildFixtureScenarios(type)` returns `{ assumptions, risks }[]` per type. No I/O.
- **`lib/fixtureBuilder.test.ts`** — Tests for each fixture type and invalid type.
- **`lib/explainabilityDiff.ts`** — `computeExplainabilityDiff(latestBreakdown, previousBreakdown, deltaComparable)` returns `{ driver, previous_points, current_points, delta_points }[]` sorted by |delta_points|. Safe when breakdown/contributions missing.
- **`lib/explainabilityDiff.test.ts`** — Tests for comparable/not comparable, missing contributions, null safety.
- **`lib/export/getExportPdfPayload.ts`** — Shared server helper: `getExportPdfPayload(service, scanId)` → `ExportPdfParams | null`. Used by support-bundle route only (export-pdf route unchanged).

### Modified files
- **`lib/portfolioSummary.ts`** — Added `model_health` to `PortfolioSummary`: `model_version`, `weighted_avg_score`, `distribution_by_band`, `pct_high`, `pct_elevated`, `governance_locked_at`. Populated from `getRiskModelMetadata()` and existing metrics. Empty-org return also includes `model_health`. Import `getRiskModelMetadata`.
- **`app/app/portfolio/PortfolioClient.tsx`** — Added “Model Health” card (version, distribution %, governance locked). PRPI tooltip updated to “Formula weights” and only the five formula components (30% weighted avg, 25% high, 15% deteriorating, 15% market, 15% asset). Renamed “Reset filters” → “Clear all filters” (same behavior; URL + sessionStorage already updated via state).
- **`app/app/deals/[id]/page.tsx`** — Fetches `risk_index_breakdown` with `contributions`. Computes `explainabilityDiff` when latest scan has `delta_comparable === true` and previous scan exists. Renders “Score Change Drivers” section (top 5 by |delta_points|) in overview tab.
- **`lib/portfolioSummary.test.ts`** — New describe “getPortfolioSummary return shape”: when mock service returns empty deals, asserts `risk_movement`, `risk_movement.deal_ids` (deteriorated, crossed_tiers, version_drift arrays), and `highImpactDealIds` are defined and arrays.
- **`package.json`** — Added dependency `jszip` (support bundle).

---

## 2. Behavior Guarantees

- **computeRiskIndex** — Unchanged; remains pure. No new dependencies inside risk index.
- **RISK_INDEX_VERSION** — Still `"2.0 (Institutional Stable)"`.
- **Existing routes** — No breaking changes. `POST /api/deals`, `POST /api/deals/scan`, `POST /api/deals/export-pdf`, `GET /api/deals/[id]/audit`, etc. unchanged in contract and behavior.
- **Portfolio summary** — `risk_movement` and `risk_movement.deal_ids` always present (empty arrays when none). `highImpactDealIds` always an array. `model_health` always present when summary is returned (empty org and non-empty).
- **Explainability diff** — Shown only when `delta_comparable === true` and previous scan exists. Hidden when no previous scan or not comparable. No crash if `breakdown` or `contributions` missing.
- **Fixtures** — Internal only; allowed when `user.role === "owner"` or `ENABLE_FIXTURES === "true"`. Creates real deal + scans in DB.
- **Support bundle** — Pro-only (`scan_export_enabled`). In-memory ZIP; no serverless storage. Contains 4–5 files depending on backtest availability.
- **Model Health card** — Renders even when `stress_last_run_at` is omitted. No NaN; uses `Number(...).toFixed(1)` and default 0 where needed.
- **Clear all filters** — Resets search, status, asset, market, tier, includeUnscanned, sort, riskMovement, highImpact; URL and sessionStorage updated via existing useEffect.

---

## 3. QA Checklist

- [ ] **Fixtures**  
  - [ ] As owner (or with `ENABLE_FIXTURES=true`), `POST /api/internal/fixtures` with `{ "type": "UNIT_INFERENCE" }` returns `deal_id` and `scan_ids`; deal appears in portfolio; scan shows expected edge/unit behavior.  
  - [ ] Same for `VERSION_DRIFT` (two scans; first has version "1.9", second current).  
  - [ ] Same for `DRIVER_CAP` (one scan; expect driver-share cap edge when applicable).  
  - [ ] Non-owner without `ENABLE_FIXTURES` receives 403.
- [ ] **Support bundle**  
  - [ ] As Pro, `GET /api/deals/{id}/export-support-bundle` for a deal with a completed scan downloads a ZIP.  
  - [ ] ZIP contains `latest_scan.json`, `deal-export.pdf`, `methodology.pdf`, `risk_audit_log.json`; optionally `backtest_summary.json`.  
  - [ ] Each file opens/parses correctly.  
  - [ ] Free user receives 403.
- [ ] **Model Health**  
  - [ ] Portfolio page shows “Model Health” card with version, distribution counts/%, governance locked date.  
  - [ ] No NaN; card still renders with empty or minimal data.
- [ ] **Explainability diff**  
  - [ ] Deal with two comparable scans (same version) shows “Score Change Drivers” with up to 5 rows (driver, previous → current, delta).  
  - [ ] Deal with only one scan, or with version drift (not comparable), does not show the section.  
  - [ ] No crash when breakdown/contributions missing.
- [ ] **Portfolio hardening**  
  - [ ] Risk movement filter works; “Clear all filters” resets all filters and URL/sessionStorage.  
  - [ ] PRPI tooltip shows only the five formula components with weights.  
  - [ ] Band mismatch detection and version drift line still work on scan/detail.  
  - [ ] Data Coverage line still appears where expected.
- [ ] **Regression**  
  - [ ] Deal PDF export and Methodology PDF export still work.  
  - [ ] Full test suite passes (`npm run test`).  
  - [ ] Stress harness passes (`npm run stress:risk`).

---

## 4. TODOs (manual / ops)

- **Stress run timestamp** — `model_health.stress_last_run_at` is not set. To populate it: persist the stress harness run timestamp (e.g. last run time) in a small file or DB row and read it in `getPortfolioSummary` when building `model_health`. Optional; card is valid without it.
- **Internal route protection** — Consider restricting `POST /api/internal/fixtures` by IP or API key in production if `ENABLE_FIXTURES` is ever enabled outside dev/demo.
- **Support bundle backtest** — Backtest summary is included only when `getPortfolioSummary(service, orgId)` returns `backtest_summary` (sample ≥ 20). No change to backtest logic; optional manual check that org has enough outcome data if you expect the file.
