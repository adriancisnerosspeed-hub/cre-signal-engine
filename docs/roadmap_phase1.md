# Phase 1 — Institutional Surface Lock

**Goal:** Make CRE Signal Engine production-grade and sellable. Lock Option B pricing, surface institutional artifacts on the portfolio page, add health and audit foundations, and ensure no UI hangs.

**Prerequisites:** None. This phase is the first in the institutionalization roadmap.

---

## 1. Data model changes

### 1.1 New migration: `governance_decision_log`

Create a new migration (e.g. `035_governance_decision_log.sql`) with:

- **Table:** `governance_decision_log`
- **Columns:**
  - `id` — UUID, primary key, default `gen_random_uuid()`
  - `organization_id` — UUID, NOT NULL, references `organizations(id)` ON DELETE CASCADE
  - `deal_id` — UUID, nullable, references `deals(id)` ON DELETE SET NULL
  - `snapshot_id` — UUID, nullable, references `benchmark_cohort_snapshots(id)` ON DELETE SET NULL
  - `policy_id` — UUID, nullable, references `risk_policies(id)` ON DELETE SET NULL
  - `action_type` — TEXT, NOT NULL, check constraint: `IN ('approve', 'override', 'escalate')`
  - `note` — TEXT, nullable
  - `user_id` — UUID, nullable, references `auth.users(id)` ON DELETE SET NULL
  - `created_at` — TIMESTAMPTZ, NOT NULL, default `now()`
- **Indexes:** `(organization_id, created_at DESC)`, `(deal_id)`, `(policy_id)`
- **RLS:** Enable RLS. Policy: org members can SELECT; org members can INSERT (with CHECK that `organization_id` matches their org membership). No UPDATE or DELETE (append-only log).

### 1.2 New migration: `risk_score_history`

Create a new migration (e.g. `036_risk_score_history.sql`) with:

- **Table:** `risk_score_history`
- **Columns:**
  - `id` — UUID, primary key, default `gen_random_uuid()`
  - `deal_id` — UUID, NOT NULL, references `deals(id)` ON DELETE CASCADE
  - `scan_id` — UUID, NOT NULL, references `deal_scans(id)` ON DELETE CASCADE
  - `score` — INT, NOT NULL (risk index from the scan)
  - `percentile` — NUMERIC, nullable (from deal_benchmarks when snapshot present)
  - `risk_band` — TEXT, nullable (e.g. Low, Moderate, High, Elevated)
  - `snapshot_id` — UUID, nullable, references `benchmark_cohort_snapshots(id)` ON DELETE SET NULL
  - `completed_at` — TIMESTAMPTZ, NOT NULL (from `deal_scans.completed_at` or scan completion time)
- **Indexes:** `(deal_id, completed_at DESC)` for trajectory queries
- **RLS:** Enable RLS. Policy: org members can SELECT/INSERT only for deals in their org (via deal → organization_id and `is_org_member`). No UPDATE or DELETE (append-only).
- **Population:** Backfill is optional. New rows must be inserted whenever a deal scan completes (from the same flow that updates `deals.latest_risk_score`). Source: `deal_scans` + `deal_risks` (or existing risk index) and optionally `deal_benchmarks` for percentile/risk_band when a snapshot is used.

**Reference:** Existing scan completion path (e.g. where `create_deal_scan_with_usage_check` is used and risks are written) — add an insert into `risk_score_history` after a successful scan. See `supabase/migrations/032_pricing_stripe_hardening.sql` for the RPC; application code that calls it should also write to `risk_score_history`.

---

## 2. API changes

### 2.1 New route: `GET /api/health/system`

- **File:** `app/api/health/system/route.ts`
- **Method:** GET
- **Auth:** Optional (can be unauthenticated for load balancer checks) or require internal header/API key if you want to restrict.
- **Response (200):** JSON with:
  - `latest_method_version` — string (e.g. from `lib/benchmark/constants.ts` or `deal_scans.risk_index_version` / a single source of truth)
  - `benchmark_snapshot_count` — number (count of rows in `benchmark_cohort_snapshots` with `build_status = 'SUCCESS'`, or total)
  - `migration_version` — string or number (e.g. latest migration number or a version table; if not present, return `"unknown"` or omit)
  - `workspace_plan` — string (current org’s plan if authenticated; otherwise omit or `"anonymous"`)
  - `database_ok` — boolean (true if a simple query succeeds, e.g. `SELECT 1` or `SELECT COUNT(*) FROM organizations LIMIT 1`)
  - `stripe_configured` — boolean (true if `STRIPE_SECRET_KEY` or relevant Stripe env vars are set and non-empty)
- **Errors:** Return 503 with JSON `{ "error": "...", "code": "HEALTH_CHECK_FAILED" }` if database or critical dependency fails.

