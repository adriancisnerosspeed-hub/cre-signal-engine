# Claude Session Log — QA Verification & Hardening

**Date:** 2026-03-23
**Model:** Claude Opus 4.6
**Scope:** Phases 1–6 QA verification, bug fixes, hardening, and user-reported issue resolution

---

## What This Session Covered

This session verified the complete 6-phase rollout implementation, fixed bugs found during audit, applied hardening improvements, and resolved four issues the user reported from live testing.

---

## Phase 1–6 Implementation Verification (Step 1)

All automated checks passed:

- **Build:** `npx next build` — clean, zero type errors
- **Tests:** 295 passed, 5 pre-existing failures (module resolution in vitest for `workspace.test.ts`, `PricingClient.test.tsx`, `invite/accept/route.test.ts`)
- **Migrations:** 051–058 all present, sequentially numbered, no gaps
- **Key exports verified:** `canUseAiInsights`, `isOwner`, `requireOwner`, `isFeatureEnabled`, `checkOrgScanRateLimit`, public routes for `/api/leads/demo-snapshot` and `/changelog`
- **Scan determinism params:** `temperature: 0`, `top_p: 1`, `seed: 42` confirmed in scan route
- **OnboardingFlow:** Uses `router.push` (not Link onClick) — confirmed
- **Changelog RLS:** Migration 058 drops old policy, creates published-only policy (`published_at IS NOT NULL AND published_at <= now()`)

---

## Bug Fix (Step 2)

### PRO `canInviteMembers` Test Mismatch

- **File:** `lib/entitlements/workspace.test.ts`
- **Problem:** Test asserted `canInviteMembers: false` for PRO plan, but the implementation (`workspace.ts` line 62) says `true`, and the onboarding doc confirms PRO should allow invites.
- **Fix:** Changed test assertion from `false` to `true` and updated test description.

---

## Hardening (Steps 3–5)

### OnboardingFlow Error Recovery (Step 3)

- **File:** `app/app/components/OnboardingFlow.tsx`
- **Problem:** If the PATCH to `/api/org/onboarding` failed, `completing` was set to `true` and never reset, permanently disabling all buttons.
- **Fix:** Wrapped fetch calls in try/catch with `finally { setCompleting(false) }` in `markComplete()`. In `handleFinishAndNavigate()`, added catch that resets `completing` and returns early.

### `escapeHtml` Single Quote (Step 4)

- **File:** `lib/email/sendDemoSnapshotEmail.ts`
- **Problem:** HTML escaping covered `&`, `<`, `>`, `"` but not `'`. Not currently exploitable (template uses double quotes), but defense-in-depth.
- **Fix:** Added `.replace(/'/g, "&#39;")`.

### Memo Share Cookie Secret Warning (Step 5)

- **File:** `lib/memoShareAuth.ts`
- **Problem:** Falls back to `SUPABASE_SERVICE_ROLE_KEY` silently when `MEMO_SHARE_COOKIE_SECRET` is not set.
- **Fix:** Added `console.warn` at module load when the dedicated secret is missing.

---

## User-Reported Issues (Steps 6–9)

### Dev Tools Tier Naming (Step 6)

- **File:** `app/owner/dev/TierSetterPanel.tsx`
- **Problem:** Dev tools showed raw internal plan slugs (`FREE`, `PRO`, `PRO+`, `ENTERPRISE`) instead of customer-facing names. User was confused by the mismatch.
- **Fix:** Added `PLAN_DISPLAY_NAMES` mapping. Selector now shows `Free (FREE)`, `Starter (PRO)`, `Analyst (PRO+)`, `Fund / Enterprise (ENTERPRISE)`. Toast messages also show customer-facing names. Workspace dropdown shows the same format.

### Tier Override Auto-Refresh (Step 7)

- **Files:** `app/api/owner/tier-override/route.ts`, `app/owner/dev/TierSetterPanel.tsx`
- **Problem:** After changing the org tier, the user had to manually refresh the browser before the next scan would work. Without refresh, scans hit a 500 (ECONNRESET/terminated) because Next.js server components served stale entitlement data.
- **Fix (server):** Added `revalidatePath("/app", "layout")` after the successful plan update in the tier-override API route.
- **Fix (client):** Added `router.refresh()` after the successful API call in TierSetterPanel.

### Score Variation Investigation (Step 8)

- **Problem:** User saw risk score jump from 44 to 47 after a tier change + ECONNRESET error.
- **Investigation:** Confirmed `computeRiskIndex()` does NOT take plan/tier as input. Its parameters are: `risks`, `assumptions`, `macroLinkedCount`, `macroDecayedWeight`, `previous_score`, `previous_risk_index_version`.
- **Verdict:** The 44→47 variation was caused by the OpenAI extraction producing slightly different risks after the ECONNRESET error (different risk list → different deterministic score). The scoring math itself is fully deterministic. No code change needed.

### AI Insights Panel on Deal Detail Page (Step 9)

- **File:** `app/app/deals/[id]/page.tsx`
- **Problem:** AI Insights panel only appeared on the scan detail page (`/app/deals/[id]/scans/[scanId]`), not on the main deal overview page. User couldn't find it.
- **Fix:** Added `AiInsightsPanel` import, `isFeatureEnabled` check (fetched in parallel with entitlements), and rendered the panel in the overview tab after the explainability diff section. Same dual gating: `workspaceEntitlements.canUseAiInsights && aiInsightsFlag`. Kept existing rendering on scan detail page too.

---

## Verification After All Fixes (Step 10)

- **Build:** `npx next build` — clean, no regressions
- **Tests:** 295 passed, same 5 pre-existing failures (no new failures introduced)

---

## Files Modified

