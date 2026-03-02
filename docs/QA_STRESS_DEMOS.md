# QA / Stress Demo Scenarios

Manual and automated checks for band mismatch, unit inference, and version drift.

---

## 1) Band mismatch demo (intentional)

**Goal:** Confirm that when stored band does not match `scoreToBand(score)`, the system surfaces the mismatch (PDF, IC narrative, deal UI) and sets Review: Yes.

**Admin override:** There is no admin or API path to force a scan’s stored band to an incorrect value. The band is always set from `computeRiskIndex` in the scan route.

**Automated coverage:** Rely on unit tests:

- **`lib/bandConsistency.test.ts`**  
  - `score=62`, `storedBand="High"` with current version → `mismatch: true`, `expectedBand: "Elevated"`.
- **`lib/export/exportPdf.test.ts`**  
  - Build PDF with `bandMismatch: true`, `bandMismatchExpectedBand: "Elevated"` → mismatch line and Review: Yes via `getBandMismatchPdfBehavior`.

To demo manually you would need an admin-only way to write a scan with e.g. `risk_index_score: 62` and `risk_index_band: "High"`; without that, the unit tests above are the authoritative check.

---

## 2) Unit inference trigger

**Goal:** When percent-like fields have **unit blank** and value in `(0, 1]`, the system infers fraction → percent, sets `EDGE_UNIT_INFERRED`, and sets `review_flag: true`.

**Example inputs:**

- Vacancy: `0.38` (unit blank)
- LTV: `0.92` (unit blank)

**Expected:** After normalization: vacancy = 38, LTV = 92; `unitInferred === true`. The scan route then adds `EDGE_UNIT_INFERRED` to `risk_index_breakdown.edge_flags` and `review_flag: true`.

**Automated coverage:**

- **`lib/assumptionNormalization.test.ts`**  
  - `normalizeAssumptionsForScoringWithFlags({ vacancy: 0.38, unit: null }, { ltv: 0.92, unit: undefined })` → `assumptions.vacancy.value === 38`, `assumptions.ltv.value === 92`, `unitInferred === true`.  
  - The scan route (see `app/api/deals/scan/route.ts`) uses this flag to set `EDGE_UNIT_INFERRED` and `review_flag` on the breakdown.

**Manual check (optional):** Run a scan whose extraction supplies vacancy 0.38 and LTV 0.92 with no unit; confirm the completed scan’s `risk_index_breakdown` includes `EDGE_UNIT_INFERRED` and `review_flag: true`, and that the export PDF shows Review: Yes.

---

## 3) Delta not comparable (version drift)

**Goal:** When the **previous** scan was scored with a different `risk_index_version`, the new scan’s breakdown has `previous_score` set but `delta_comparable: false` and no `delta_score`/`delta_band`/`deterioration_flag`. PDF and portfolio show “Version drift — delta not comparable”.

**Automated coverage:**

- **`lib/robustness.test.ts`**  
  - `computeRiskIndex` with `previous_score: 40`, `previous_risk_index_version: "1.0 (Legacy)"` → `previous_score: 40`, `delta_comparable: false`, and `delta_score`/`delta_band`/`deterioration_flag` undefined.
- **`lib/export/exportPdf.test.ts`**  
  - Build PDF with `riskBreakdown: { previous_score: 45, delta_comparable: false }` → version drift line rendered; `getVersionDriftLineForTest` returns the expected string.

**Manual QA (test environment):**

1. Scan a deal under the **current** risk index version (so it has `risk_index_version` set, e.g. `"2.0 (Institutional Stable)"`).
2. In the DB, temporarily set that scan’s `risk_index_version` to something else (e.g. `"1.9"`) so it is treated as a different version.
3. Run a **second** scan on the same deal (new scan).
4. **Expect:**
   - New scan’s `risk_index_breakdown` has `previous_score` (from the previous scan’s score), `delta_comparable: false`, and no `delta_score`/`delta_band`/`deterioration_flag`.
   - Export PDF for the new scan includes the line: **“Version drift — delta not comparable”**.
   - Portfolio (and deal detail) show “Version drift — delta not comparable” where delta/deterioration would otherwise be shown.
5. Restore the previous scan’s `risk_index_version` in the DB if needed for other tests.

This confirms that when the scan route reads a different `previous_risk_index_version` from the DB, it passes it into `computeRiskIndex`, which sets `delta_comparable: false` and omits delta fields; the UI and PDF then show the version-drift messaging.

---

## Results (automated)

The following tests were run locally (no browser, no live app/DB). **Manual in-app steps (sections 1–3) still need to be run by you** if you want results from the actual website.

**Command:** `npm test -- --run lib/bandConsistency.test.ts lib/assumptionNormalization.test.ts lib/export/exportPdf.test.ts lib/robustness.test.ts`

```
 RUN  v2.1.9

 ✓ lib/assumptionNormalization.test.ts (24 tests) 5ms
 ✓ lib/bandConsistency.test.ts (4 tests) 1ms
 ✓ lib/export/exportPdf.test.ts (9 tests) 28ms
 ✓ lib/robustness.test.ts (41 tests) 38ms

 Test Files  4 passed (4)
      Tests  78 passed (78)
   Duration  ~700ms
```

**What this confirms:**

- **Band mismatch:** `checkBandConsistency` and PDF band-mismatch behavior (mismatch line + Review Yes) pass.
- **Unit inference:** Vacancy 0.38 + LTV 0.92 (unit blank) → 38/92 and `unitInferred` true; normalization tests pass.
- **Version drift:** `computeRiskIndex` with different `previous_risk_index_version` yields `delta_comparable: false`; PDF version-drift line and `getVersionDriftLineForTest` pass.

**Not covered by this run:** Logging into the app, creating/running a scan in the UI, exporting a PDF from the UI, or changing DB rows and re-scanning. Those steps are in the procedures above; record their results here if you run them.
