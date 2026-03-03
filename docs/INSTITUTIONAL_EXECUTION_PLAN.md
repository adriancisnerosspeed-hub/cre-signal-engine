# CRE Signal Engine — Institutional Execution Plan (Unified)

**Target:** Deterministic CRE Risk Governance Layer. Option B pricing locked. No timeline staging — assume full build now.

**Out of scope:** Core scoring math, benchmark percentile logic, cohort/snapshot build algorithms. Do not modify deterministic scoring or benchmark layers.

---

## Mandatory Architectural Corrections

These fixes are non-negotiable and must be applied as specified.

| # | Correction | Rule |
|---|------------|------|
| 1 | **governance_decision_log** | Append-only. No direct client INSERT. Only service role writes via controlled server endpoints. RLS: org members SELECT only. |
| 2 | **risk_score_history** | Insert atomically within scan-creation transaction. If history insert fails, scan must still succeed (best-effort history; e.g. insert in same RPC after scan, catch and log history failure). Prefer insertion inside same RPC as scan creation. |
| 3 | **Snapshot version lock** | Enterprise-only. Do not block rescoring by default. Enforce lock only when explicitly enabled on a portfolio. No global method-freeze logic. |
| 4 | **Governance export** | Basic first: score + percentile + snapshot metadata + policy results. Advanced (trajectory + audit log) optional and modular. No massive ZIP complexity initially. |
| 5 | **Risk trajectory** | Score-only chart required. Percentile optional. Null-safe. No complex drift math. |
| 6 | **Roles** | Start with OWNER, ADMIN, MEMBER only. Defer ANALYST/VIEWER. |
| 7 | **API v1** | Only: `GET /api/v1/deals/:id/risk`, `GET /api/v1/portfolio/risk-summary`. Token-based auth only. No broader API surface. |
| 8 | **Governance dashboard** | Minimal: portfolio risk trend (avg score), policy violation count, override count. No heavy visualization. |
| 9 | **Health endpoint** | Public: `{ ok: true }`. Authenticated: system details. Do not leak plan or internal metadata publicly. |
| 10 | **Fetch timeout** | All UI fetches use global 15s abort. No infinite loading state anywhere. |

---

## Pricing (Option B) — Locked

| Plan | Price | Scans | Benchmark | Policies | Members | Export | Cohort | Snapshot build | Trajectory | Audit export |
|------|--------|-------|-----------|----------|---------|--------|--------|----------------|------------|--------------|
| FREE | — | 3 lifetime | No | 0 | 1 (creator) | No | No | No | No | No |
| PRO | $299/ws | Unlimited | Consumption only | 1 | 5 | Yes | No | No | No | No |
| PRO+ | $499/ws | Unlimited | Consumption only | 3 | 10 | Yes | No | No | Yes | Optional |
| ENTERPRISE | Custom | Unlimited | Full | Unlimited | Unlimited | Yes | Yes | Yes | Yes | Yes |

---

## Section A — Core Institutional Lock

**Purpose:** Pricing enforcement, member caps, governance rename, portfolio metadata, health, timeout, structured errors, audit table and override support, risk_score_history, basic export.

### A.1 Data model (migrations in order)

1. **035_governance_decision_log.sql**
   - Table `governance_decision_log`: id, organization_id, deal_id (nullable), snapshot_id (nullable), policy_id (nullable), action_type ('approve'|'override'|'escalate'), note, user_id, created_at.
   - Indexes: (organization_id, created_at DESC), (deal_id), (policy_id).
   - RLS: ON. **SELECT only** for org members (using is_org_member). **No INSERT/UPDATE/DELETE for authenticated role.** Writes only via service role in server-side code (e.g. override endpoint uses service client to insert after validation).

2. **036_risk_score_history.sql**
   - Table `risk_score_history`: id, deal_id, scan_id, score (INT NOT NULL), percentile (nullable), risk_band (nullable), snapshot_id (nullable), completed_at (NOT NULL).
   - Index: (deal_id, completed_at DESC).
   - RLS: org members SELECT; INSERT only via service role (called from scan-creation path). No client INSERT.