| File | Change |
|------|--------|
| `lib/entitlements/workspace.test.ts` | Fix PRO `canInviteMembers` assertion (false → true) |
| `app/app/components/OnboardingFlow.tsx` | Add error recovery to `completing` state |
| `lib/email/sendDemoSnapshotEmail.ts` | Add single-quote escaping to `escapeHtml` |
| `lib/memoShareAuth.ts` | Add `console.warn` for missing cookie secret |
| `app/owner/dev/TierSetterPanel.tsx` | Customer-facing tier names + `router.refresh()` after change |
| `app/api/owner/tier-override/route.ts` | Add `revalidatePath("/app", "layout")` after plan update |
| `app/app/deals/[id]/page.tsx` | Add AI Insights panel to deal overview tab |
| `onboarding/CRESIGNALENGINE.md` | Updated AI Insights UI location, tier setter UX, onboarding error recovery docs |
| `onboarding/Obstacles.md` | Added entries 4g (tier override refresh), 4h (internal slug display), 4i (AI Insights visibility), 5a-pre (test lag) |
| `onboarding/Assist.md` | Added tier name mapping note for future chats |

---

## Commit

```
5db87d2 QA hardening: fix PRO invite test, add AI Insights to deal page, improve tier override UX
```

Pushed to `origin/main`.

---

## Session 2: Dev Tools Enhancements & AI Insights Debugging

**Date:** 2026-03-23
**Model:** Claude Opus 4.6
**Scope:** Clickable org/profile detail dialogs in Usage & Leads panel; AI Insights visibility debugging

---

### Clickable Org/Profile Detail Dialogs (Usage & Leads Panel)

- **Files:** `app/owner/dev/page.tsx`, `app/owner/dev/OwnerDevDashboard.tsx`, `app/owner/dev/UsageLeadsPanel.tsx`
- **What:** Organizations and Profiles stat boxes in the Usage & Leads dev tools tab are now clickable. Clicking opens a dialog showing all records linked to the SaaS.
  - **Organizations dialog:** name, plan badge, billing status, member count, creator email, creation date, onboarding status. Orgs without completed onboarding show a "No onboarding" tag.
  - **Profiles dialog:** email, role badge, org count, scans used, creation date. Profiles with no auth email show "No account / Anonymous" in yellow. Profiles with 0 org memberships show "0 (unlinked)".
- **Data:** Server page now fetches all orgs, all profiles, org members, and auth user emails via `service.auth.admin.listUsers()`.
- **Scope:** Changes are self-contained to `app/owner/dev/` — no impact on main app, API routes, or database.

### AI Insights Not Appearing After Tier Override

- **Root cause:** AI Insights requires TWO independent conditions: (1) plan must be PRO+ or ENTERPRISE (`canUseAiInsights` entitlement), AND (2) the `ai-insights` feature flag must be enabled in the `feature_flags` table via the Feature Flags tab.
- **Additional bug:** The tier override route (`/api/owner/tier-override`) did not call `clearFeatureFlagCache()` after updating the plan, meaning cached feature flag values could persist up to 60 seconds after a tier change.
- **Fix (route):** Added `clearFeatureFlagCache()` import and call in `app/api/owner/tier-override/route.ts`.
- **Fix (UX):** Added a yellow reminder banner in `TierSetterPanel.tsx` that appears when PRO+ or ENTERPRISE is selected, explaining the dual-gate requirement.
- **User action needed:** Go to Feature Flags tab → ensure a flag named `ai-insights` exists and is toggled ON. Then set the tier to PRO+ or ENTERPRISE. The AI Insights panel should appear on both the deal overview page and scan detail page.

### Dev Tools Tab Consolidation

- **Problem:** "Feature flags" and "Tier override" were separate tabs, which was confusing. The tier override plan dropdown always reset to FREE on refresh because it was hardcoded to default to `"FREE"` instead of reading the org's current plan. Two separate workspace/plan selectors felt redundant.
- **Fix:** Merged both tabs into a single **"Plan & flags"** tab via new `PlanAndFlagsPanel.tsx`. Plan selector now defaults to the selected org's current plan. Single-org workspaces show the org info inline (no dropdown needed). Feature flags shown as simple on/off toggle rows instead of full CRUD table.
- The old `FeatureFlagsPanel.tsx` and `TierSetterPanel.tsx` files are no longer imported but remain in the repo.

### Invite Email Not Delivering

- **Root cause:** Invite emails use an async outbox pattern — clicking "Send invite" queues the email in `email_outbox`, and a cron job (`/api/cron/email/process`) runs every 2 minutes on Vercel to actually send it. If the cron isn't running (Hobby plan = once/day, or `CRON_SECRET` not set), emails never get delivered.
- **Fix (dev tools):** Added `POST /api/owner/process-outbox` route and a "Process email queue" button in the Test Tools tab. This manually triggers the outbox processor so invite emails deliver immediately without waiting for the cron.
- **Fix (UX):** Changed the success message from "Invite sent to {email}" to "Invite queued for {email} — email will be delivered shortly." to set correct expectations.
- **Env vars required:** `RESEND_API_KEY` must be set. `CRON_SECRET` must be set for the automated cron. `RESEND_FROM` defaults to Resend sandbox if not set.

### Files Modified

