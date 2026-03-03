# Phase 2 — Governance Expansion

**Goal:** Differentiate PRO+ with snapshot version lock, multi-policy engine, policy overrides, risk trajectory visualization, advanced benchmark analytics, and governance export packet. Build on Phase 1 tables and entitlements.

**Prerequisites:** Phase 1 complete (PRO+ plan, `governance_decision_log`, `risk_score_history`, portfolio institutionalization, health endpoint).

---

## 1. Data model changes

### 1.1 `portfolio_views.locked_method_version`

- **Migration:** New migration (e.g. `038_portfolio_locked_method_version.sql`).
- **Change:** Add to table `portfolio_views`:
  - `locked_method_version` — TEXT, nullable. When set, the portfolio (or the view’s context) is considered locked to that methodology version; rescoring with a newer model is blocked unless the user overrides (and an audit log entry is written).
- **Index:** Optional; `(organization_id)` already exists. No unique constraint.
- **RLS:** No change; existing policies apply.

**Reference:** [supabase/migrations/023_portfolio_intelligence.sql](supabase/migrations/023_portfolio_intelligence.sql) for `portfolio_views` definition.

### 1.2 New table: `policy_overrides`

- **Migration:** Same or new migration (e.g. `039_policy_overrides.sql`).
- **Table:** `policy_overrides`
- **Columns:**
  - `id` — UUID, primary key, default `gen_random_uuid()`
  - `deal_id` — UUID, NOT NULL, references `deals(id)` ON DELETE CASCADE
  - `policy_id` — UUID, NOT NULL, references `risk_policies(id)` ON DELETE CASCADE
  - `snapshot_id` — UUID, nullable, references `benchmark_cohort_snapshots(id)` ON DELETE SET NULL
  - `reason` — TEXT, nullable
  - `user_id` — UUID, nullable, references `auth.users(id)` ON DELETE SET NULL
  - `created_at` — TIMESTAMPTZ, NOT NULL, default `now()`
- **Unique constraint:** One override per (deal_id, policy_id, snapshot_id) or per (deal_id, policy_id) if snapshot is optional — specify: e.g. `UNIQUE(deal_id, policy_id)` so one override per deal per policy (snapshot can be stored for context).
- **Indexes:** `(deal_id)`, `(policy_id)`, `(organization_id)` — add `organization_id` if you want to avoid joins; otherwise derive via deal or policy.
- **RLS:** Enable RLS. Org members can SELECT; only ADMIN or permitted role can INSERT (Phase 3 defines roles; for Phase 2, use existing “creator or org admin” pattern). No UPDATE/DELETE or allow only soft-delete by same role.

**Reference:** Phase 1 added `governance_decision_log`; when an override is created, insert a row there with `action_type = 'override'` and link to this row if desired.

---

## 2. API changes

### 2.1 Policy evaluate: multi-policy and summary

- **Files:** `app/api/risk-policies/[id]/evaluate/route.ts`, `lib/policy/engine.ts`.
- **Current behavior:** Single policy evaluation; returns evaluation result.
- **New behavior (PRO+ / multi-policy):**
  - When the org has multiple active policies (PRO+ or ENTERPRISE), support evaluating all active policies for the portfolio (e.g. endpoint that accepts optional `policy_id`; when omitted, evaluate all active policies).
  - Response shape extended with:
    - `policy_status_summary` — e.g. `{ overall: 'pass' | 'warn' | 'block', policyCount, violationCount }`
    - Per-policy breakdown: array of `{ policyId, policyName, status, violations }` so UI can show which policy failed and why.
  - Existing single-policy evaluate remains; add a separate route or query param for “evaluate all” (e.g. `POST /api/risk-policies/evaluate-all` or `POST /api/risk-policies/evaluate?all=true`).

### 2.2 Override endpoint

- **New route:** `POST /api/policy-overrides` (or `app/api/risk-policies/override/route.ts`).
- **Body:** `{ deal_id, policy_id, snapshot_id? (optional), reason? }`
- **Auth:** Require org member; require ADMIN or equivalent (Phase 2: use “org admin or owner” from existing helpers).
- **Logic:** Check entitlement: override allowed only for PRO+ or ENTERPRISE. Insert into `policy_overrides`. Insert into `governance_decision_log` with `action_type: 'override'`, same deal/policy/snapshot, note = reason, user_id. Return 201 with created override row.
- **Idempotency:** If unique constraint is (deal_id, policy_id), duplicate POST can return 200 with existing row or 409.

### 2.3 Snapshot version lock and rescore blocking

- **Context:** When a portfolio view has `locked_method_version` set, any rescore or “run new scan” that would use a newer methodology version must be blocked or require an explicit override.
- **Places to enforce:**
  - Scan creation / rescore: before calling `create_deal_scan_with_usage_check` (or equivalent), if the portfolio/view has a locked method version and the current app method version is newer, return 403 with `{ error: "Portfolio locked to an older methodology version", code: "METHOD_VERSION_LOCKED" }` unless the user has requested an override (then log to `governance_decision_log` with `action_type: 'override'` and allow).
  - Optional: add a “Override and rescore” flow that writes one log entry then proceeds.
- **API:** Document in portfolio or scan API: when `locked_method_version` is set and client requests a new scan, return structured error; client can then call override endpoint (or a combined “override and rescore” endpoint) with reason.

---

## 3. UI changes

### 3.1 Deal view: Risk trajectory