3. **037_workspace_plan_proplus_and_members.sql**
   - Add PRO+ to `organizations.plan` check: `plan IN ('FREE','PRO','PRO+','ENTERPRISE')`.
   - Add `api_tokens` table for Enterprise (Phase C): id, organization_id, name, token_hash, last_used_at, created_at, created_by. (Or defer to Section C migration.)

**risk_score_history write path:** Inside the same RPC that creates the scan (e.g. `create_deal_scan_with_usage_check` or a wrapper), after the scan and risks are inserted successfully, insert one row into `risk_score_history`. Use a PL/pgSQL sub-block with `EXCEPTION WHEN OTHERS THEN` that does not re-raise (e.g. log to a table or skip), so that if the history insert fails (constraint, RLS, etc.), the transaction still commits and the scan is not rolled back. Pass score from the newly inserted scan/risks; percentile/risk_band/snapshot_id optional. No client INSERT to risk_score_history.

### A.2 API (order)

1. **GET /api/health** (or `/api/health/route.ts`)
   - Unauthenticated: return `{ ok: true }` only. No plan, no migration version, no DB details.
   - Authenticated (session): return `{ ok, database_ok?, stripe_configured?, workspace_plan? }` for operational checks. Do not expose plan to unauthenticated requests.

2. **Structured errors**
   - All API error responses: JSON `{ error: string, code?: string }`. Audit routes under `app/api/` and normalize 4xx/5xx to this shape. Use `lib/entitlements/errors.ts` codes.

3. **Override endpoint (service writes to governance_decision_log)**
   - **POST /api/policy-overrides** (or under risk-policies). Body: deal_id, policy_id, snapshot_id?, reason?.
   - Auth: session, org member, ADMIN or OWNER (use existing is_org_owner_or_admin). Entitlement: PRO+ or ENTERPRISE.
   - Server: validate; insert into `policy_overrides` (table in Section B). Then **using service role client**, insert into `governance_decision_log` (organization_id, deal_id, policy_id, snapshot_id, action_type='override', note=reason, user_id, created_at). Return 201 with override row. No client ever inserts into governance_decision_log.

### A.3 Entitlements

- **lib/entitlements/workspace.ts:** Add `WorkspacePlan = 'PRO+'`. Add `maxMembers: number | null` to WorkspaceEntitlements. FREE: 1. PRO: 5. PRO+: 10. ENTERPRISE: null.
- **getWorkspaceEntitlements:** PRO+ same as PRO but maxActivePoliciesPerOrg: 3, maxMembers: 10, canUsePolicy true, and any PRO+ flags (trajectory, audit export optional). PRO: maxActivePoliciesPerOrg: 1, maxMembers: 5.
- **Member cap:** In `app/api/org/invite/route.ts` and `app/api/invite/accept/route.ts`: before adding member, count organization_members for org; if count >= maxMembers, return 403 `MEMBER_LIMIT_REACHED`.
- **Stripe:** Add STRIPE_PRICE_ID_PRO_PLUS; in webhook, map that price to plan 'PRO+'.

### A.4 UI

- **Rename:** "Risk Policy" → "Governance", "Digest" → "Risk Brief" everywhere user-facing. Leave DB/code names (risk_policies, digest_preview) as-is.
- **Portfolio page:** Show Snapshot ID, Cohort key, Method version, delta-comparable indicator, policy violation summary when data exists. Data from existing getPortfolioSummary/benchmark; extend response if needed.
- **Global 15s fetch:** All UI data fetches use `lib/fetchJsonWithTimeout` (15s). No raw fetch without timeout. Replace or wrap any fetch in PortfolioClient, deal pages, settings, digest preview, analyze.

### A.5 Governance export (basic)

- **Scope:** Score, percentile, snapshot metadata (snapshot_id, cohort_key, method_version, as_of), policy results (per-policy status + violations). Single JSON or PDF report acceptable. No ZIP with many files required initially.
- **Route:** e.g. GET or POST `/api/portfolio/export-governance` or extend existing export. Gate on PRO+ or ENTERPRISE. Return one structured payload (JSON or PDF). Advanced (trajectory + full audit log) can be added later as optional module.

---

## Section B — PRO+ Differentiation Layer