| File | Change |
|------|--------|
| `app/owner/dev/page.tsx` | Fetch all orgs, profiles, org members, and auth user emails |
| `app/owner/dev/OwnerDevDashboard.tsx` | Merged Feature flags + Tier override into single "Plan & flags" tab |
| `app/owner/dev/PlanAndFlagsPanel.tsx` | New combined panel: tier override + feature flag toggles |
| `app/owner/dev/UsageLeadsPanel.tsx` | Clickable stat boxes with detail dialogs |
| `app/api/owner/tier-override/route.ts` | Add `clearFeatureFlagCache()` after plan update |
| `app/api/owner/process-outbox/route.ts` | New route: manually trigger email outbox processing |
| `app/owner/dev/TestToolsPanel.tsx` | Add "Process email queue" button |
| `app/settings/workspace/WorkspaceClient.tsx` | Change "Invite sent" to "Invite queued" message |
| `onboarding/Claude.md` | This session log |
| `onboarding/CRESIGNALENGINE.md` | Updated owner dev dashboard docs |
| `onboarding/Obstacles.md` | Added 4j, 4k, 4l entries |

---

## Known Accepted Risks (Unchanged)

1. **Demo snapshot rate limit is in-memory** — per-instance only on Vercel serverless. Migrate to Redis/KV for strict global enforcement if needed.
2. **Feature flag cache TTL is 60s** — flag toggles may take up to 60s to propagate. Acceptable for current scale.
3. **Scan rate limit is per-org** — separate limits per org for multi-org users. Intended behavior.

---

## Manual QA Checklist (For User)

These require a running app + browser. Documented in the plan file at `.claude/plans/zany-dreaming-flute.md`, Step 7 (manual QA). Nine tests covering: guest lead flow, owner flag toggle, tier override enforcement, cross-user feature flag, changelog security, password-protected share, theme toggle, onboarding flow, and SEO (sitemap/robots).

---

## Session 3: Toast UX + Score Debug Panel

**Date:** 2026-03-24
**Model:** Claude Opus 4.6
**Scope:** Replace window.alert() toasts with Sonner, add owner-only Score Debug panel to deal detail page

---

### Toast System Upgrade

- **Files:** `lib/toast.ts`, `app/layout.tsx`
- **Problem:** All toast notifications (12 call sites) used `window.alert()` — blocking browser dialog that felt outdated and error-like. Most visible on rescan: "Score unchanged — deal text has not changed since last scan."
- **Fix:** Replaced `window.alert()` with Sonner (already installed as dependency, `Toaster` component existed in `components/ui/sonner.tsx` but was never mounted). Now maps `toast("msg", "success"|"error"|"info")` to `sonnerToast.success()` / `.error()` / `.info()`. Mounted `<Toaster position="bottom-right" richColors closeButton />` in root layout.

### Score Debug Panel (Owner-Only)

- **Files:** `app/api/deals/[id]/score-debug/route.ts`, `app/app/deals/[id]/ScoreDebugPanel.tsx`, `app/app/deals/[id]/page.tsx`
- **Problem:** User (owner) wanted to understand exactly why deterministic scores fluctuate between rescans. Previous investigation (Session 1, Step 8) showed score drift comes from OpenAI extraction non-determinism (different risk lists → different scores), not from the scoring math itself. But there was no tool to inspect this.
- **Solution:** Built a fully deterministic (no AI/API needed) Score Debug panel:
  - **API route** (`GET /api/deals/[id]/score-debug`): Owner-gated. Returns all completed scans with full breakdowns, risks, assumptions, audit log entries, input/scoring hashes.
  - **Client component** (`ScoreDebugPanel`): Collapsible panel on deal detail page (visible only to owner). Select any two scan versions from dropdowns. Shows:
    - Score delta with significance flag (≥8 pts)
    - Diagnostic flags: same input hash, same scoring hash, version mismatch, potential bugs (same scoring hash but different score = non-determinism detected)
    - Natural-language explanation summary: which risks were added/removed/changed severity, which assumptions changed, stabilizer changes, tier override changes, largest driver shift
    - Score contribution diff table (per-driver point changes)
    - Risk diff (NEW/GONE/SEV/CONF tags with point impact)
    - Assumption diff
    - Scoring mechanics comparison (penalties, stabilizers, structural/market weights, tier overrides)
    - Full metadata (dates, models, versions, hashes truncated)
  - Single-scan inspector mode when only one scan selected
  - Gated: `isOwner(user.email)` check in both API route and page rendering

### Key Finding for Owner

The debug panel will make it clear that score changes between rescans of identical deal text are caused by OpenAI returning slightly different risk extractions (different risk_type list or severity assignments), not by bugs in the scoring engine. When `input_text_hash` matches but `scoring_input_hash` differs, the AI extracted differently. When both hashes match, the score must be identical — if not, the panel flags it as a bug.

### Files Modified

| File | Change |
|------|--------|
| `lib/toast.ts` | Replace `window.alert()` with Sonner `toast.success()` / `.error()` / `.info()` |
| `app/layout.tsx` | Mount `<Toaster>` from `components/ui/sonner.tsx` |
| `app/api/deals/[id]/score-debug/route.ts` | New: owner-only API returning all scan versions with full debug data |
| `app/app/deals/[id]/ScoreDebugPanel.tsx` | New: client component for comparing scan versions deterministically |
| `app/app/deals/[id]/page.tsx` | Import ScoreDebugPanel, gate behind `isOwner()`, render above overview tab |
| `onboarding/Claude.md` | This session log |

---

## Session 4: Deterministic Risk Injection Layer + Owner Force Rescan

**Date:** 2026-03-24
**Model:** Claude Opus 4.6
**Scope:** Create deterministic risk injection layer, owner-only force rescan with full cache bypass

---

### Deterministic Risk Injection Layer

