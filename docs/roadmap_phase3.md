# Phase 3 — Enterprise Infrastructure Layer

**Goal:** Institutional defensibility: cohort creation UI, snapshot build control, governance dashboard, read-only API, role-based permissions, and SLA/observability. Enterprise-only features and clear permission matrix.

**Prerequisites:** Phase 1 and Phase 2 complete (PRO+, multi-policy, overrides, trajectory, governance export, `policy_overrides`, `governance_decision_log`, `risk_score_history`).

---

## 1. Data model changes

### 1.1 Roles: OWNER, ADMIN, ANALYST, VIEWER

- **Current state:** `organization_members.role` has CHECK `role IN ('owner', 'admin', 'member')` (see [supabase/migrations/006_organizations_and_profiles_current_org.sql](supabase/migrations/006_organizations_and_profiles_current_org.sql)).
- **Migration:** New migration (e.g. `040_organization_roles_analyst_viewer.sql`).
  - Extend the role check to include `'analyst'` and `'viewer'`: `role IN ('owner', 'admin', 'member', 'analyst', 'viewer')`.
  - **Semantics:** OWNER = full control; ADMIN = same as current admin (policies, members, overrides, snapshot build for Enterprise); ANALYST = can run scans, view data, no policy edit or override or snapshot build; VIEWER = read-only (no scans, no edits).
  - **Backfill:** Existing `member` can stay as-is or be mapped to ANALYST (decide product-wise). Existing `owner`/`admin` unchanged.
- **Reference:** All permission checks that use `is_org_owner_or_admin` must be extended to a new helper, e.g. `canEditPolicy(role)`, `canOverridePolicy(role)`, `canBuildSnapshot(role)`, `canViewOnly(role)`.

### 1.2 Cohort versioning and rule_hash audit

- **Current state:** `benchmark_cohorts` has `version`, `rule_hash`, `rule_json` (see [supabase/migrations/029_benchmark_layer.sql](supabase/migrations/029_benchmark_layer.sql)).
- **Enhancement:** No schema change required if version and rule_hash already exist. Add an **audit log of cohort edits** (optional new table).
  - **Table (optional):** `benchmark_cohort_audit` — columns: `id`, `cohort_id`, `changed_at`, `changed_by`, `previous_rule_json`, `new_rule_json`, `previous_rule_hash`, `new_rule_hash`. Append-only; RLS: org members can SELECT.
  - **Application:** On UPDATE to `benchmark_cohorts.rule_json` (or version bump), insert one row into `benchmark_cohort_audit`. Enables “audit log of cohort edits” in UI.

### 1.3 Snapshot build metadata

- **Current state:** `benchmark_cohort_snapshots` already has `as_of_timestamp`, `snapshot_hash`, `build_status`, `build_error`, etc. No schema change required.
- **Application:** Enterprise UI for “Snapshot build control” uses these columns; ensure API returns them (e.g. existing `GET /api/benchmarks/snapshots/[id]` and build endpoint).

---

## 2. API changes

### 2.1 Enterprise read-only API (v1)

- **Base path:** `/api/v1/`. All routes require **token-based auth** (e.g. Bearer token or API key stored per org or per user). No session cookie.
- **Versioning:** URL version `v1`; document that breaking changes will introduce v2.
- **Routes:**
  - **GET /api/v1/deals/:id/risk** — Returns risk summary for the deal: latest score, band, percentile (if benchmark in context), scan id, completed_at. Org must match token’s org. 404 if deal not found or not in org.
  - **GET /api/v1/deals/:id/benchmark** — Returns benchmark context for the deal: snapshot_id, cohort_key, method_version, percentile, risk_band, as_of_timestamp. Optional query: `snapshot_id` to get benchmark for a specific snapshot. 404 if no benchmark or deal not in org.
  - **GET /api/v1/portfolio/risk-summary** — Returns portfolio-level risk summary: total deals, scanned count, distribution by band, optional P90+ count, policy status summary (pass/warn/block), last updated. Org from token.
- **Auth:** Middleware or route-level check: resolve token to `organization_id` (and optionally `user_id`). Reject 401 if invalid or missing. All three endpoints are read-only (no mutation).
- **Files:** Create `app/api/v1/deals/[id]/risk/route.ts`, `app/api/v1/deals/[id]/benchmark/route.ts`, `app/api/v1/portfolio/risk-summary/route.ts`. Shared auth helper: e.g. `lib/apiAuth.ts` — `getOrgFromToken(request)`.