**Purpose:** Multi-policy evaluate-all, score trajectory, P90+/band aggregates, override table and logging, optional governance export upgrade.

### B.1 Data model

4. **038_policy_overrides.sql**
   - Table `policy_overrides`: id, deal_id, policy_id, snapshot_id (nullable), reason, user_id, created_at. Unique (deal_id, policy_id). RLS: org members SELECT; INSERT/UPDATE only by org admin/owner (or service role from override endpoint). No DELETE or allow only by same role.

5. **039_portfolio_locked_method_version.sql** (Enterprise only behavior; no schema change to block rescoring globally)
   - Add `portfolio_views.locked_method_version` TEXT nullable. Only when this is set on a view and user explicitly opts into “locked” behavior, rescoring can be blocked for that context (Enterprise only). No migration logic that blocks rescoring by default.

### B.2 API

- **POST /api/risk-policies/evaluate-all** (or query param on existing evaluate): Evaluate all active policies for the org’s portfolio. Return policy_status_summary + per-policy breakdown. Gate on PRO+ or ENTERPRISE (max 3 for PRO+).
- **GET /api/deals/[id]/risk-trajectory:** Return points from risk_score_history for deal_id: { completed_at, score, percentile? }. Null-safe; percentile optional. For PRO+ / ENTERPRISE only.

### B.3 UI

- **Deal risk trajectory:** Score-over-time chart only (required). Percentile over time optional. Null-safe; no complex drift math.
- **Portfolio:** P90+ concentration, band distribution (and change if data available). Use existing summary/benchmark data.

### B.4 Override logging

- Override endpoint (Section A) already writes to governance_decision_log via service role. Ensure policy_overrides insert and governance_decision_log insert are both done in override handler; no client INSERT to governance_decision_log.

---

## Section C — Enterprise Layer

**Purpose:** Cohort creation UI, snapshot build control, minimal API v1, token auth, OWNER/ADMIN/MEMBER only, minimal governance dashboard, event logging and usage tracking.

### C.1 Data model

6. **040_api_tokens.sql** (if not in 037)
   - Table `api_tokens`: id, organization_id, name, token_hash UNIQUE, last_used_at, created_at, created_by. RLS: org members SELECT; only OWNER/ADMIN can INSERT/DELETE (revoke). No UPDATE except last_used_at.

**Roles:** Keep existing organization_members.role: 'owner', 'admin', 'member' only. Do not add analyst/viewer in this plan.

### C.2 API v1 (minimal)

- **GET /api/v1/deals/:id/risk** — Token-only auth. Returns deal risk summary (latest score, band, percentile if available, scan_id, completed_at). Org from token.
- **GET /api/v1/portfolio/risk-summary** — Token-only auth. Returns portfolio risk summary (total deals, scanned count, distribution by band, policy status summary). Org from token.

No GET /api/v1/deals/:id/benchmark in initial scope. Token resolution: Bearer token → hash → api_tokens → organization_id. 401 if invalid. Enterprise only for token creation.

### C.3 Token-based auth

- **POST /api/settings/api-tokens** (or under org): Create token (Enterprise only, OWNER/ADMIN). Store only token_hash. Return raw token once in response. Revoke = DELETE row.
- **lib/apiAuth.ts** (or equivalent): getOrgFromToken(request) for v1 routes; use service role to look up by token_hash.

### C.4 UI (Enterprise only)

- **Cohort creation:** UI to build rule_json (DSL or form). Create/edit workspace-scoped cohorts. Show version and rule_hash. Gate on ENTERPRISE.
- **Snapshot build control:** Choose as_of_timestamp; trigger build; show snapshot_hash, build_status. Gate on ENTERPRISE.
- **Governance dashboard (minimal):** Portfolio risk trend (e.g. avg score over time from risk_score_history or summary). Policy violation count. Override count. No heavy charts. Gate on ENTERPRISE (or PRO+ for read-only view if desired).

### C.5 Snapshot version lock (Enterprise only)

- When portfolio_views.locked_method_version is set (Enterprise only), and user attempts rescore with a newer method version, return 403 METHOD_VERSION_LOCKED unless override flow is used. Override writes to governance_decision_log via service role then allows rescore. Do not block rescoring by default anywhere.