### 2.2 Structured error responses

- **Requirement:** All API routes that return errors should return JSON with at least `error` (message) and, where applicable, `code` (e.g. `PLAN_LIMIT_REACHED`, `PORTFOLIO_LIMIT_REACHED`, `UNAUTHORIZED`).
- **Files to audit:** All handlers under `app/api/` that use `NextResponse.json()` for errors. Ensure 4xx/5xx responses use a consistent shape, e.g. `{ error: string, code?: string }`.
- **Reference:** `lib/entitlements/errors.ts` already defines error codes; use them in API responses.

---

## 3. UI changes

### 3.1 Copy renames (no feature logic change)

- **“Risk Policy” → “Governance”:** Replace any remaining user-facing “Risk Policy” with “Governance” (nav, page titles, settings labels). DB and code can keep `risk_policies`; only labels change.
- **“Digest” → “Risk Brief”:** Replace any remaining user-facing “Digest” with “Risk Brief” (e.g. nav link text, email subject line labels, buttons like “Send test digest” → “Send test Risk Brief”). Internal code (e.g. `digest_preview`, `buildDigestSubject`) can keep existing names.
- **Files to check:** `app/components/AppNav.tsx`, `app/app/policy/page.tsx`, `app/settings/page.tsx`, `app/digest/preview/page.tsx`, any other components that show “Risk Policy” or “Digest” to the user.

### 3.2 Portfolio page institutionalization

- **File:** `app/app/portfolio/PortfolioClient.tsx` (and server data from `app/app/portfolio/page.tsx` / `lib/portfolioSummary.ts`).
- **Add to the portfolio view (no new backend logic beyond what exists):**
  - **Snapshot ID:** When a benchmark/snapshot context is present, show the current snapshot ID (e.g. short form or tooltip with full UUID). Data: from `getPortfolioSummary` with `benchmarkEnabled` — extend summary or benchmark context to include `snapshot_id` if not already.
  - **Cohort key:** Show the cohort key (e.g. `benchmark_cohorts.key`) for the snapshot in use. Data: from existing benchmark context (e.g. `summary.benchmark` or portfolio benchmark API).
  - **Method version:** Show the methodology version (e.g. `method_version` from snapshot or from `lib/benchmark/constants.ts`). Data: from snapshot or summary.
  - **Delta comparable indicator:** A short label or badge indicating that the current view is “comparable” or “delta comparable” (e.g. “Same methodology version” or “Snapshot as of YYYY-MM-DD”) so users know comparisons are valid.
  - **Policy violation summary:** Already present as Governance card (policy status, PASS/WARN/BLOCK, top violations). Ensure it’s clearly labeled and includes a one-line summary (e.g. “2 violations across 1 policy”).
- **Data source:** `getPortfolioSummary` in `lib/portfolioSummary.ts` already returns `policy_status` and `benchmark`; extend the benchmark-related fields in the summary or in the portfolio benchmark response to include `snapshot_id`, `cohort_key`, `method_version` so the client can render them.

### 3.3 Global fetch timeout (15 seconds)

- **Requirement:** Every UI-initiated fetch that can block the UI must use a 15-second abort. No spinner without a timeout.
- **Existing helper:** `lib/fetchJsonWithTimeout.ts` — `fetchJsonWithTimeout(url, opts, 15000)`.
- **Task:** Ensure all client-side data fetches (e.g. from `PortfolioClient`, deal pages, settings, digest preview, any `fetch` or SWR/React Query usage) go through this helper or a central client that applies the same 15s abort. Add timeout to any remaining raw `fetch` calls; show a user-friendly error state when the request aborts.
- **Files to check:** `app/app/portfolio/PortfolioClient.tsx`, `app/app/deals/[id]/page.tsx`, `app/digest/preview/DigestPreviewClient.tsx`, `app/settings/workspace/WorkspaceClient.tsx`, `app/analyze/page.tsx`, and any other components that call `fetch` or data-loading hooks.

---

## 4. Entitlement enforcement

### 4.1 Add PRO+ plan and Option B limits