### 2.2 SLA and observability

- **Event logging:** Emit structured events for key actions: scan created, policy evaluated, override created, snapshot built, cohort updated, API token created/revoked. Log to stdout as JSON (e.g. `{ event, org_id, user_id, timestamp, ... }`) or to an event bus. No new table required if using external logger.
- **Error monitoring:** Ensure unhandled errors and API 5xx responses are reported to your error service (e.g. Sentry). Add or verify global error handler and API route error boundaries.
- **Usage tracking:** Count by org: API v1 calls per endpoint, scans per day, exports per day. Can be derived from existing tables (e.g. `workspace_usage`, `deal_scans`) or a lightweight `usage_events` table (org_id, event_type, created_at). Expose for SLA reporting or billing.
- **Performance metrics:** Log or export response times for heavy endpoints (e.g. portfolio summary, snapshot build, governance export). Optional: add middleware that records duration and status for `/api/*` and `/api/v1/*`.

### 2.3 Token-based API auth

- **Storage:** New table `api_tokens` (or `workspace_api_keys`): `id`, `organization_id`, `name`, `token_hash` (store hashed token only), `last_used_at`, `created_at`, `created_by`. Unique constraint on (organization_id, name) if you allow multiple tokens per org.
  - **Creation:** Enterprise only. Route `POST /api/settings/api-tokens` (or under org settings) creates a token; response returns the raw token once (then only hash is stored). Enforce ENTERPRISE plan.
  - **Validation:** On each v1 request, extract Bearer token, hash it, look up by token_hash; get organization_id; attach to request. Revocation = delete row or mark disabled.

---

## 3. UI changes

### 3.1 Cohort creation UI (Enterprise only)

- **Location:** New page or section under settings/workspace, e.g. `/app/settings/cohorts` or `/app/benchmarks/cohorts`.
- **Features:**
  - **DSL builder for rules:** UI to build `rule_json` (e.g. filters by market, asset type, min/max LTV, etc.) without raw JSON. Use existing `benchmark_cohorts.rule_json` and `lib/benchmark/cohortRule.ts` (e.g. `computeRuleHash`) for validation.
  - **Versioning:** Show `version` and `rule_hash` on each cohort. On edit, bump version and store previous rule in audit table if implemented.
  - **rule_hash visible:** Display current `rule_hash` on cohort detail so users can verify reproducibility.
  - **Audit log of cohort edits:** If `benchmark_cohort_audit` exists, show table of changes (who, when, previous/new rule_hash or summary).
- **Entitlement:** All cohort creation and edit gated on ENTERPRISE + permission (e.g. ADMIN or OWNER). Do not modify existing global/system snapshots; only workspace-scoped cohorts are editable by org.

### 3.2 Snapshot build control (Enterprise)

- **Location:** Same area as cohorts or under benchmarks, e.g. “Build snapshot” for a cohort.
- **Features:**
  - **Choose as_of_timestamp:** Date/time picker for `as_of_timestamp`.
  - **Build snapshot:** Call existing `POST /api/benchmarks/snapshots/build` (or equivalent) with cohort_id and as_of_timestamp. Show build status (SUCCESS, FAILED, PARTIAL) and build_error if any.
  - **Rebuild if needed:** Same endpoint; allow triggering another build (idempotent or new snapshot row).
  - **View snapshot hash:** On snapshot detail, show `snapshot_hash`, `method_version`, `n_eligible`, `as_of_timestamp`.
- **Entitlement:** Snapshot build only for ENTERPRISE and user role ADMIN or OWNER (permission matrix below).

### 3.3 Governance dashboard (Enterprise)

- **Location:** New page e.g. `/app/governance/dashboard` or under Portfolio as “Governance overview.”
- **Metrics (read-only):**
  - **Portfolio risk trend:** Over time (e.g. last 30/90 days): average risk score or distribution by band. Data from `risk_score_history` aggregated by org and time bucket.
  - **Policy violation history:** Count of violations per policy over time; list of recent violations with deal links.
  - **Override frequency:** Count of overrides per policy or per deal; table of recent overrides (from `policy_overrides` + `governance_decision_log`).
  - **Concentration shifts:** Change in P90+ concentration or top-market share over time (compare two snapshots or two time windows).
  - **Risk movement drivers:** Summary of what drove score changes (e.g. “3 deals moved to High due to LTV increase”) — derive from risk_score_history and deal attributes if available.