### C.6 Observability

- **Event logging:** Structured JSON log for scan created, policy evaluated, override created, snapshot built, cohort updated, API token created/revoked. Stdout or existing logger.
- **Usage tracking:** Count scans, exports, API v1 calls by org (from existing tables or lightweight usage_events). No heavy new schema required.

---

## Ordered Implementation Checklist

Execute in this order. Dependencies are implied by section order and migration numbers.

1. Migration 035: governance_decision_log (RLS SELECT only; no client INSERT).
2. Migration 036: risk_score_history; wire write into scan-creation RPC (EXCEPTION handler so scan never fails if history fails).
3. Migration 037: plan PRO+ and member caps (organizations.plan check, entitlements in code).
4. Migration 038: policy_overrides table (before override endpoint).
5. Entitlements: PRO+, maxMembers, getWorkspaceEntitlements and plan resolution (including Stripe webhook for PRO+).
6. Member cap enforcement: invite and accept routes.
7. Health endpoint: public { ok: true }; authenticated detailed (no plan leak publicly).
8. Structured error responses across API.
9. Override endpoint: POST policy-overrides, insert policy_overrides + (service role) governance_decision_log.
10. Migration 039: portfolio_views.locked_method_version (nullable).
11. UI: renames (Governance, Risk Brief); portfolio Snapshot ID, cohort key, method version, policy summary; global 15s fetch.
12. Basic governance export (score, percentile, snapshot metadata, policy results).
13. Evaluate-all and multi-policy response shape (PRO+ max 3).
14. Risk trajectory: GET deal risk-trajectory; UI score-over-time chart (null-safe, percentile optional).
15. Portfolio P90+ and band aggregates (from existing data).
16. Migration 040: api_tokens.
17. Token auth helper; POST create token (Enterprise); GET /api/v1/deals/:id/risk and GET /api/v1/portfolio/risk-summary with token auth only.
18. Enterprise: cohort creation UI, snapshot build control UI.
19. Minimal governance dashboard: risk trend (avg score), violation count, override count.
20. Snapshot version lock check (Enterprise only, only when locked_method_version set on view).
21. Event logging and usage tracking (lightweight).

---

## Dependency Mapping

- A.2 Override endpoint depends on 035 (governance_decision_log) and 038 (policy_overrides). So 038 can be in Section B but override endpoint in A writes to both; implement 038 before or with override endpoint.
- risk_score_history (036) and scan RPC: 036 first, then extend RPC.
- PRO+ and member caps: migration 037 and entitlements code before invite/accept enforcement.
- API v1 and dashboard: after api_tokens (040) and token auth.
- Trajectory UI: after risk_score_history populated (and GET risk-trajectory endpoint).

---

## Required Migrations (Order)

| Order | Migration | Content |
|-------|-----------|---------|
| 1 | 035_governance_decision_log.sql | Table; RLS SELECT only for org members; no INSERT for authenticated |
| 2 | 036_risk_score_history.sql | Table; RLS SELECT for org; INSERT via service only |
| 3 | 037_workspace_plan_proplus.sql | organizations.plan check PRO+; optional api_tokens here or in 040 |
| 4 | 038_policy_overrides.sql | Table; RLS per org; unique (deal_id, policy_id) |
| 5 | 039_portfolio_locked_method_version.sql | portfolio_views.locked_method_version TEXT nullable |
| 6 | 040_api_tokens.sql | Table for Enterprise token auth |

---

## Required API Route Additions (Order)

1. GET /api/health — public { ok }; authenticated details.
2. POST /api/policy-overrides — create override; service writes to governance_decision_log.
3. POST /api/risk-policies/evaluate-all (or equivalent) — multi-policy summary.
4. GET /api/deals/[id]/risk-trajectory — score (and optional percentile) over time.
5. GET or POST /api/portfolio/export-governance — basic export payload.
6. POST /api/settings/api-tokens — create token (Enterprise).
7. GET /api/v1/deals/[id]/risk — token auth.
8. GET /api/v1/portfolio/risk-summary — token auth.

---

## Required Entitlement Checks

