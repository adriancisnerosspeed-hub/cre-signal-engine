# Phase 3 — Enterprise Infrastructure (Implementation Summary)

This document records what was implemented for Phase 3 of the institutional roadmap, per `docs/roadmap_phase3.md`, `docs/INSTITUTIONAL_EXECUTION_PLAN.md`, and `.cursor/plans/institutional_roadmap_docs_80ad5f86.plan.md`.

**Goal:** Enterprise defensibility: cohort creation UI, snapshot build control, governance dashboard, read-only API v1, token-based auth, role-based permissions (OWNER/ADMIN for cohort/snapshot/tokens), and SLA/observability (event logging, usage tracking).

**Prerequisites:** Phase 1 and Phase 2 complete (PRO+, multi-policy, overrides, trajectory, governance export, `policy_overrides`, `governance_decision_log`, `risk_score_history`).

**Scope alignment:** Per INSTITUTIONAL_EXECUTION_PLAN Section C, roles remain OWNER / ADMIN / MEMBER only (no ANALYST/VIEWER). API v1 is minimal: only `GET /api/v1/deals/:id/risk` and `GET /api/v1/portfolio/risk-summary` (no `GET /api/v1/deals/:id/benchmark` in initial scope). Governance dashboard is minimal: risk trend (avg score over time), policy violation count, override count.

---

## 1. Data model (migrations)

| Migration | Purpose |
|-----------|---------|
| **041_api_tokens.sql** | Table `api_tokens`: `id`, `organization_id`, `name`, `token_hash` (UNIQUE), `last_used_at`, `created_at`, `created_by`. Constraint `(organization_id, name)` unique. RLS: org members **SELECT**; **INSERT**/ **DELETE** only for org OWNER/ADMIN via `is_org_owner_or_admin()`. No UPDATE policy for authenticated; service role updates `last_used_at` on v1 API use. |
| **042_benchmark_cohort_audit.sql** | Table `benchmark_cohort_audit`: `id`, `cohort_id`, `changed_at`, `changed_by`, `previous_rule_json`, `new_rule_json`, `previous_rule_hash`, `new_rule_hash`. Append-only; RLS SELECT for org members (cohort visible to user). No INSERT for authenticated; server uses service role to insert on cohort rule update. |

---

## 2. API changes

### 2.1 Token-based auth (lib/apiAuth.ts)

**File:** `lib/apiAuth.ts`

- **hashApiToken(raw):** SHA-256 hash of raw token for storage/lookup.
- **getBearerToken(request):** Extracts Bearer token from `Authorization` header.
- **getOrgFromToken(request):** Resolves request to `{ organizationId, tokenId }` via service role lookup on `api_tokens` by `token_hash`. Updates `last_used_at` best-effort (non-blocking). Returns `null` if token missing or invalid (caller returns 401).

### 2.2 API tokens (settings)

**File:** `app/api/settings/api-tokens/route.ts`

- **GET /api/settings/api-tokens** — List tokens for current org (masked as `••••••••`). Enterprise plan only; OWNER or ADMIN only. Returns `{ tokens: [{ id, name, last_used_at, created_at, token_preview }] }`.
- **POST /api/settings/api-tokens** — Create token. Body: `{ name }`. Enterprise only; OWNER/ADMIN only. Generates `cre_` + 32-byte hex secret; stores only hash; returns `{ id, name, created_at, token, message }` (raw token shown once).

**File:** `app/api/settings/api-tokens/[id]/route.ts`

- **DELETE /api/settings/api-tokens/[id]** — Revoke token. Enterprise only; OWNER/ADMIN only. Returns `{ ok: true, revoked: true }`.

### 2.3 API v1 (read-only, token-only)

**File:** `app/api/v1/deals/[id]/risk/route.ts`

- **GET /api/v1/deals/:id/risk** — Token auth only. Returns `{ deal_id, score, risk_band, scan_id, completed_at, percentile }` (percentile null in initial scope). 404 if deal not in token’s org.

**File:** `app/api/v1/portfolio/risk-summary/route.ts`

- **GET /api/v1/portfolio/risk-summary** — Token auth only. Returns portfolio risk summary: `total_deals`, `scanned_count`, `unscanned_count`, `distribution_by_band`, `policy_status: { overall_status, violation_count }`, `last_updated`.

### 2.4 Governance dashboard

**File:** `app/api/governance/dashboard/route.ts`

- **GET /api/governance/dashboard?days=30** — Session auth. Query: `days` (default 30, max 90). Returns: `risk_trend` (array of `{ date, avg_score, point_count }` from `risk_score_history` aggregated by day), `policy_violation_count`, `policy_overall_status`, `override_count`, `total_deals`, `scanned_count`, `days`. Gated: PRO+ or ENTERPRISE (via `canUseTrajectory` or `canUseGovernanceExport`).