- **Problem:** AI extraction (gpt-5.4-mini) non-deterministically omits risks that numeric assumptions mathematically warrant. Two scans of identical text produced scores of 52 and 56 because risks like DebtCostRisk appeared in one run but not another. Severity overrides fix severity after a risk exists but can't fix missing risks.
- **Solution:** New `lib/riskInjection.ts` — pure deterministic function that inspects normalized assumptions and deal text, injects any missing risks the numbers warrant. 7 rules:
  1. **DebtCostRisk** — debt_rate >= 6.0% (High if >= 7.0%, else Medium)
  2. **RefiRisk** — debt_rate >= 6.5% AND hold >= 5yr (Medium)
  3. **VacancyUnderstated** — vacancy >= 5% AND construction keywords in text (Low)
  4. **ExitCapCompression** — exit_cap - cap_rate_in <= 0.5 (Low if positive spread, Medium if negative)
  5. **ConstructionTimingRisk** — construction keywords in text (Medium)
  6. **RentGrowthAggressive** — rent_growth >= 3.0% (Low if < 4.0%, Medium if >= 4.0%)
  7. **ExpenseUnderstated** — expense_growth stated but < 3.0% (Low)
- **Key properties:** Does NOT replace AI-extracted risks. All injected risks get confidence "High" (math-derived). Injected risk_types tracked in `injectedTypes` Set and stored in breakdown as `injected_risk_types` for Score Debug panel.
- **Pipeline position:** After percent normalization, before severity overrides. Pipeline: AI extract → parse/normalize → dedup → percent normalize → **inject** → severity overrides → scoring-input hash → score.
- **Tests:** 30 tests in `lib/riskInjection.test.ts` including 20-run determinism check and full integration with reference building assumptions.

### Owner-Only Force Rescan

- **Problem:** Existing `force=1` only bypasses Layer 1 TTL cache. Layer 2 (text-hash) and Layer 3 (scoring-input-hash) still return cached scores, making it impossible to test injection effects on existing deals.
- **Solution:** `ownerForce = forceRescan && isOwner(user.email)` bypasses all 3 cache layers. Non-owner `force=1` preserves current behavior (only Layer 1 bypass).
- **UI:** "Rescan (force)" button on deal detail page (owner-only, subtle styling). Force Rescan tool in TestToolsPanel with deal ID input.

### Score Debug Panel Updates

- Added `injected_risk_types?: string[]` to Breakdown type
- "Injected Risks" section in single-scan view (cyan styling)
- "(injected)" badge on risk rows in comparison view

### ScanDevTools Panel (Scan Detail Page)

- **File:** `app/app/deals/[id]/scans/[scanId]/ScanDevTools.tsx` (new), `app/app/deals/[id]/scans/[scanId]/page.tsx` (modified)
- **Problem:** Owner had no way to inspect scoring identity, breakdown, contributions, or raw extraction on individual scan snapshots. The Score Debug panel on the deal overview page compares across scans but doesn't show per-scan detail.
- **Solution:** Collapsible owner-only panel on the scan detail page showing:
  - Force Rescan button
  - Scoring identity: score, band, version, model, prompt version, input text hash, scoring input hash, scan ID
  - Score breakdown: base (40) + penalties + stabilizers → final, with color-coded metric cards
  - Band floor overrides, injected risks (cyan), edge flags, validation errors
  - Per-driver score contributions sorted by magnitude, with contribution % and confidence multipliers
  - Risk table with severity, confidence, calculated point values, "injected" and severity-override badges
  - Collapsible raw extraction JSON viewer
- **Gating:** `isOwner(user.email)` in the server page; `ScanDevTools` only rendered when `ownerMode` is true
- **Data:** Extended scan query to include `risk_index_version`, `input_text_hash`, `scoring_input_hash`, and full `risk_index_breakdown` fields

### Inline Force Rescan Button (Deal Detail Page)

- **Problem:** The ForceRescanButton component was placed in the owner debug section near ScoreDebugPanel, but the user couldn't find it there. They wanted a dedicated button right next to the main "Rescan (Fresh)" button since the normal rescan was returning "Score unchanged" due to Layer 2 cache.
- **Solution:** Added `isOwner` prop to `DealDetailClient`. When `isOwner && hasScan`, an inline "Force Rescan" button renders right next to the main scan button with subtle styling (transparent background, gray border, smaller font). Separate `handleForceRescan` handler calls `POST /api/deals/scan` with `{ deal_id, force: 1 }` and shows toast with result.

### Files Modified

| File | Change |
|------|--------|
| `lib/riskInjection.ts` | New: deterministic risk injection module (7 rules) |
| `lib/riskInjection.test.ts` | New: 30 tests |
| `app/api/deals/scan/route.ts` | Injection integration + owner force rescan (all-cache bypass) |
| `app/app/deals/[id]/ScoreDebugPanel.tsx` | `injected_risk_types` in Breakdown type + UI badges |
| `app/app/deals/[id]/ForceRescanButton.tsx` | New: standalone owner-only force rescan button component (used in ScanDevTools) |
| `app/app/deals/[id]/DealDetailClient.tsx` | `isOwner` prop + inline Force Rescan button next to main scan button |
| `app/app/deals/[id]/page.tsx` | Pass `isOwner={ownerMode}` to DealDetailClient, import ForceRescanButton |
| `app/app/deals/[id]/scans/[scanId]/ScanDevTools.tsx` | New: comprehensive owner-only scan debug panel |
| `app/app/deals/[id]/scans/[scanId]/page.tsx` | Extended scan query, render ScanDevTools when owner |
| `app/owner/dev/TestToolsPanel.tsx` | Force rescan tool with deal ID input |
| `onboarding/CRESIGNALENGINE.md` | Updated section 8 with injection step + score stability notes |
| `onboarding/Claude.md` | This session log |

---

## Session 5: Severity Override Expansion — Close the Last Variance Gap

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** Expand deterministic severity overrides to cover all risk types with numeric proxies, add DataMissing removal logic

---

### Problem

The injection layer (Session 4) guarantees all math-warranted risks exist, but severity still varies because the AI assigns non-deterministic severity. When dedup picks the AI's severity over the injection's severity (highest wins), score swings +/- 1-2 points per flip. Additionally, several overrides used incorrect proxies (e.g., DebtCostRisk used LTV instead of debt_rate).

