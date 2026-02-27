# Portfolio Intelligence & Deal Lifecycle — Verification Checklist

Use this checklist to verify the implementation manually after applying migration `023_portfolio_intelligence.sql`.

---

## 1. Deal create → Portfolio

- [ ] Create a new deal: **Deals** → **New deal**; set name and market (e.g. `Dallas, Tx`); submit.
- [ ] Open **Portfolio**. The new deal appears in the table.
- [ ] Deal shows **"Unscanned"** badge, score/tier blank or "Not scanned yet".
- [ ] **"Unscanned deals: N"** line is visible with a "Run first scan" (or similar) CTA.

## 2. First scan → Portfolio update

- [ ] From the deal page, run the first scan (paste underwriting text if needed).
- [ ] After scan completes, open **Portfolio** again (refresh if needed).
- [ ] The deal now shows a **score** and **tier** (e.g. Moderate, Elevated).
- [ ] Unscanned count decreased by 1.
- [ ] **Distribution by Risk Tier** includes this deal in the correct band.
- [ ] **Complete** column shows an assumption completeness % (e.g. 75%) when applicable.

## 3. Market normalization

- [ ] Create or use two deals with markets: `Dallas, TX` and `dallas, texas` (or `Dallas, Tx`).
- [ ] On **Portfolio**, open **Exposure by Market**.
- [ ] There is a **single** row for **Dallas, TX** with a combined count (e.g. 2), not two separate rows.

## 4. Lifecycle badges

- [ ] **Unscanned**: Deal with no scan shows "unscanned" badge.
- [ ] **Stale**: For a deal last scanned > 30 days ago (or mock `latest_scanned_at`), it shows "stale" badge.
- [ ] **Needs Review**: After running a second scan that increases score by ≥ 8 (or worsens band), the deal shows "needs review" badge.
- [ ] **To Review** section lists deals that are stale or need review (when any exist).

## 5. Explainability

- [ ] Click or expand a **scanned** deal row in the Portfolio deals table.
- [ ] Expanded row shows **Top risk contributors** (risk type + penalty, e.g. `ExitCapCompression (+4)`).
- [ ] **Stabilizers** line shows applied stabilizers (e.g. "Low LTV (≤60)", "Exit cap ≥ cap rate in") when applicable.
- [ ] If assumptions are missing, **Missing assumptions** lists the missing keys.

## 6. Alerts card

- [ ] **Alerts** section (when data exists) shows:
  - Tier changes (e.g. "Deal X: Moderate → Elevated").
  - Largest score increases (e.g. "+10 (42 → 52)").
  - Stale scans (e.g. "Deal Y: Last scanned > 30 days ago").
  - Missing critical inputs (expense_growth or debt_rate) when applicable.
  - Unscanned count line (e.g. "N deal(s) not scanned yet").

## 7. Filters, sort, search

- [ ] **Search**: Type a deal name; table filters to matching deals.
- [ ] **Status**: Change to "Scanned" / "Unscanned" / "Stale" / "Needs Review"; list updates.
- [ ] **Sort**: Change to "Score (high first)", "Last scanned", "Name A–Z", "Market A–Z", "Largest increase"; order updates.

## 8. Save View

- [ ] Apply some filters and/or sort (e.g. Status = Scanned, Sort = Score high first).
- [ ] Click **Save view**; enter a name (e.g. "High risk only"); submit.
- [ ] Reload the page (or navigate away and back to Portfolio).
- [ ] In **Load view...**, select the saved view; filters and sort restore.

## 9. Portfolio Intelligence

- [ ] **Risk Profile**: Shows Scanned/Total, and when scanned > 0: % Elevated+, weighted avg (if applicable).
- [ ] **Concentration**: If any market has > 40% of scanned deals, a concentration warning appears.
- [ ] **Recurring Risks**: Table shows risk_type, deal count, weighted score (top rows).
- [ ] **Risk Composition**: Structural % and Market % are shown.
- [ ] **Macro Exposure**: Categories and deal counts when macro links exist.
- [ ] **Change Watch**: Top 5 score increases (deteriorations) and band transitions when ≥2 scans exist.

## 10. Versioning

- [ ] On a **deal detail** page, open the latest scan section.
- [ ] Scan metadata shows **risk_index_version** (e.g. "v1.2") when the scan was created after the change.
- [ ] **PDF export**: Export PDF for a scanned deal; footer or audit line includes **Scoring: v1.2** (or similar).

## 11. PDF

- [ ] Export PDF for a deal that has macro signals.
- [ ] **Macro section**: No duplicate sentences (same text appears once).
- [ ] **Risk Index Breakdown** section is present (e.g. "Structural 45% | Market 55% | Confidence 0.7 | Stabilizers -8 | Penalties +18 | Scoring v1.2").
- [ ] **IC Memo Highlights** (if present): No repeated identical lines.

## 12. Macro penalty (category-based)

- [ ] For a deal with **two or more** macro links that share the same **signal_type** (e.g. "Credit"), run a new scan.
- [ ] Macro penalty in the score should count **one category** (not one per signal). Score should reflect the capped category count (e.g. +1 per unique category, cap 3).

## 13. Input validation / completeness

- [ ] Deal with missing key assumptions shows **completeness %** &lt; 100 and missing keys in explainability.
- [ ] (Optional) If you have a path that validates numeric ranges on write, out-of-range values (e.g. vacancy 101) are rejected or clamped with a clear error.

## 14. No address autocomplete

- [ ] On **New deal** (or deal edit), the **Market** field is a plain text input with no Google Places or address autocomplete dropdown.

---

## Modified and new files (reference)

**New**

- `supabase/migrations/023_portfolio_intelligence.sql`
- `lib/assumptionValidation.ts`
- `lib/assumptionValidation.test.ts`
- `docs/PORTFOLIO_VERIFICATION_CHECKLIST.md` (this file)

**Modified**

- `app/api/deals/route.ts` — persist city, state, market_key, market_label on create
- `app/api/deals/scan/route.ts` — update deals.latest_*, risk_index_version, macro_linked_count (category-based), scan_count
- `lib/macroSignalCount.ts` — add countUniqueMacroCategories
- `lib/riskIndex.ts` — add RISK_INDEX_VERSION, computeRiskPenaltyContribution, describeStabilizers, export SEVERITY_POINTS, CONFIDENCE_FACTOR, STRUCTURAL_RISK_TYPES
- `lib/portfolioSummary.ts` — add assumption completeness to dealExplainability
- `app/app/portfolio/page.tsx` — uses getPortfolioSummary, passes summary + savedViews to PortfolioClient
- `app/app/portfolio/PortfolioClient.tsx` — assumption completeness column, missing keys in expanded row, duplicate useRouter import removed
- `lib/export/exportPdf.ts` — Risk Index breakdown line, IC narrative dedup, risk_index_version in footer
- `app/api/deals/export-pdf/route.ts` — pass riskBreakdown, risk_index_version
- `lib/normalizeMarket.test.ts` — Dallas Texas, Dallas ,TX cases
- `lib/macroSignalCount.test.ts` — countUniqueMacroCategories tests

**No new environment variables.** Optional: ensure DB indexes from migration 023 are applied for portfolio query performance.