- FREE: 3 scans (existing RPC), no benchmark/policy/export/members beyond creator; maxMembers 1.
- PRO: Unlimited scans; 1 policy; 5 members; export; no cohort/snapshot build; maxActivePoliciesPerOrg 1.
- PRO+: 3 policies; 10 members; trajectory; optional audit export; maxActivePoliciesPerOrg 3.
- ENTERPRISE: Unlimited; cohort; snapshot build; API tokens; version lock; full export.
- Invite/accept: enforce maxMembers.
- Policy create/enable: enforce maxActivePoliciesPerOrg.
- Override: PRO+ or ENTERPRISE.
- Governance export: PRO+ or ENTERPRISE (basic); advanced optional.
- Trajectory: PRO+ or ENTERPRISE.
- Cohort/snapshot build: ENTERPRISE only.
- API v1 and token creation: ENTERPRISE only.
- Version lock: ENTERPRISE only; only when locked_method_version set on view.

---

## Required UI Updates

- Rename Risk Policy → Governance, Digest → Risk Brief.
- Portfolio: Snapshot ID, cohort key, method version, delta indicator, policy violation summary.
- All fetches: 15s timeout (fetchJsonWithTimeout or equivalent).
- Deal: Score-over-time trajectory chart (percentile optional); null-safe.
- Portfolio: P90+ concentration, band distribution (optional change).
- Enterprise: Cohort creation UI, snapshot build UI, minimal governance dashboard (trend, violation count, override count).
- No ANALYST/VIEWER role UI; only OWNER, ADMIN, MEMBER.

---

## Security Checklist

- [ ] governance_decision_log: no INSERT policy for authenticated; only service role in server code.
- [ ] risk_score_history: no client INSERT; only from scan-creation path (RPC or server).
- [ ] Health: unauthenticated response does not include plan, migration version, or internal metadata.
- [ ] API v1: only Bearer token; no session cookie. Validate token_hash; rate-limit if needed.
- [ ] Override: only OWNER/ADMIN; PRO+ or ENTERPRISE.
- [ ] Token create/revoke: ENTERPRISE only; OWNER/ADMIN only.
- [ ] Member cap: enforced on invite and accept; no bypass.

---

## Do Not Build Yet / Out of Scope

- Do not add ANALYST or VIEWER roles.
- Do not implement GET /api/v1/deals/:id/benchmark.
- Do not block rescoring globally; only when Enterprise and locked_method_version set on a view.
- Do not build massive multi-file ZIP for governance export initially; basic single payload first.
- Do not add complex drift math or heavy visualization to trajectory or dashboard.
- Do not change core scoring algorithm, benchmark percentile method, or snapshot hash logic.
- Do not allow client-side INSERT to governance_decision_log under any path.
- Do not expose workspace_plan or migration_version to unauthenticated health checks.

---

## Final Acceptance Criteria

- [ ] Pricing Option B enforced: FREE 3 scans / no benchmark-policy-export; PRO 5 members / 1 policy / export; PRO+ 10 members / 3 policies / trajectory; ENTERPRISE unlimited / cohort / snapshot build / API.
- [ ] governance_decision_log exists; RLS SELECT only for org members; only service role writes (via override endpoint).
- [ ] risk_score_history written from scan-creation path; scan succeeds even if history insert fails; trajectory chart uses score (and optional percentile), null-safe.
- [ ] Health: public { ok: true }; authenticated gets database_ok, stripe_configured, workspace_plan.
- [ ] All API errors structured { error, code }; all UI fetches 15s timeout.
- [ ] Override creates policy_overrides row and governance_decision_log row (service role); no client INSERT to log.
- [ ] Snapshot version lock: Enterprise only; only when explicitly set on portfolio view; no global rescore block.
- [ ] Basic governance export: score, percentile, snapshot metadata, policy results.
- [ ] API v1: only GET /api/v1/deals/:id/risk and GET /api/v1/portfolio/risk-summary; token auth; Enterprise.
- [ ] Roles: OWNER, ADMIN, MEMBER only.
- [ ] Minimal governance dashboard: risk trend (avg score), violation count, override count.
- [ ] Event logging and usage tracking in place for key actions and v1 usage.