### Changes

**Severity override threshold rewrites (`lib/riskSeverityOverrides.ts`):**

| Risk Type | Old Proxy | New Proxy | New Thresholds |
|-----------|-----------|-----------|----------------|
| DebtCostRisk | LTV >= 75/65 | debt_rate >= 7.5/6.5/6.0 | H/M/L |
| RefiRisk | LTV >= 75/65 (shared with DebtCostRisk) | debt_rate + hold_period_years | H: dr>=7.5 AND hold>=7, M: dr>=7.0 OR hold>=7, else L |
| ExitCapCompression | capRateIn - exitCap > 0.5/0.25 | exitCap - capRateIn <= 0/0.25/0.5 | H/M/L |
| RentGrowthAggressive | >= 4/3 | >= 5.0/4.0/3.0 | H/M/L |
| ExpenseUnderstated | >= 5/3 (higher=worse) | < 2.0/3.0 (lower=worse) | M/L, >=3.0 forced L |
| VacancyUnderstated | >= 20/10 | >= 10/7/5 | H/M/L |
| ConstructionTimingRisk | No override (aiSeverity) | Unconditional | Always Medium |

**DataMissing removal (`shouldRemoveDataMissing`):**
- New exported function checks if all 8 core assumptions (purchase_price, noi_year1, cap_rate_in, exit_cap, vacancy, ltv, debt_rate, rent_growth) have non-null numeric value AND High confidence
- When true, DataMissing is filtered out of the risk list before scoring
- Applied in main scan route and demo scan

**RiskSandboxPanel updates:**
- Added debt_rate slider (default 6.5, range 3-10, step 0.05)
- Added DebtCostRisk to BASE_RISKS
- debt_rate passed in assumptions for correct override preview

### Reference building expected outputs

With debt_rate 6.85%, hold 5yr, exit_cap 6.1%, cap_rate_in 5.6%, rent_growth 3.5%, expense_growth 2.8%, vacancy 7%, all High confidence:
- DebtCostRisk → Medium, RefiRisk → Low, ExitCapCompression → Low
- RentGrowthAggressive → Low, ExpenseUnderstated → Low, VacancyUnderstated → Medium
- ConstructionTimingRisk → Medium, InsuranceRisk → Medium
- DataMissing → REMOVED

### Tests

18 tests in `lib/riskSeverityOverrides.test.ts`:
- All existing tests rewritten for new thresholds
- New: ConstructionTimingRisk always Medium
- New: `shouldRemoveDataMissing` (5 tests: all High → true, mixed confidence → false, missing key → false, undefined → false, null value → false)
- New: Reference building determinism test (20 iterations × 8 risk types, cycling AI severity through Low/Medium/High)

### Files Modified

| File | Change |
|------|--------|
| `lib/riskSeverityOverrides.ts` | All threshold changes + `shouldRemoveDataMissing` export |
| `lib/riskSeverityOverrides.test.ts` | Full rewrite: 18 tests (was 10) |
| `app/api/deals/scan/route.ts` | DataMissing filter after severity overrides |
| `lib/demo/runDemoScan.ts` | DataMissing filter |
| `app/owner/dev/RiskSandboxPanel.tsx` | debt_rate slider + DebtCostRisk in BASE_RISKS |
| `onboarding/CRESIGNALENGINE.md` | Updated severity override docs + five layers of determinism |
| `onboarding/Claude.md` | This session log |

---

## Session 6: Risk Index v3.0 — Full Deterministic Scoring Overhaul

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** Lock v3 scoring engine, tighter bands, new penalties, three-layer score stability, update all tests

---

### Overview

Comprehensive overhaul to eliminate score variance between rescans. Same deal text scanned 5x produced 41→47→44→47→41 under v2. This session locked the v3 scoring engine with three layers of determinism protection and updated all test infrastructure.

### Scoring Engine Changes (`lib/riskIndex.ts`)

- **Version:** `RISK_INDEX_VERSION = "3.0 (Institutional Stable v3)"`, locked at `2026-03-23`
- **v3 band thresholds:** Low 0-32, Moderate 33-53, Elevated 54-68, High 69+ (tighter by ~2 pts each)
- **Stronger LTV+vacancy ramp:** penalties 10/7/3+round(dist*3) (was 8/5/2+round(dist*2))
- **Driver share cap:** lowered to 35% (was 40%)
- **New completeness penalty:** 0-4 pts based on assumption completeness (`computeAssumptionCompleteness`)
- **New missing-debt-rate penalty:** 2 pts when debt_rate null + LTV > 65%

### Risk Normalization Changes (`lib/dealScanContract.ts`)

- **Dedup by risk_type only** (was trigger-text-based). Highest severity wins, triggers merged.
- **Supply pressure grouping:** RentGrowthAggressive demoted one level when VacancyUnderstated present with supply keywords, preventing double-counting.

### Overlay Fix (`lib/crossReferenceOverlay.ts`)

- Removed `bumpedSeverity()` function and severity bump loop — macro penalty now only captured via `macroLinkedCount`/`macroDecayedWeight` in `computeRiskIndex()`.

### Severity Override Additions (`lib/riskSeverityOverrides.ts`)

- 4 new cases: ExpenseUnderstated (expense_growth thresholds), MarketLiquidityRisk (LTV thresholds), InsuranceRisk (always Medium), DataMissing (completeness pct thresholds)

### Scan Pipeline Changes (`app/api/deals/scan/route.ts`)

- **Post-normalization scoring-input hash:** canonical sorted risk/assumption JSON → SHA-256 hash → stored as `scoring_input_hash`
- **Scoring-input cache:** if recent completed scan has same scoring-input hash, reuse exact score/band/breakdown
- **Owner force rescan:** bypasses all 3 cache layers