### 2.5 Cohort and snapshot (permission enforcement)

**File:** `app/api/benchmarks/cohorts/route.ts`

- **POST /api/benchmarks/cohorts** — Existing create; **added** OWNER/ADMIN role check. Only OWNER or ADMIN can create cohorts (in addition to Enterprise plan).

**File:** `app/api/benchmarks/cohorts/[id]/route.ts` (new)

- **PATCH /api/benchmarks/cohorts/[id]** — Update cohort `name`, `description`, `rule_json`. Enterprise only; OWNER/ADMIN only. On `rule_json` change: bumps `version`, sets `rule_hash` via `computeRuleHash`, inserts row into `benchmark_cohort_audit` (service role). Returns updated cohort.

**File:** `app/api/benchmarks/snapshots/build/route.ts`

- **POST /api/benchmarks/snapshots/build** — **Added** OWNER/ADMIN role check. Only OWNER or ADMIN can build snapshots (in addition to Enterprise plan).

---

## 3. UI changes

### 3.1 Benchmark cohorts & snapshot build

**File:** `app/app/benchmarks/cohorts/page.tsx` (new)

- Server page: resolves org, plan, entitlements (`canCreateCohort`, `canBuildSnapshot`); fetches cohorts (global + workspace). Renders `BenchmarksCohortsClient` with cohorts and flags.

**File:** `app/app/benchmarks/cohorts/BenchmarksCohortsClient.tsx` (new)

- **Build snapshot:** Form: cohort select, as-of datetime, “Build snapshot” button. Calls `POST /api/benchmarks/snapshots/build`. Shows result (snapshot_id, build_status, n_eligible or error). Visible when `canBuildSnapshot` (Enterprise + OWNER/ADMIN).
- **Create cohort:** Form: key, name, description, rule JSON textarea. Calls `POST /api/benchmarks/cohorts`. Visible when `canCreateCohort` (Enterprise).
- **Cohorts table:** Key, name, scope, version, rule_hash (truncated) for all visible cohorts.

### 3.2 Governance dashboard

**File:** `app/app/governance/dashboard/page.tsx` (new)

- Server page: resolves org and entitlements; only renders dashboard client if PRO+ or ENTERPRISE (via `canUseTrajectory` or `canUseGovernanceExport`). Otherwise shows “Available on PRO+ and Enterprise plans.”

**File:** `app/app/governance/dashboard/GovernanceDashboardClient.tsx` (new)

- Fetches `GET /api/governance/dashboard?days=30` (days selectable 7/30/90). Displays: total deals, scanned count, policy violations, overrides, policy overall status; table of risk trend (date, avg score, point count) for last 14 days.

### 3.3 API tokens (settings)

**File:** `app/settings/api-tokens/page.tsx` (new)

- Server page: resolves org, plan, role. If not Enterprise, shows “Upgrade to Enterprise” message. If Enterprise and OWNER/ADMIN, renders `ApiTokensClient`.

**File:** `app/settings/api-tokens/ApiTokensClient.tsx` (new)

- **Create token:** Name input, “Create” button; calls `POST /api/settings/api-tokens`. On success, shows raw token once with copy hint.
- **Tokens table:** Name, created, last used, “Revoke” button; list from `GET /api/settings/api-tokens`; revoke via `DELETE /api/settings/api-tokens/[id]`.

### 3.4 Navigation and settings links

**File:** `app/components/AppNav.tsx`

- Added links: “Governance dashboard” (`/app/governance/dashboard`), “Benchmarks” (`/app/benchmarks/cohorts`).

**File:** `app/settings/page.tsx`

- Quick links: “Governance dashboard”, “Benchmark cohorts & snapshots”, “API tokens”.

---

## 4. Event logging and usage tracking

**File:** `lib/eventLog.ts` (new)

- Structured JSON log helpers (stdout): `logScanCreated`, `logPolicyEvaluated`, `logOverrideCreated`, `logSnapshotBuilt`, `logCohortCreated`, `logCohortUpdated`, `logApiTokenCreated`, `logApiTokenRevoked`, `logApiV1Call`. Each emits `{ event, org_id?, user_id?, timestamp, ... }`.

**Wired into:**

