# Phase 1 — Institutional Surface Lock (Implementation Summary)

This document records what was implemented for Phase 1 of the institutional roadmap, per `docs/roadmap_phase1.md` and `docs/INSTITUTIONAL_EXECUTION_PLAN.md`.

---

## 1. Data model (migrations)

| Migration | Purpose |
|-----------|---------|
| **036_governance_decision_log.sql** | Append-only audit table for governance decisions. Columns: `id`, `organization_id`, `deal_id`, `snapshot_id`, `policy_id`, `action_type` ('approve' \| 'override' \| 'escalate'), `note`, `user_id`, `created_at`. RLS: org members **SELECT only**; all writes via service role in server code. Indexes: `(organization_id, created_at DESC)`, `(deal_id)`, `(policy_id)`. |
| **037_risk_score_history.sql** | Append-only table for risk score trajectory (score over time per deal). Columns: `id`, `deal_id`, `scan_id`, `score`, `percentile`, `risk_band`, `snapshot_id`, `completed_at`. RLS: org members SELECT; INSERT only from scan-creation path (service role). Index: `(deal_id, completed_at DESC)`. |
| **038_workspace_plan_proplus.sql** | Extends `organizations.plan` check to include `'PRO+'` (allowed: `FREE`, `PRO`, `PRO+`, `ENTERPRISE`). |

---

## 2. Entitlements (Option B)

**File:** `lib/entitlements/workspace.ts`

- **WorkspacePlan:** Added `"PRO+"`; type is `"FREE" | "PRO" | "PRO+" | "ENTERPRISE"`.
- **WorkspaceEntitlements:** Added `maxMembers: number | null`.
  - FREE: `maxMembers: 1`, no invite, no benchmark/policy/export.
  - PRO: `maxMembers: 5`, `canInviteMembers: true`, `maxActivePoliciesPerOrg: 1`, export, benchmark consumption only.
  - PRO+: `maxMembers: 10`, `maxActivePoliciesPerOrg: 3`, same as PRO plus trajectory/audit capabilities.
  - ENTERPRISE: `maxMembers: null`, unlimited policies/members, cohort/snapshot build, etc.
- **getWorkspacePlanAndEntitlements:** Recognizes `PRO+` from `organizations.plan`.

**File:** `lib/entitlements/errors.ts`

- Added `MEMBER_LIMIT_REACHED`.
- `required_plan` type extended to include `"PRO+"`.

---

## 3. Member cap enforcement

| Route | Change |
|-------|--------|
| **POST /api/org/invite** (`app/api/org/invite/route.ts`) | Before creating an invite, counts `organization_members` for the org; if `count >= maxMembers`, returns 403 with `{ error: "Workspace member limit reached.", code: "MEMBER_LIMIT_REACHED" }`. Invite allowed for PRO and PRO+ (not only Enterprise). |
| **POST /api/invite/accept** (`app/api/invite/accept/route.ts`) | Before inserting into `organization_members`, uses `getWorkspacePlanAndEntitlements(service, orgId)` and checks `count >= maxMembers`; if at cap, returns 403 with same `MEMBER_LIMIT_REACHED` payload. |

---

## 4. API changes

### Health endpoint

**File:** `app/api/health/route.ts`

- **GET /api/health**
  - Unauthenticated: responds with `{ ok: true }` only (no plan or internal metadata).
  - Authenticated: responds with `{ ok: true, database_ok, stripe_configured, workspace_plan?, latest_method_version }` for operational checks.

### Structured error responses

- Scan route (`app/api/deals/scan/route.ts`): 403/404/500 responses use JSON `{ error, code }` (e.g. `PLAN_LIMIT_REACHED`, `ORGANIZATION_NOT_FOUND`, `SCAN_SAVE_FAILED`).
- Invite and accept routes return `{ error, code }` (e.g. `MEMBER_LIMIT_REACHED`).

---

## 5. Stripe PRO+

**File:** `app/api/stripe/webhook/route.ts`

- Env: `STRIPE_PRICE_ID_PRO_PLUS`; mapped in `planFromPriceId()` to plan `'PRO+'`.
- Subscription create/update sets `organizations.plan = 'PRO+'` when the subscription price matches.