### Other Fixes

- **Onboarding buttons** (`OnboardingFlow.tsx`): removed early return in catch block so navigation proceeds even if PATCH fails
- **AI Insights fallback** (`scans/[scanId]/page.tsx`): shows fallback message for entitled users when feature flag disabled
- **Migrations:** 059 (scoring_input_hash column + index), 060 (enable ai-insights flag)

### Tests Updated (20 files, 721 insertions, 209 deletions)

- `lib/riskIndex.test.ts` — rewrote with v3 band tests, completeness/debt-rate penalty tests
- `lib/dealScanContract.test.ts` — updated for risk_type-based dedup + supply pressure grouping
- `lib/bandConsistency.test.ts` — v3 thresholds
- `lib/riskSeverityOverrides.test.ts` — added ExpenseUnderstated, MarketLiquidityRisk, InsuranceRisk, DataMissing, ConstructionTimingRisk
- `lib/robustness.test.ts` — v3 tier calibration, extreme case ≥69 → High
- `lib/__snapshots__/modelGovernance.test.ts.snap` — v3 version + driver_share_cap: 35
- `lib/deterministicInvariant.test.ts` — new: 8 invariant tests
- `scripts/stressRiskIndexV2.ts` — 10 scenarios + 7 assertions

### Commit

```
96ba70c Risk Index v3.0: deterministic scoring overhaul with three-layer stability
```

Pushed to `origin/main`.

---

## Session 7: Severity Override v3.1 — Revised Thresholds + Risk Removal

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** Rewrite all severity override thresholds, add risk removal functions, bump to v3.1

---

### Problem

Severity overrides used incorrect or overly simple proxies (e.g., DebtCostRisk keyed only on debt_rate, RefiRisk keyed on debt_rate + hold without LTV). Thresholds didn't match institutional CRE expectations. No mechanism to remove risks that assumptions prove are non-issues (e.g., conservative exit cap, reasonable expense growth).

### Threshold Rewrites (`lib/riskSeverityOverrides.ts`)

| Risk Type | v3 Proxy | v3.1 Proxy | v3.1 Thresholds |
|-----------|----------|------------|-----------------|
| DebtCostRisk | debt_rate only | **LTV-primary** + debt_rate secondary | ≥80→H, ≥75 OR (≥65 AND rate>6.5)→M, ≥60 AND rate≥6.0→L |
| RefiRisk | debt_rate + hold | **LTV + hold + debt_rate** with debt_rate-only fallback | ≥75 AND hold≤3→H, ≥70 AND hold≤5 AND rate≥6.5→M, LTV<70 fallback: rate≥6.5 AND hold≤5→M |
| VacancyUnderstated | vacancy only | vacancy + **construction context** | ≥15→H, ≥10→M, ≥5 with construction keywords→M (bump up), ≥5→L |
| RentGrowthAggressive | ≥5/4/3 | ≥**8/5/3** (shifted up) | H/M/L |
| ExitCapCompression | spread ≤0/0.25/0.5 | spread ≤**-0.5/0/0.5** + **removal** | H/M/L, >0.5→remove |
| ExpenseUnderstated | <2/3/≥3→L | <2→M, 2-3→L, **≥3→remove**, missing+NOI→M | + missing-data path |
| DataMissing | completeness pct | **count-based** (6 critical keys) + removal | 3+ missing→H, 1-2→M, 0→remove |

### New Functions

- `shouldRemoveExitCapCompression(assumptions)` — true when exit_cap > cap_rate_in by > 0.5%
- `shouldRemoveExpenseUnderstated(assumptions)` — true when expense_growth ≥ 3.0%
- `applySeverityOverride` now accepts optional 4th parameter `context?: { hasConstructionKeywords?: boolean }`

### Scoring Engine Changes (`lib/riskIndex.ts`)

- DataMissing cap raised from 3 → 9 points (`Math.min(sevPoints * conf, 9)`)
- Version bumped to `3.1 (Institutional Stable v3.1)`, locked at `2026-03-25`

### Consumer Updates

- `app/api/deals/scan/route.ts` — imports new removal functions + construction keyword context
- `lib/demo/runDemoScan.ts` — same pattern
- `app/owner/dev/RiskSandboxPanel.tsx` — passes `{ hasConstructionKeywords: false }` context
- `lib/riskInjection.ts` — exported `hasConstructionKeyword` for consumer use

### Reference Building Expected Outputs (v3.1)

68% LTV, 5yr hold, 6.85% rate, 7% vacancy+renovation, 3.5% rent_growth, 6.1% exit / 5.6% entry, 2.8% expense_growth:
- DebtCostRisk → Medium, RefiRisk → Medium, VacancyUnderstated → Medium (construction bump)
- RentGrowthAggressive → Low, ExitCapCompression → Low, ExpenseUnderstated → Low
- ConstructionTimingRisk → Medium, InsuranceRisk → Medium
- DataMissing → REMOVED

### Tests

33 tests in `lib/riskSeverityOverrides.test.ts` (was 18):
- All threshold tests rewritten for v3.1
- New: `shouldRemoveExitCapCompression` (4 tests), `shouldRemoveExpenseUnderstated` (4 tests)
- New: VacancyUnderstated construction-keyword bump tests
- New: RefiRisk debt_rate-only fallback tests, ExpenseUnderstated missing-data path tests
- Updated reference building determinism test

### Commit

```
b3c3415 Revise severity override thresholds to v3.1
```

---

## Session 8: Fix Severity Overrides — No AI Fallback When Assumptions Present

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** Eliminate AI severity fallback for all overrides when required assumption values exist

---

### Problem

