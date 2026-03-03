# Phase 2 — Governance Expansion (Implementation Summary)

This document records what was implemented for Phase 2 of the institutional roadmap, per `docs/roadmap_phase2.md` and `docs/INSTITUTIONAL_EXECUTION_PLAN.md`.

**Goal:** Differentiate PRO+ with snapshot version lock, multi-policy engine, policy overrides, risk trajectory visualization, advanced benchmark analytics, and governance export packet.

**Prerequisites:** Phase 1 complete (PRO+ plan, `governance_decision_log`, `risk_score_history`, portfolio institutionalization, health endpoint).

---

## 1. Data model (migrations)

| Migration | Purpose |
|-----------|---------|
| **039_policy_overrides.sql** | Table `policy_overrides`: `id`, `deal_id`, `policy_id`, `snapshot_id` (nullable), `reason`, `user_id`, `created_at`. `UNIQUE(deal_id, policy_id)`. Indexes: `(deal_id)`, `(policy_id)`. RLS: org members **SELECT**; **INSERT** only for org OWNER/ADMIN (via deal → org). No direct client INSERT to `governance_decision_log`; server writes to it when creating an override. |
| **040_portfolio_locked_method_version.sql** | Adds `portfolio_views.locked_method_version` (TEXT, nullable). When set, the portfolio view is locked to that methodology version; rescoring with a newer model is blocked unless the user overrides (audit log entry written). PRO+ and ENTERPRISE only. |

---

## 2. Entitlements

**File:** `lib/entitlements/workspace.ts`

- **WorkspaceEntitlements** extended with:
  - `canUseTrajectory: boolean` — Score-over-time trajectory and advanced governance (PRO+ and ENTERPRISE).
  - `canUseGovernanceExport: boolean` — Governance export packet (PRO+ and ENTERPRISE).
  - `canLockMethodVersion: boolean` — Snapshot version lock on portfolio view (PRO+ and ENTERPRISE).
- FREE and PRO: all three `false`; PRO+ and ENTERPRISE: all three `true`.

**File:** `lib/entitlements/errors.ts`

- Added `METHOD_VERSION_LOCKED` for rescore blocked when portfolio is locked to an older method version.

**Policy limit messaging**

- **Files:** `app/api/risk-policies/route.ts`, `app/api/risk-policies/[id]/route.ts`
- 403 `POLICY_LIMIT_REACHED` message now reflects plan: e.g. "Active policy limit reached (1 per org on this plan)" with `required_plan: "PRO+"` when at PRO limit, or "(3 per org...)" with `required_plan: "ENTERPRISE"` when at PRO+ limit.

---

## 3. API changes

### 3.1 Policy overrides

**File:** `app/api/policy-overrides/route.ts`

- **POST /api/policy-overrides**
  - Body: `{ deal_id, policy_id, snapshot_id?, reason? }`.
  - Auth: session; user must be org OWNER or ADMIN (via `organization_members.role`).
  - Entitlement: PRO+ or ENTERPRISE (`canUseTrajectory` used as proxy for override capability).
  - Logic: Validates deal and policy belong to org; inserts into `policy_overrides` (user client, RLS); then **service role** inserts into `governance_decision_log` with `action_type: 'override'`, `note`, `user_id`. Idempotent: if override already exists for (deal_id, policy_id), returns 200 with existing row.

### 3.2 Evaluate all policies (multi-policy)

**File:** `app/api/risk-policies/evaluate-all/route.ts`

- **POST /api/risk-policies/evaluate-all**
  - No body; uses current org and portfolio.
  - Evaluates all active (enabled) policies for the org’s portfolio.
  - Returns: `policy_status_summary: { overall: 'pass' | 'warn' | 'block', policyCount, violationCount }`, `results: PolicyEvaluationResult[]`, `breakdown: PolicyBreakdownItem[]` (per-policy status and violations).
  - Gated: requires `canUsePolicy`; PRO+ limited to current active policy count (max 3); ENTERPRISE unlimited.

**File:** `lib/policy/engine.ts`