- **Data:** New API route e.g. `GET /api/governance/dashboard` that returns aggregated metrics; scope by org and optional date range. Gate on ENTERPRISE (and optionally ADMIN+).

---

## 4. Entitlement enforcement

### 4.1 Permission matrix

| Action | OWNER | ADMIN | ANALYST | VIEWER |
|--------|--------|--------|---------|--------|
| Policy edit (create/update/delete, enable/disable) | Yes | Yes | No | No |
| Snapshot build (Enterprise) | Yes | Yes | No | No |
| Override (policy override, method version override) | Yes | Yes | No | No |
| Cohort create/edit (Enterprise) | Yes | Yes | No | No |
| View only (portfolio, deals, exports, reports) | Yes | Yes | Yes | Yes |
| Run scans / create deals | Yes | Yes | Yes | No |
| API token create/revoke (Enterprise) | Yes | Yes | No | No |

- **Enforcement:** In each API route and UI path, resolve the current user’s role (from `organization_members.role` for the current org). Use helpers like `canEditPolicy(role)`, `canBuildSnapshot(plan, role)`, `canOverride(role)`, `canViewOnly(role)`, `canRunScans(role)`.
- **Cohort creation and snapshot build:** Allowed only when `plan === 'ENTERPRISE'` and role is OWNER or ADMIN.

### 4.2 API tokens and v1 API

- **Create/revoke tokens:** Only ENTERPRISE plan; only OWNER or ADMIN. Enforce in `POST /api/settings/api-tokens` and any delete/revoke route.
- **v1 API access:** Only ENTERPRISE orgs can use API tokens to call `/api/v1/*`. Reject 403 for FREE/PRO/PRO+ if token is somehow issued (or do not issue tokens for non-Enterprise).

---

## 5. QA tests

- **Role-based access:** As VIEWER, attempt policy edit, override, snapshot build, cohort edit — all return 403. As ANALYST, same for edit/override/build; scans and view allowed. As ADMIN, all allowed except ownership-only actions if any.
- **API tokens:** Create token as ENTERPRISE; call GET /api/v1/portfolio/risk-summary with Bearer token; expect 200 and body. Call with invalid token; expect 401. Call as PRO with token (if token creation blocked for PRO); expect 403 on token creation.
- **Cohort creation:** As ENTERPRISE ADMIN, create cohort with rule via UI; assert row in `benchmark_cohorts` and optional audit row. As PRO, cohort creation UI hidden or endpoint returns 403.
- **Snapshot build:** As ENTERPRISE ADMIN, trigger snapshot build; assert snapshot row created and build_status SUCCESS (or FAILED with build_error). As PRO+, build endpoint returns 403.
- **Governance dashboard:** As ENTERPRISE, open dashboard; metrics load without error; data consistent with risk_score_history and policy_overrides.

---

## 6. Acceptance criteria

- [ ] **Roles:** OWNER, ADMIN, ANALYST, VIEWER enforced; permission matrix implemented in API and UI (policy edit, snapshot build, override, cohort create, view, run scans).
- [ ] **Cohort creation (Enterprise):** DSL builder for rules; version and rule_hash visible; audit log of cohort edits (if table added) visible.
- [ ] **Snapshot build control (Enterprise):** Choose as_of_timestamp, build/rebuild snapshot, view snapshot hash and status.
- [ ] **Governance dashboard (Enterprise):** Portfolio risk trend, policy violation history, override frequency, concentration shifts, risk movement drivers.
- [ ] **API v1:** GET /api/v1/deals/:id/risk, GET /api/v1/deals/:id/benchmark, GET /api/v1/portfolio/risk-summary return correct data with token auth; only ENTERPRISE can create tokens and use v1.
- [ ] **SLA / observability:** Event logging (scan, policy, override, snapshot, cohort, API token events); error monitoring (5xx and unhandled errors to Sentry or equivalent); usage tracking (API v1 calls, scans, exports by org); performance metrics (response times for key routes). Document where events and metrics are sent.