**Docs:** `docs/BILLING.md` updated to document `STRIPE_PRICE_ID_PRO_PLUS`.

---

## 6. Risk score history (write path)

**File:** `app/api/deals/scan/route.ts`

- After updating `deal_scans` with `risk_index_score`, `risk_index_band`, etc., inserts one row into `risk_score_history`: `deal_id`, `scan_id`, `score`, `risk_band`, `completed_at`. Percentile/snapshot_id can be added later. Insert is best-effort: on failure, error is logged and the scan still succeeds.

---

## 7. UI changes

### Copy renames (user-facing only)

- "Risk Policy" → "Governance" (nav, portfolio card, policy page title, fallback label).
- "Digest" → "Risk Brief": nav link, Settings ("Daily Risk Brief time", "Test Risk Brief", "Send test Risk Brief now", "Preview Risk Brief"), Digest preview button label.
- BillingCard already used "Scheduled Risk Brief"; no change.

**Files touched:** `app/components/AppNav.tsx`, `app/settings/SettingsForm.tsx`, `app/digest/preview/DigestPreviewClient.tsx`, `app/app/portfolio/PortfolioClient.tsx`, `app/app/policy/PolicyClient.tsx` (page title "Governance"), `app/settings/BillingCard.tsx`.

### Portfolio institutional metadata

**File:** `lib/portfolioSummary.ts`

- **BenchmarkContext** extended with optional: `snapshot_id`, `cohort_key`, `method_version`, `delta_comparable`.
- When benchmark is enabled, `getPortfolioSummary` sets `benchmark_context.method_version` (from `RISK_INDEX_VERSION`) and `benchmark_context.delta_comparable: true` (empty and non-empty portfolio paths).

**File:** `app/app/portfolio/PortfolioClient.tsx`

- Benchmark card shows a small “Methodology” block when `summary.benchmark_context` exists: Method version, Snapshot (short id when present), Cohort key (when present), and “Delta comparable” / “Delta not comparable”.

Policy violation summary (Governance card with PASS/WARN/BLOCK, violation count, “Manage Governance”) was already present; fallback label for policy name set to “Governance”.

---

## 8. Global 15s fetch timeout

**File:** `lib/fetchJsonWithTimeout.ts`

- **fetchJsonWithTimeout(url, opts, ms):** Existing; used with 15s default for JSON APIs.
- **fetchWithTimeout(url, opts, ms):** New helper that returns the raw `Response` (for blob/PDF); same 15s abort behavior.

**Client-side usage (15s timeout):**

- `app/digest/preview/DigestPreviewClient.tsx` — send Risk Brief.
- `app/settings/SettingsForm.tsx` — save preferences, send test Risk Brief.
- `app/app/portfolio/PortfolioClient.tsx` — save portfolio view (POST portfolio-views).
- `app/settings/workspace/WorkspaceClient.tsx` — invite, PATCH role, DELETE member.
- `app/invite/accept/AcceptInviteClient.tsx` — accept invite, PATCH org/current.
- `app/components/AppNav.tsx` — GET org/current.
- `app/app/deals/[id]/PercentileBlock.tsx` — cohorts, snapshots, deal benchmark.
- `app/app/deals/[id]/ScenarioComparisonBlock.tsx` — scenario-diff.
- `app/app/deals/[id]/IcStatusBlock.tsx` — PATCH deal.
- `app/app/deals/[id]/IcNarrativeBlock.tsx` — POST narrative.
- `app/app/deals/[id]/ExportPdfButton.tsx` — export PDF (fetchWithTimeout).
- `app/components/MethodologyDownloadLink.tsx` — methodology PDF (fetchWithTimeout).
- `app/app/methodology/MethodologyDownloadButton.tsx` — methodology PDF (fetchWithTimeout).
- `app/app/UsageBanner.tsx` — GET usage/today.
- `app/analyze/page.tsx` — POST analyze.
- `app/app/deals/new/page.tsx` — POST create deal.
- `app/app/policy/PolicyClient.tsx` — already used `fetchJsonWithTimeout` for policy CRUD and evaluate.

---

## 9. Acceptance criteria (from roadmap)

