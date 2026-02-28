# Final Productization Hardening Report

**Date:** 2026-02-28  
**Scope:** Reconciliation and test hardening based on combined diff from 5 transcripts (band consistency, additive patch, portfolio drilldowns, migrations/backfills, methodology polish).

---

## Phase 0 — Verified / Not Found Checklist (internal)

| Item | Status |
|------|--------|
| `lib/bandConsistency.ts` with `checkBandConsistency(score, storedBand, riskIndexVersion)` | Verified |
| Band mismatch surfacing: Deal detail UI, export PDF, IC narrative | Verified |
| Delta comparability: `previous_score`, `delta_score`, `delta_band`, `delta_comparable` in breakdown | Verified |
| Driver share cap: residual bucket + `EDGE_DRIVER_SHARE_CAP_APPLIED` | Verified |
| Unit inference: `EDGE_UNIT_INFERRED` + `review_flag` | Verified |
| Macro timestamp: `EDGE_MACRO_TIMESTAMP_MISSING` in scan route | Verified |
| PDF Data Coverage line | Verified |
| Portfolio: `risk_movement.deal_ids` + table filtering by those IDs | Verified |
| High impact badge + filter chip (`HIGH_IMPACT_RISK`) | Verified |
| URL params + sessionStorage persistence + Reset filters | Verified |
| Backfill scripts: `backfillIcDefaults.ts`, `backfillRiskAuditLog.ts` (dry-run/commit) | Verified |
| Scan route audit insert idempotency (23505 safe) | Verified |
| Methodology PDF: TOC, anti-orphan, footer; Pro gating for export only | Verified |

---

## 1. Consolidated Diff Summary (this pass)

- **`lib/export/exportPdf.test.ts`**  
  - Added test: "Data Coverage line: Review Yes when reviewFlag true" so the Data Coverage line explicitly covers the `Review: Yes` path when `reviewFlag` is true (e.g. band mismatch or unit inference).

- **`lib/robustness.test.ts`**  
  - In the driver share cap test: added assertions that `result.score` and `result.band` are valid; added determinism check that a second `computeRiskIndex` call yields the same `score` and `band` (score/band unchanged by cap; only breakdown attribution changes).

No other files were changed. All behavior from the five transcripts was already present; this pass only added tests and assertions.

---

## 2. Behavioral Guarantees

### Score↔Band consistency

- **Canonical source:** Band is defined only by `riskIndex.scoreToBand(score)` for the current `RISK_INDEX_VERSION`. No other path derives band from score with local thresholds.
- **Display:** All surfaces (deal detail, portfolio table, export PDF, IC narrative) show **stored** `scan.risk_index_score` and `scan.risk_index_band` (set at scan time).
- **Mismatch handling:** When `scan.risk_index_version` matches current `RISK_INDEX_VERSION` and `scoreToBand(score) !== scan.risk_index_band`:
  - Server logs a warning with `scan_id` and `deal_id`.
  - PDF: "Band mismatch detected (expected band: X)." and Data Coverage line shows **Review: Yes**.
  - IC narrative: appended "[Band mismatch detected: expected band for this score is X.]."
  - Deal detail UI: amber "Band mismatch detected (expected: X)" with tooltip.
  - No DB write; display-only.

### Delta comparability

- **When comparable:** Previous scan has same `risk_index_version` as current `RISK_INDEX_VERSION`. Breakdown includes `previous_score`, `delta_score`, `delta_band`, `deterioration_flag`, `delta_comparable: true`.
- **When not comparable:** Version differs or missing. Breakdown has `previous_score`, `delta_comparable: false`; `delta_score`, `delta_band`, `deterioration_flag` are omitted.
- **Portfolio "deteriorated" count:** Only deals with `delta_comparable === true` and `delta_score >= 8` are counted.
- **UI/PDF:** When `previous_score` exists and `delta_comparable === false`, show "Version drift — delta not comparable" (no delta as real deterioration).

### Version drift (portfolio)

- **Definition:** At least two distinct non-empty `risk_index_version` values among deals with scores.
- **Null/empty:** Treated as "unknown"; not counted as a version; deals with null/empty version are never in `versionDriftDealIds`.
- **Majority:** Computed among non-empty versions only; only deals whose non-empty version is not the majority are flagged as drift.

### Driver cap + residual