After the v3.1 threshold revision, three overrides (ExitCapCompression, RefiRisk, ExpenseUnderstated) were still bouncing between different severities across rescans. Root cause: `break` statements in the switch cases let the function fall through to `return aiSeverity` when assumptions were present but didn't match the highest thresholds. This defeated the entire purpose of deterministic overrides.

Evidence: 4 rescans of identical input showed ExitCapCompression bouncing Medium↔High, RefiRisk bouncing Medium↔High, ExpenseUnderstated bouncing Medium↔High.

### Root Cause (All 6 Numeric Overrides Had the Same Bug)

```typescript
case "SomeRisk":
  if (value != null) {
    if (value >= threshold1) return "High";
    if (value >= threshold2) return "Medium";
    // BUG: value below threshold2 falls through break → aiSeverity wins
  }
  break;
```

### Fix

Added `return "Low"` floor after the last threshold check in every case where the required assumption values are present. AI severity fallback now ONLY applies when required values are null/missing.

| Risk Type | Fix |
|-----------|-----|
| DebtCostRisk | LTV present → `return "Low"` floor |
| RefiRisk | All 3 values present → `return "Low"` floor; added partial-data paths for LTV+hold and debt_rate+hold |
| VacancyUnderstated | Vacancy present → `return "Low"` floor |
| RentGrowthAggressive | rent_growth present → `return "Low"` floor |
| ExitCapCompression | Both caps present → `return "Low"` floor |
| ExpenseUnderstated | expense_growth present → `return "Low"` floor |

### Stress Test Added

New test: "NEVER falls back to AI severity when required assumptions are present" — runs all 9 risk types 20 times with randomized AI severity inputs. Asserts each risk type produces exactly 1 unique output regardless of AI input.

### Commit

```
66cffcd Fix severity overrides to never fall back to AI when assumptions present
```

Pushed to `origin/main`.

---

## Session 9: Pricing Alignment, Monthly Scan Limits, Signals Nav, Design Polish

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** Enforce 10 scans/month for Starter, align pricing copy with entitlements, add Signals nav, pricing page design polish

---

### Part 1: Monthly Scan Limit for Starter (PRO)

- **Migration 061:** Created `monthly_scan_usage` table with (org_id, month_key) unique constraint, RLS for service_role, and `upsert_monthly_scan_usage` atomic RPC
- **Entitlements:** Added `maxScansPerMonth: number | null` to `WorkspaceEntitlements` — FREE=null, PRO=10, PRO+=null, ENTERPRISE=null
- **Usage helpers:** Added `getMonthlyScansUsed()` and `incrementMonthlyScanUsage()` to `lib/usage.ts`
- **Error code:** Added `MONTHLY_SCAN_LIMIT` to `ENTITLEMENT_ERROR_CODES`
- **Scan route enforcement:** Pre-check before OpenAI call returns 429 when at limit; post-scan increment after finalization (non-fatal). Platform admin bypasses both.
- **UI scan counter:**
  - Deal detail: Shows "X of 10 scans used this month" below scan button (amber at 8+). At limit, replaces scan button with upgrade CTA.
  - Dashboard UsageBanner: Monthly scan info with warning at 8+, blocking at 10.
  - Usage API: Extended `/api/usage/today` with `monthly_scans_used` and `monthly_scans_limit`

### Part 2: Pricing Page Feature Alignment

Fixed ALL pricing copy to match actual `lib/entitlements/workspace.ts`:
- **Starter:** "Up to 5 workspace members" (was 2), removed unlimited scans disclaimer, added "Benchmark percentiles" and "Support bundle"
- **Analyst:** "Up to 10 workspace members" (was 5), added "Supplemental AI Insights" and "Methodology version lock"
- **Fund:** "Unlimited workspace members" (was 10)
- **Comparison table:** Fixed Team seats (5/10/Unlimited/Unlimited), fixed Benchmark percentiles (✓ for Starter — single unified feature), added 3 new rows (Support bundle, AI Insights, Methodology version lock)

### Part 3: Signals Navigation

- Created `/app/signals` page under app layout (imports existing AnalyzePage client component)
- Added "Signals" link in AppNav between Deals and Portfolio

### Part 4: Pricing Page Design Polish

- Colored top borders per tier: gray (Starter), blue (Analyst), purple (Fund), zinc (Enterprise)
- Glassmorphism gradient on Analyst card (`bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-zinc-900 backdrop-blur-sm`)
- Increased card padding (`py-7 px-8`), feature list spacing (`space-y-1.5 leading-relaxed`)
- Comparison table: increased cell padding (14px 20px), stronger alternating rows, brighter Analyst column highlight
- Founding Member: upgraded to `border-2`, added "14 of 20 founding spots remaining" text

### Tests

- Updated `lib/entitlements/workspace.test.ts`: added `maxScansPerMonth` assertions for all 4 tiers
- Created `lib/monthlyScanLimit.test.ts`: 8 tests covering limit enforcement logic, month_key format, counter reset, trial users

### Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/061_monthly_scan_usage.sql` | Monthly scan tracking table + RPC |
| `lib/monthlyScanLimit.test.ts` | Monthly scan limit tests |
| `app/app/signals/page.tsx` | Signals page in app layout |

### Files Modified