| Criterion | Status |
|-----------|--------|
| GET /api/health returns 200; unauthenticated gets `{ ok: true }`; authenticated gets `database_ok`, `stripe_configured`, `workspace_plan`, `latest_method_version`. | Done |
| Portfolio shows Snapshot ID, Cohort key, Method version, delta-comparable indicator, and policy violation summary when data exists. | Done |
| User-facing “Risk Policy” → “Governance”; “Digest” → “Risk Brief”. | Done |
| All UI data fetches use 15s abort; no indefinite spinner. | Done |
| FREE / PRO / PRO+ / ENTERPRISE limits: FREE 3 scans, no benchmark/policy/export/members; PRO 5 members, 1 policy, export; PRO+ 10 members, 3 policies, trajectory; ENTERPRISE unlimited. | Done (entitlements + member cap) |
| Invite and accept-invite return 403 and `MEMBER_LIMIT_REACHED` when at plan member limit. | Done |
| Stripe: PRO+ price ID maps to plan PRO+ in webhook; org plan updates on subscription change. | Done |
| Tables `governance_decision_log` and `risk_score_history` exist; RLS and indexes in place; new scan completions write to `risk_score_history`. | Done |

---

## 10. Files created or modified (reference)

**Created**

- `supabase/migrations/036_governance_decision_log.sql`
- `supabase/migrations/037_risk_score_history.sql`
- `supabase/migrations/038_workspace_plan_proplus.sql`
- `app/api/health/route.ts`
- `docs/PHASE1_IMPLEMENTATION.md` (this file)

**Modified**

- `lib/entitlements/workspace.ts` — PRO+, maxMembers, Option B.
- `lib/entitlements/errors.ts` — MEMBER_LIMIT_REACHED, required_plan PRO+.
- `lib/portfolioSummary.ts` — BenchmarkContext fields, method_version/delta_comparable in summary.
- `lib/fetchJsonWithTimeout.ts` — fetchWithTimeout.
- `app/api/org/invite/route.ts` — member cap, structured error.
- `app/api/invite/accept/route.ts` — member cap, structured error, getWorkspacePlanAndEntitlements.
- `app/api/deals/scan/route.ts` — risk_score_history insert, structured errors.
- `app/api/stripe/webhook/route.ts` — PRO+ price mapping.
- `app/settings/SettingsForm.tsx` — Risk Brief copy, fetchJsonWithTimeout.
- `app/settings/workspace/WorkspaceClient.tsx` — fetchJsonWithTimeout.
- `app/digest/preview/DigestPreviewClient.tsx` — Risk Brief copy, fetchJsonWithTimeout.
- `app/components/AppNav.tsx` — fetchJsonWithTimeout for org/current.
- `app/invite/accept/AcceptInviteClient.tsx` — fetchJsonWithTimeout.
- `app/app/portfolio/PortfolioClient.tsx` — benchmark_context UI, Manage Governance, fetchJsonWithTimeout.
- `app/app/deals/[id]/PercentileBlock.tsx` — fetchJsonWithTimeout.
- `app/app/deals/[id]/ScenarioComparisonBlock.tsx` — fetchJsonWithTimeout.
- `app/app/deals/[id]/IcStatusBlock.tsx` — fetchJsonWithTimeout.
- `app/app/deals/[id]/IcNarrativeBlock.tsx` — fetchJsonWithTimeout.
- `app/app/deals/[id]/ExportPdfButton.tsx` — fetchWithTimeout.
- `app/components/MethodologyDownloadLink.tsx` — fetchWithTimeout.
- `app/app/methodology/MethodologyDownloadButton.tsx` — fetchWithTimeout.
- `app/app/UsageBanner.tsx` — fetchJsonWithTimeout.
- `app/analyze/page.tsx` — fetchJsonWithTimeout.
- `app/app/deals/new/page.tsx` — fetchJsonWithTimeout.
- `docs/BILLING.md` — STRIPE_PRICE_ID_PRO_PLUS.

---

## Deploy notes

1. Run migrations in order: 036, 037, 038 (after any existing 035, e.g. role refactor).
2. Set `STRIPE_PRICE_ID_PRO_PLUS` in environment when the PRO+ product/price exists in Stripe.
3. No backfill required for existing orgs; they keep current plan until a subscription uses the PRO+ price.