- **Files:** `lib/entitlements/workspace.ts`, `supabase/migrations/031_workspace_plan_billing.sql` (new migration to alter plan check).
- **Changes:**
  - Add `PRO+` to `WorkspacePlan` type: `"FREE" | "PRO" | "PRO+" | "ENTERPRISE"`.
  - In `getWorkspaceEntitlements(plan)`:
    - **FREE:** Keep: 3 lifetime scans, 1 portfolio. No benchmark, policy, export, members, support bundle. `maxActivePoliciesPerOrg: 0`. Add: `maxMembers: 1` (or derive: no invites so only creator).
    - **PRO:** Unlimited scans, 3 portfolios. Benchmark consumption only (no cohort creation, no snapshot build). 1 active policy. **maxMembers: 5.** Export enabled. No cohort creation, no snapshot build. `canInviteMembers: true` for PRO (so they can invite up to 5 total). `maxActivePoliciesPerOrg: 1`.
    - **PRO+:** Everything in PRO. **maxMembers: 10.** **maxActivePoliciesPerOrg: 3.** Risk trajectory analytics, snapshot version lock, governance audit log export. No cohort creation; no snapshot build (those stay Enterprise).
    - **ENTERPRISE:** Unlimited policies, unlimited members, cohort creation, snapshot build, API access, SLA, custom reporting. `maxMembers: null`, `maxActivePoliciesPerOrg: null`.
  - Add to `WorkspaceEntitlements` interface: `maxMembers: number | null`.
- **Database:** New migration (e.g. `037_workspace_plan_proplus.sql`): alter `organizations.plan` check to include `'PRO+'`. Backfill not required; existing PRO/ENTERPRISE stay as-is until Stripe sends PRO+.

### 4.2 Enforce member caps

- **Invite flow:** In `app/api/org/invite/route.ts`, before creating an invite: get current member count for the org (`organization_members` where `org_id = organizationId`). Get workspace entitlements (plan) and `maxMembers`. If `currentCount >= maxMembers`, return 403 with `{ error: "Workspace member limit reached", code: "MEMBER_LIMIT_REACHED" }`.
- **Accept invite:** In `app/api/invite/accept/route.ts`, before adding the user to `organization_members`: same check (current count + 1 <= maxMembers). If over, return 403 with same code.
- **Direct add member (if any):** Any other path that adds a member must perform the same check.

### 4.3 Stripe: PRO+ price and webhook

- **Env:** Add `STRIPE_PRICE_ID_PRO_PLUS` (or `STRIPE_PRICE_ID_PRO_PLUS_MONTHLY`). Document in `.env.example`.
- **Webhook:** In `app/api/stripe/webhook/route.ts`, in the logic that maps `price.id` to plan (e.g. `planFromPriceId(priceId)`), add mapping for PRO+ price ID → `plan: 'PRO+'`. Update `organizations` with `plan = 'PRO+'` when subscription uses that price.
- **Checkout/portal:** Ensure billing UI or Stripe Customer Portal can offer PRO+ product/price if you use configurable products.

---

## 5. QA tests

- **Structured errors:** For at least one route that returns an error (e.g. scan creation when FREE and at cap), assert response is JSON with `error` and `code`.
- **Health:** GET `/api/health/system` returns 200 and body contains `database_ok`, `stripe_configured`, and at least one of `latest_method_version` or `benchmark_snapshot_count`.
- **No spinner without timeout:** Manual or E2E: trigger a long-running request from the UI and confirm it aborts or shows error within 15s (or mock slow response and assert timeout behavior).
- **Exports include snapshot metadata:** For deal export PDF and support bundle that use a snapshot, assert the output or payload includes snapshot ID, cohort key, method version (see `lib/export/getExportPdfPayload.ts` and support bundle route).
- **Policy evaluation deterministic:** Run policy evaluation twice with same inputs; same result (no flaky randomness).
- **Snapshot hash stable:** Same cohort + as_of + method + inputs produce same `snapshot_hash` (already guaranteed by `lib/benchmark/snapshotBuilder.ts`; add or reference a unit test if missing).

---

## 6. Acceptance criteria

- [ ] **Health:** `GET /api/health/system` returns 200 and JSON with keys: `latest_method_version`, `benchmark_snapshot_count`, `migration_version` (or omitted), `workspace_plan` (when auth’d), `database_ok`, `stripe_configured`.
- [ ] **Portfolio:** Portfolio page shows Snapshot ID, Cohort key, Method version, delta-comparable indicator, and policy violation summary when data is available.
- [ ] **Renames:** All user-facing “Risk Policy” replaced with “Governance”; “Digest” replaced with “Risk Brief.”
- [ ] **Timeout:** All UI data fetches use 15s abort; no indefinite spinner.
- [ ] **Plans:** FREE, PRO, PRO+, ENTERPRISE enforced: FREE 3 scans / no benchmark-policy-export-members; PRO 5 members / 1 policy / export / no cohort or snapshot build; PRO+ 10 members / 3 policies / trajectory / snapshot lock / audit log export; ENTERPRISE unlimited.
- [ ] **Member cap:** Invite and accept-invite fail with 403 and `MEMBER_LIMIT_REACHED` when at plan limit.
- [ ] **Stripe:** PRO+ price ID maps to plan PRO+ in webhook; org plan updates on subscription change.
- [ ] **Tables:** `governance_decision_log` and `risk_score_history` exist; RLS and indexes in place; new scan completions write to `risk_score_history` where applicable.