- **evaluateAllPolicies({ policies, portfolio, nowIso }):** New function; runs `evaluateRiskPolicy` for each policy and aggregates into `EvaluateAllResult` with `policy_status_summary` and `breakdown`.

**File:** `lib/policy/types.ts`

- New types: `PolicyStatusSummary`, `PolicyBreakdownItem`, `EvaluateAllResult`.

### 3.3 Risk trajectory

**File:** `app/api/deals/[id]/risk-trajectory/route.ts`

- **GET /api/deals/[id]/risk-trajectory**
  - Returns `{ points: RiskTrajectoryPoint[] }` from `risk_score_history` for the deal, ordered by `completed_at` ascending.
  - Each point: `completed_at`, `score`, `percentile` (nullable), `risk_band`, `snapshot_id`.
  - Gated: PRO+ and ENTERPRISE only (`canUseTrajectory`).

### 3.4 Snapshot version lock and rescore blocking

**File:** `app/api/deals/scan/route.ts`

- Before creating a new scan, if the org has any `portfolio_views` with `locked_method_version` set and it differs from current `RISK_INDEX_VERSION`:
  - Returns **403** with `{ error: "Portfolio locked to an older methodology version...", code: "METHOD_VERSION_LOCKED" }` unless the request includes `override_method_lock: true` (and optional `override_reason`).
  - When `override_method_lock: true`, inserts a row into `governance_decision_log` (service role) with `action_type: 'override'`, then allows the scan to proceed.
- Only enforced when `entitlements.canLockMethodVersion` (PRO+ / ENTERPRISE).

### 3.5 Governance export

**File:** `app/api/portfolio/governance-export/route.ts`

- **GET /api/portfolio/governance-export**
  - Returns a JSON governance packet: `exported_at`, `organization_id`, `risk_index` (deal-level score/band/scanned_at), `portfolio_counts`, `distribution_by_band`, `snapshot_metadata`, `benchmark_percentile`, `policy_results` (from evaluate-all), `overrides` (from `policy_overrides` for org deals), `audit_trail` (recent `governance_decision_log` rows).
  - Response header: `Content-Disposition: attachment; filename="governance-export-...json"`.
  - Gated: PRO+ and ENTERPRISE only (`canUseGovernanceExport`).

### 3.6 Portfolio view lock (PATCH)

**File:** `app/api/portfolio-views/[id]/route.ts`

- **PATCH** body may include `locked_method_version: string | null`.
  - Allowed only when `entitlements.canLockMethodVersion` (PRO+ / ENTERPRISE); otherwise 403.
  - Select now includes `locked_method_version` in response.

**File:** `app/api/portfolio-views/route.ts`

- **GET** list of portfolio views now selects `locked_method_version` so UI can show and edit it.

---

## 4. UI changes

### 4.1 Deal page: Risk trajectory (PRO+ / ENTERPRISE only)

**File:** `app/app/deals/[id]/page.tsx`

- Fetches workspace entitlements via `getWorkspacePlanAndEntitlementsForUser` (in addition to profile entitlements).
- **Risk trajectory** section (chart with `RiskTrajectoryChart` and `last5Scans`) is rendered only when `canUseTrajectory` is true (PRO+ and ENTERPRISE). FREE/PRO do not see the section.

### 4.2 Portfolio: Governance export and advanced analytics

**File:** `app/app/portfolio/page.tsx`

- Loads workspace entitlements and passes `governanceExportEnabled` and `advancedAnalyticsEnabled` (from `canUseGovernanceExport` and `canUseTrajectory`) to `PortfolioClient`.

**File:** `app/app/portfolio/PortfolioClient.tsx`

- **Governance export:** When `governanceExportEnabled`, adds an "Export governance packet" button in the Governance card. On click, fetches `GET /api/portfolio/governance-export` (with `fetchJsonWithTimeout`, 15s), then triggers download of the JSON file.
- **Advanced analytics:** When `advancedAnalyticsEnabled`, adds an "Advanced analytics" card showing P90+ (High) concentration (from `model_health.pct_high` or `distributionByBand`) and band distribution (Low, Moderate, Elevated, High counts).
- New props: `governanceExportEnabled`, `advancedAnalyticsEnabled`.