| File | Change |
|------|--------|
| `lib/entitlements/workspace.ts` | Add `maxScansPerMonth` to interface + all plan cases |
| `lib/entitlements/errors.ts` | Add `MONTHLY_SCAN_LIMIT` error code |
| `lib/usage.ts` | Add monthly scan helpers |
| `app/api/deals/scan/route.ts` | Monthly limit pre-check + post-scan increment |
| `app/api/usage/today/route.ts` | Add monthly scan data to response |
| `app/app/UsageBanner.tsx` | Monthly scan counter display |
| `app/app/deals/[id]/page.tsx` | Pass monthly scan data to DealDetailClient |
| `app/app/deals/[id]/DealDetailClient.tsx` | MONTHLY_SCAN_LIMIT handler + scan counter + upgrade CTA |
| `lib/entitlements/workspace.test.ts` | Add maxScansPerMonth assertions |
| `app/pricing/page.tsx` | Fix feature copy + design polish |
| `app/pricing/PricingComparisonTable.tsx` | Fix rows + add rows + styling |
| `app/components/AppNav.tsx` | Add Signals link |
| `onboarding/CRESIGNALENGINE.md` | Updated docs |
| `onboarding/Claude.md` | This session log |

---

## Session 10: 7-Day Starter Trial + Annual Billing

**Date:** 2026-03-25
**Model:** Claude Opus 4.6
**Scope:** 7-day Starter trial for new orgs, annual billing toggle on pricing page

---

### Part 1: 7-Day Starter Trial

- **Migration 062** (`supabase/migrations/062_trial_support.sql`): Added `trial_ends_at TIMESTAMPTZ` and `trial_plan TEXT` to organizations with check constraint. Updated `create_deal_scan_with_usage_check` RPC to respect active trial (trial users not blocked by FREE 3-scan cap).
- **Entitlements** (`lib/entitlements/workspace.ts`): Added `TrialInfo` interface and `resolveEffectivePlan()` helper. Modified `getWorkspacePlanAndEntitlements` and `getWorkspacePlanAndEntitlementsForUser` to return `trial: TrialInfo`. Non-breaking change — existing callers using `{ plan, entitlements }` destructuring still work.
- **Org creation** (`lib/org.ts`): New orgs get `trial_ends_at = NOW() + 7 days` and `trial_plan = 'PRO'`. Only new orgs (Case A in `ensureDefaultOrganization`).
- **Stripe webhook** (`app/api/stripe/webhook/route.ts`): Both the known-price and unknown-price update paths now set `trial_ends_at: null, trial_plan: null` — paying customers are never in trial state.
- **Trial banner** (`app/components/TrialBanner.tsx`): Top banner above app content. Days 7-3: blue info, dismissable (reappears next day via date-keyed localStorage). Days 2-0: amber/red, non-dismissable. Expired: red, non-dismissable.
- **App layout** (`app/app/layout.tsx`): Fetches trial state via `getWorkspacePlanAndEntitlements`, renders `TrialBanner` above `{children}`.
- **Pricing page** (`app/pricing/page.tsx`, `PricingClient.tsx`): Fetches trial state from org. Shows "Currently trialing" badge on Starter card during trial, "Trial ended" after expiry. Trialing Starter CTA: "Subscribe to keep access". Trialing Analyst CTA: "Upgrade to Analyst".
- **Settings** (`app/settings/page.tsx`, `BillingCard.tsx`): Shows "Starter (Trial — X days remaining)" and "Subscribe Now" button during trial.

### Part 2: Annual Billing

- **Env vars**: `STRIPE_STARTER_ANNUAL_PRICE_ID`, `STRIPE_ANALYST_ANNUAL_PRICE_ID`, `STRIPE_FUND_ANNUAL_PRICE_ID`, `STRIPE_FOUNDING_ANNUAL_PRICE_ID` (all optional).
- **Webhook mapping** (`lib/stripeWebhookPlan.ts`): Annual price IDs map to same plan slugs as monthly.
- **Pricing toggle**: `BillingIntervalContext.tsx` (React context), `BillingIntervalToggle.tsx` (pill selector with "Save 20%"), `PricingPriceLabel.tsx` (interval-aware price labels). Toggle only renders when at least one annual price ID is configured.
- **Checkout** (`app/api/billing/create-checkout-session/route.ts`): Accepts `interval` param, selects annual price ID when available.
- **Price constants** (`lib/pricingConfig.ts`): Monthly/annual prices. Founding Member: same price for both intervals.
- **Billing interval helper** (`lib/billingInterval.ts`): `getBillingInterval()` for settings display.

### Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/062_trial_support.sql` | Trial columns + trial-aware RPC |
| `lib/pricingConfig.ts` | Price constants |
| `lib/billingInterval.ts` | Billing interval helper |
| `app/pricing/BillingIntervalContext.tsx` | React context for interval state |
| `app/pricing/BillingIntervalToggle.tsx` | Monthly/Annual pill selector |
| `app/pricing/PricingPriceLabel.tsx` | Interval-aware price label |
| `app/components/TrialBanner.tsx` | Trial banner component |

### Files Modified

| File | Change |
|------|--------|
| `lib/entitlements/workspace.ts` | TrialInfo interface, resolveEffectivePlan, modified return types |
| `lib/org.ts` | Set trial fields on new org creation |
| `lib/stripeWebhookPlan.ts` | Annual price ID mappings |
| `app/api/stripe/webhook/route.ts` | Clear trial on subscription activation |
| `app/api/billing/create-checkout-session/route.ts` | Accept interval, select annual/monthly price |
| `app/pricing/page.tsx` | Trial detection, interval provider, toggle, price labels |
| `app/pricing/PricingClient.tsx` | Trial props, interval from context |
| `app/app/layout.tsx` | Fetch trial state, render TrialBanner |
| `app/settings/page.tsx` | Extract trial info, pass to BillingCard |
| `app/settings/BillingCard.tsx` | Trial status + Subscribe Now CTA |
| `docs/BILLING.md` | Full rewrite with trial + annual docs |
| `CLAUDE.md` | Migration index 062 → 063 |
| `onboarding/CRESIGNALENGINE.md` | Trial + annual billing docs |
| `onboarding/Claude.md` | This session log |