- No single positive driver (excluding stabilizers) exceeds 40% of total positive contribution; excess is moved to a **residual** driver so totals stay consistent.
- **Score/band:** Unchanged; only attribution (contributions / contribution_pct) changes.
- When any cap is applied, `EDGE_DRIVER_SHARE_CAP_APPLIED` is set in `breakdown.edge_flags`.

### Unit inference

- For **percent-like keys only:** if unit is missing/blank and `0 < value <= 1`, value is treated as fraction and multiplied by 100.
- When inference is used: `EDGE_UNIT_INFERRED` is added to `breakdown.edge_flags` and `breakdown.review_flag` is set to `true`.

### Macro timestamp missing

- Decay uses `deal_signal_links.created_at` first, then `signals.created_at`.
- If any macro-linked item has no timestamp, it is treated as fresh for decay and `EDGE_MACRO_TIMESTAMP_MISSING` is added to `breakdown.edge_flags` in the scan route.

---

## 3. QA Checklist

### Free vs Pro methodology export

1. **Free user:** Open `/app/methodology`. Page content is visible. Click "Download PDF" (or equivalent). Expect: 403 response with `{ code: "PRO_REQUIRED_FOR_EXPORT" }` and client opens PaywallModal.
2. **Pro user:** Same page. Click "Download PDF". Expect: PDF download (non-empty, ≥2 pages, TOC and footer on each page).

### Portfolio drilldowns + reset + persistence

1. **Drilldowns:** On portfolio, open "Risk Movement". Click "Deteriorated" (or Crossed tiers / Version drift). Table filters to deals in that set. Click again to clear. Repeat for "High impact (N)" chip.
2. **Reset filters:** Set search, status, asset/market/tier, sort, risk movement filter, high impact. Click "Reset filters". All filters and sort clear.
3. **Persistence:** Set filters/sort, then open a deal (e.g. click a row). Navigate back to portfolio (browser back or nav). If URL had query params, filters/sort should match URL. If you opened portfolio from nav (no query), filters/sort should restore from sessionStorage.

### Scan route retry safety (audit insert)

1. Trigger a scan that completes and inserts into `risk_audit_log`. Simulate retry (e.g. duplicate request or re-run with same scan_id). Expect: scan response still 200; no 500 from duplicate key; server logs a single warning about duplicate `scan_id` and continues.

### Backfill scripts (dry-run / commit)

1. **`npx tsx scripts/backfillIcDefaults.ts --dry-run`**  
   Prints count of deals with `ic_status` NULL. No updates.

2. **`npx tsx scripts/backfillIcDefaults.ts --commit`**  
   Sets `ic_status = 'PRE_IC'` where NULL. Run only after verifying dry-run count.

3. **`npx tsx scripts/backfillRiskAuditLog.ts --dry-run`**  
   Prints: completed scans with score, already in audit log, rows to insert. No inserts.

4. **`npx tsx scripts/backfillRiskAuditLog.ts --commit`**  
   Inserts audit rows in batches; skips existing `scan_id`. Run only after verifying dry-run.

### PDF spot checks

1. **Band mismatch:** Export PDF for a scan (or mock) with score 62 and stored band "High" (current v2: 62 → Elevated). PDF must show "Band mismatch detected (expected band: Elevated)." and Data Coverage line "Review: Yes".
2. **Version drift:** Export PDF for a scan with `risk_index_breakdown.previous_score` set and `delta_comparable: false`. PDF must show "Version drift — delta not comparable".
3. **Data Coverage line:** Any PDF must show line of the form:  
   `Data Coverage: {present}/{required} ({pct}%) · Confidence: {Low|Medium|High} · Review: {Yes|No}`.
4. **Unit inference:** Run a scan with vacancy 0.38 and no unit. Expect breakdown with `EDGE_UNIT_INFERRED` and `review_flag: true`; PDF Review should be Yes if that scan is exported.

---

## 4. Test and Stress Results

- **Test suite:** `npm test -- --run`: **193 tests passed** (16 files).
- **Stress harness:** `npx tsx scripts/stressRiskIndexV2.ts`: **All assertions passed**  
  - Extreme (scenario 4) score ≥ 70  
  - Missing-only (scenario 2) score ≤ 49  
  - Structural (scenario 3) > missing-only (scenario 2)  
  - Determinism (decimal vs percent normalization)

---

## 5. Migration Order

Apply in order: **024** (deal_scans actual_outcome) → **025** (deals ic_status) → **026** (risk_audit_log). Migration 026 includes a comment that it depends on 024 and 025.