---

## 5. Acceptance criteria (from roadmap)

| Criterion | Status |
|-----------|--------|
| Snapshot version lock: PRO+ can set `locked_method_version` on a portfolio view; rescore blocked when method version is newer unless user overrides (audit log written). | Done (PATCH portfolio-views + scan route 403 + override flow) |
| Multi-policy: PRO+ can have up to 3 active policies; evaluate-all returns `policy_status_summary` and per-policy violation breakdown. | Done (evaluate-all route + policy cap in POST/PATCH risk-policies) |
| Policy overrides: Override endpoint creates `policy_overrides` and `governance_decision_log` entry; score unchanged; only governance state updated. | Done (POST /api/policy-overrides) |
| Deal trajectory: Deal detail shows "Score over time" (and optional "Percentile over time"); PRO+ only. | Done (section gated by canUseTrajectory; GET risk-trajectory returns percentile when present) |
| Portfolio analytics: P90+ concentration, band distribution (and change if data available), market exposure. | Done (Advanced analytics card; market exposure already in summary) |
| Governance export: PRO+ can download governance export packet (risk index, percentile, snapshot metadata, policy results, overrides, audit trail). | Done (GET governance-export + Export button) |
| Tables/columns: `portfolio_views.locked_method_version` and `policy_overrides` exist; RLS and indexes in place. | Done (migrations 039, 040) |

---

## 6. Files created or modified (reference)

### Created

- `supabase/migrations/039_policy_overrides.sql`
- `supabase/migrations/040_portfolio_locked_method_version.sql`
- `app/api/policy-overrides/route.ts`
- `app/api/risk-policies/evaluate-all/route.ts`
- `app/api/deals/[id]/risk-trajectory/route.ts`
- `app/api/portfolio/governance-export/route.ts`
- `docs/PHASE2_IMPLEMENTATION.md` (this file)

### Modified

- `lib/entitlements/workspace.ts` — `canUseTrajectory`, `canUseGovernanceExport`, `canLockMethodVersion` on WorkspaceEntitlements.
- `lib/entitlements/errors.ts` — `METHOD_VERSION_LOCKED`.
- `lib/policy/engine.ts` — `evaluateAllPolicies`, `overallFromResults`; exports `EvaluateAllResult`.
- `lib/policy/types.ts` — `PolicyStatusSummary`, `PolicyBreakdownItem`, `EvaluateAllResult`.
- `app/api/risk-policies/route.ts` — POLICY_LIMIT_REACHED message and required_plan by plan.
- `app/api/risk-policies/[id]/route.ts` — Same policy limit message update.
- `app/api/deals/scan/route.ts` — Lock check (portfolio_views.locked_method_version), override_method_lock/override_reason body, governance_decision_log insert on override.
- `app/api/portfolio-views/route.ts` — GET select includes `locked_method_version`.
- `app/api/portfolio-views/[id]/route.ts` — PATCH accepts `locked_method_version`; entitlement check; select includes `locked_method_version`.
- `app/app/deals/[id]/page.tsx` — Workspace entitlements fetch; trajectory section gated by `canUseTrajectory`.
- `app/app/portfolio/page.tsx` — Workspace entitlements; pass `governanceExportEnabled`, `advancedAnalyticsEnabled` to PortfolioClient.
- `app/app/portfolio/PortfolioClient.tsx` — Props `governanceExportEnabled`, `advancedAnalyticsEnabled`; "Export governance packet" button; "Advanced analytics" card.

---

## 7. Deploy notes

1. Run migrations in order: **039**, **040** (after 036, 037, 038 from Phase 1).
2. No new environment variables required for Phase 2.
3. Existing PRO+ and ENTERPRISE orgs get trajectory, governance export, and version lock automatically via `getWorkspacePlanAndEntitlements` and `organizations.plan`.
4. To use snapshot version lock: set `locked_method_version` on a portfolio view via PATCH (e.g. to current `RISK_INDEX_VERSION`). Rescores will then be blocked once the app version moves to a newer method version unless clients send `override_method_lock: true` (and optionally `override_reason`).