- `app/api/benchmarks/snapshots/build/route.ts` — `logSnapshotBuilt` after build.
- `app/api/benchmarks/cohorts/route.ts` — `logCohortCreated` after create.
- `app/api/benchmarks/cohorts/[id]/route.ts` — `logCohortUpdated` when rule_json changed.
- `app/api/settings/api-tokens/route.ts` — `logApiTokenCreated` after create.
- `app/api/settings/api-tokens/[id]/route.ts` — `logApiTokenRevoked` after delete.
- `app/api/v1/deals/[id]/risk/route.ts` — `logApiV1Call` with endpoint and token_id.
- `app/api/v1/portfolio/risk-summary/route.ts` — `logApiV1Call`.
- `app/api/policy-overrides/route.ts` — `logOverrideCreated` after override created.

**Usage tracking:** `api_tokens.last_used_at` is updated on each successful v1 API call (in `getOrgFromToken`). Event logs can be aggregated for SLA reporting (e.g. API v1 calls per org/endpoint, snapshot builds, cohort edits, token create/revoke).

---

## 5. Permission matrix (enforced)

| Action | OWNER | ADMIN | MEMBER |
|--------|--------|--------|--------|
| Policy edit, override | Yes | Yes | No |
| Snapshot build (Enterprise) | Yes | Yes | No |
| Cohort create/edit (Enterprise) | Yes | Yes | No |
| API token create/revoke (Enterprise) | Yes | Yes | No |
| View portfolio, deals, exports | Yes | Yes | Yes |
| Run scans / create deals | Yes | Yes | Yes |

- Enforcement: In cohort POST, cohort PATCH, snapshot build POST, and API token GET/POST/DELETE, the current user’s `organization_members.role` is checked; only OWNER or ADMIN may perform those actions (in addition to plan checks). Policy override already enforced OWNER/ADMIN in Phase 2.

---

## 6. Acceptance criteria (Phase 3)

| Criterion | Status |
|-----------|--------|
| Roles OWNER/ADMIN/MEMBER enforced; cohort/snapshot/token actions require OWNER or ADMIN. | Done (role checks in cohorts, snapshot build, api-tokens). |
| Cohort creation (Enterprise): UI with rule JSON, version and rule_hash visible; audit log table and PATCH write to it. | Done (cohorts page, PATCH with audit insert). |
| Snapshot build control (Enterprise): Choose as_of_timestamp, build/rebuild, view status/hash. | Done (BenchmarksCohortsClient build form + existing build API). |
| Governance dashboard (minimal): Risk trend, violation count, override count. | Done (GET /api/governance/dashboard + GovernanceDashboardClient). |
| API v1: GET /api/v1/deals/:id/risk and GET /api/v1/portfolio/risk-summary with token auth; only ENTERPRISE can create tokens. | Done (apiAuth, v1 routes, api-tokens CRUD). |
| SLA/observability: Event logging for scan, policy, override, snapshot, cohort, API token, v1 call; usage via last_used_at. | Done (eventLog.ts + wiring; last_used_at in api_tokens). |

---

## 7. Files added or changed (summary)

**New files**

- `supabase/migrations/041_api_tokens.sql`
- `supabase/migrations/042_benchmark_cohort_audit.sql`
- `lib/apiAuth.ts`
- `lib/eventLog.ts`
- `app/api/settings/api-tokens/route.ts`
- `app/api/settings/api-tokens/[id]/route.ts`
- `app/api/v1/deals/[id]/risk/route.ts`
- `app/api/v1/portfolio/risk-summary/route.ts`
- `app/api/governance/dashboard/route.ts`
- `app/api/benchmarks/cohorts/[id]/route.ts`
- `app/app/benchmarks/cohorts/page.tsx`
- `app/app/benchmarks/cohorts/BenchmarksCohortsClient.tsx`
- `app/app/governance/dashboard/page.tsx`
- `app/app/governance/dashboard/GovernanceDashboardClient.tsx`
- `app/settings/api-tokens/page.tsx`
- `app/settings/api-tokens/ApiTokensClient.tsx`
- `docs/PHASE3_IMPLEMENTATION.md` (this file)

**Modified files**

- `app/api/benchmarks/cohorts/route.ts` — OWNER/ADMIN check, logCohortCreated.
- `app/api/benchmarks/snapshots/build/route.ts` — OWNER/ADMIN check, logSnapshotBuilt.
- `app/api/policy-overrides/route.ts` — logOverrideCreated.
- `app/components/AppNav.tsx` — Links for Governance dashboard, Benchmarks.
- `app/settings/page.tsx` — Quick links for Governance dashboard, Benchmark cohorts, API tokens.

---

## 8. Out of scope (per execution plan)

- No ANALYST or VIEWER roles (roles stay OWNER, ADMIN, MEMBER).
- No `GET /api/v1/deals/:id/benchmark` in initial scope.
- No heavy governance dashboard visualizations (only risk trend table, violation/override counts).
- No client INSERT to `governance_decision_log` or `benchmark_cohort_audit`; all writes via service role in server endpoints.
