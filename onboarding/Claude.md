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

## Known Accepted Risks (Unchanged)

1. **Demo snapshot rate limit is in-memory** — per-instance only on Vercel serverless. Migrate to Redis/KV for strict global enforcement if needed.
2. **Feature flag cache TTL is 60s** — flag toggles may take up to 60s to propagate. Acceptable for current scale.
3. **Scan rate limit is per-org** — separate limits per org for multi-org users. Intended behavior.

---

## Manual QA Checklist (For User)

These require a running app + browser. Documented in the plan file at `.claude/plans/zany-dreaming-flute.md`, Step 7 (manual QA). Nine tests covering: guest lead flow, owner flag toggle, tier override enforcement, cross-user feature flag, changelog security, password-protected share, theme toggle, onboarding flow, and SEO (sitemap/robots).
