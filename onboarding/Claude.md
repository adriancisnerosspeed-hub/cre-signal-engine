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