- **File:** `app/app/deals/[id]/page.tsx` and a new or existing client component for the deal detail.
- **Data:** Query `risk_score_history` for `deal_id`, ordered by `completed_at ASC` (and optionally filter by snapshot if you want same-snapshot trajectory). Use existing API or add `GET /api/deals/[id]/risk-trajectory` that returns `{ points: { completed_at, score, percentile, risk_band, snapshot_id }[] }`.
- **UI:**
  - **Score over time:** Chart (e.g. line or area) with `completed_at` on X and `score` on Y.
  - **Percentile over time:** Same X; Y = percentile (when present).
  - **Delta magnitude:** Show change between first and last point, or between last two (e.g. “Score +12” or “Percentile −5”).
  - **Version change markers:** When `snapshot_id` or method version changes between consecutive points, show a small marker or label on the chart (e.g. “Method v2”).
- **Entitlement:** Show trajectory only for PRO+ and ENTERPRISE (gate by workspace plan or feature flag).

### 3.2 Portfolio: Advanced benchmark analytics

- **File:** `app/app/portfolio/PortfolioClient.tsx` and `lib/portfolioSummary.ts` if new aggregates are needed.
- **Add (no new math; use existing aggregates or simple queries):**
  - **P90+ concentration:** Percent of portfolio in P90 or above (e.g. count of deals with percentile >= 90 / total). Use existing benchmark data in summary or deal_benchmarks.
  - **Band distribution change:** If you have prior snapshot or prior scan data, show “vs. previous” band distribution (e.g. “High: +2 deals”). Otherwise show current distribution only.
  - **Market exposure overlay:** Already available as exposure by market/asset in summary; ensure it’s visible and labeled as “Market exposure” or similar.
- **Data:** All from existing `getPortfolioSummary` and benchmark APIs; no new backend tables required.

### 3.3 PRO+ governance export packet

- **Scope:** When user exports “governance packet” or “audit export” (PRO+ only), the export (ZIP or PDF bundle) must include:
  - Risk index (scores) and percentile
  - Snapshot metadata (snapshot_id, cohort_key, method_version, as_of_timestamp)
  - Policy results (per-policy status and violations)
  - Overrides (rows from `policy_overrides` for the org or deal, with reason and user/time)
  - Risk trajectory (for deals: history from `risk_score_history`)
  - Audit trail (rows from `governance_decision_log` for the org/time range)
- **Implementation:** New route e.g. `GET /api/portfolio/governance-export` or `POST /api/exports/governance-packet` that:
  - Checks PRO+ or ENTERPRISE.
  - Gathers data from portfolio summary, risk_score_history, policy_overrides, governance_decision_log, and snapshot metadata.
  - Returns ZIP with JSON/CSV/PDF files or a single PDF report. Structure the payload so it’s clearly “institutional artifact” (titles, timestamps, version stamps).

---

## 4. Entitlement enforcement

### 4.1 Multi-policy (PRO+ = 3, Enterprise = unlimited)

- **Files:** `app/api/risk-policies/route.ts` (POST), `app/api/risk-policies/[id]/route.ts` (PATCH to enable).
- **Logic:** Before allowing a new policy or enabling a policy, count active (enabled) policies for the org. If plan is PRO and count >= 1, return 403 `POLICY_LIMIT_REACHED`. If plan is PRO+ and count >= 3, return 403. ENTERPRISE: no cap. Use `getWorkspacePlanAndEntitlements` and `entitlements.maxActivePoliciesPerOrg`.

### 4.2 Snapshot version lock and override

- **Who can set lock:** PRO+ and ENTERPRISE only. When saving a portfolio view with `locked_method_version`, check plan; otherwise ignore or return 403.
- **Who can override:** PRO+ and ENTERPRISE; within org, only ADMIN or OWNER (use existing `is_org_owner_or_admin` or future role check). Override endpoint and “Override and rescore” must check both plan and role.

### 4.3 Governance export packet

- **Route:** Governance export packet endpoint must require PRO+ or ENTERPRISE. Return 403 with `PLAN_LIMIT_REACHED` or `FEATURE_NOT_AVAILABLE` for FREE/PRO.

---

## 5. QA tests

- **Multi-policy evaluation:** With 2–3 active policies, call evaluate-all (or equivalent); response includes `policy_status_summary` and per-policy breakdown; status is consistent with individual evaluations.
- **Override:** Create override via API; assert row in `policy_overrides` and corresponding row in `governance_decision_log` with `action_type: 'override'`. Score for the deal does not change (override only affects governance state).
- **Rescore blocked when locked:** With a portfolio view with `locked_method_version` set to an older version, attempt rescore; expect 403 `METHOD_VERSION_LOCKED` unless override is sent.
- **Trajectory chart:** With at least 2 rows in `risk_score_history` for a deal, trajectory endpoint returns points; UI chart renders without error.
- **Governance export packet:** As PRO+, request governance export; ZIP/report contains risk index, snapshot metadata, policy results, overrides, risk trajectory, and audit trail entries.

---

## 6. Acceptance criteria

- [ ] **Snapshot version lock:** PRO+ can set `locked_method_version` on a portfolio view; rescore is blocked when method version is newer unless user overrides (audit log written).
- [ ] **Multi-policy:** PRO+ can have up to 3 active policies; evaluate-all returns `policy_status_summary` and per-policy violation breakdown.
- [ ] **Policy overrides:** Override endpoint creates `policy_overrides` and `governance_decision_log` entry; score unchanged; only governance state updated.
- [ ] **Deal trajectory:** Deal detail shows “Score over time” and “Percentile over time” charts, delta magnitude, and version change markers (PRO+ only).
- [ ] **Portfolio analytics:** Portfolio shows P90+ concentration, band distribution (and change if data available), and market exposure overlay.
- [ ] **Governance export:** PRO+ can download governance export packet containing risk index, percentile, snapshot metadata, policy results, overrides, risk trajectory, and audit trail.
- [ ] **Tables/columns:** `portfolio_views.locked_method_version` and `policy_overrides` exist; RLS and indexes in place.
