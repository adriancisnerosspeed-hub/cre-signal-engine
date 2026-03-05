# CRE Signal Engine — System Overview

Single reference for **features**, **architecture**, **data flows**, **signal engine**, **risk analysis**, and **conventions**. Intended for senior analysts and coding agents working in this codebase.

**Related docs:** `docs/BILLING.md`, `docs/INSTITUTIONAL_EXECUTION_PLAN.md`, `docs/PHASE4_IMPLEMENTATION.md`, `docs/PHASE4_PATCHES_REFERENCE.md`.

---

## 1. Features and systems

| System | Description |
|--------|-------------|
| **Deals** | CRE deals per organization: name, asset_type, market, created_by. Each deal can have multiple `deal_inputs` (raw underwriting text) and multiple `deal_scans`. |
| **Deal scans** | Per-deal AI scan: OpenAI extracts assumptions + risks from deal input text; creates `deal_scans` (extraction, status) and `deal_risks`; then risk index, overlay, and finalize (score, band, history). |
| **Risk index (CRE Signal Risk Index™)** | Institutional scoring (v2.0): 0–100 score, bands (Low/Moderate/Elevated/High), stored on `deal_scans` and in `risk_score_history` for trajectory. |
| **Signals (CRE Signal / macro)** | User-level “material, actionable” market signals from the Analyze flow: OpenAI + prompt → parsed signals (type, action, confidence) stored in `signals`; used in digest and linked to deal risks via `deal_signal_links`. |
| **Benchmarks** | Cohort-based percentile ranking: `benchmark_cohorts`, `benchmark_cohort_snapshots`, `benchmark_snapshot_members`, `benchmark_snapshot_distributions`, `deal_benchmarks` (per-deal per-snapshot percentile/band). Snapshots built via API; PRO+ for cohorts; ENTERPRISE can build snapshots. |
| **Governance** | Risk policies (`risk_policies`, `risk_policy_evaluations`), policy evaluation engine, governance dashboard, append-only `governance_decision_log` (approve/override/escalate). Export packet and trajectory are PRO+/ENTERPRISE. |
| **Portfolio** | Portfolio views (saved filter/sort presets per org), portfolio summary (counts, distribution by band, concentration, PRPI, risk movement), governance export; optional methodology lock per view. |
| **Billing** | Stripe Checkout/Portal; webhook updates `organizations.plan` and billing fields; workspace plans drive entitlements (FREE/PRO/PRO+/ENTERPRISE). |
| **Invites** | Organization invites (token, email, role, expiry); accept flow with member cap (RPC for concurrency); gated by workspace entitlements. |
| **Digest** | User preferences (signal types, actions, min confidence, timezone, digest time), manual send and scheduled cron; emails via Resend; `digest_sends` log. |
| **API tokens** | Org-scoped tokens (hash stored) for v1 read-only API (deal risk, portfolio risk-summary); created/revoked by org owner/admin; Enterprise-oriented. |
| **Methodology / PDF export** | Methodology content and PDF export for deals and methodology page; support bundle export for deals. |

---

## 2. How it’s built

| Layer | Details |
|-------|---------|
| **Stack** | Next.js 16 (App Router), React 19, Supabase (Postgres + Auth), Stripe, OpenAI, Resend, Tailwind, Vitest. |
| **Key libs** | `@supabase/ssr`, `@supabase/supabase-js`, `openai`, `stripe`, `resend`, `zod`, `pdf-lib`, `jszip`. |
| **Inputs** | User actions (analyze, scan deal, create deal, invite, policy eval, digest send, checkout); Stripe webhooks; cron (digest, email process); v1 API (Bearer token). |
| **Outputs** | API JSON; DB writes (signals, runs, deal_scans, deal_risks, risk_score_history, benchmarks, policy evals, governance log); PDFs (deal export, methodology); emails (Resend); Stripe Checkout/Portal redirects. |

---

## 3. Signal engine (“CRE Signal”)

**What it is:** The flow that turns user-provided text (market/deal updates) into **actionable CRE signals**: material changes that would affect pricing, leverage, lender choice, or timing.

| Aspect | Details |
|--------|---------|
| **Prompt** | `lib/prompts/creSignalPrompt.ts` — strict rules: “No actionable signal.” unless the change is material. Schema: Signal Type (Pricing, Credit Availability, Credit Risk, Liquidity, Supply-Demand, Policy, Deal-Specific), What Changed, Why It Matters, Who This Affects, Action (Act/Monitor/Ignore), Confidence. |
| **Data flow** | User POSTs to `/api/analyze` with `{ inputs: string }` → OpenAI (CRE_SIGNAL_PROMPT) → output normalized → `parseSignals()` → actionable rows inserted into `signals` (and a `runs` row). |
| **Tables** | `runs` (inputs, output, user_id), `signals` (user_id, run_id, idx, signal_type, what_changed, action, confidence, etc.). |
| **Linking to deals** | After a deal scan, `runOverlay` in `lib/crossReferenceOverlay.ts` links the deal’s risks to the **deal creator’s** recent signals (same user, time window, asset/market relevance). Links go into `deal_signal_links` (deal_risk_id, signal_id, link_reason). Macro link count feeds the risk index (capped penalty). |
| **Use** | Digest (last N hours of user’s signals, filtered by preferences); overlay for risk context and macro penalty in risk index. |

---

## 4. Risk analysis

**Purpose:** Produce a single 0–100 risk score and band per deal scan, with breakdown and optional trajectory.

| Aspect | Details |
|--------|---------|
| **Drivers** | `deal_scans` (one per run), `deal_risks` (per-scan risk items with risk_type, severity_current, confidence). Score is computed in app (`lib/riskIndex.ts`), not in a DB function. |
| **Computation** | `lib/riskIndex.ts` — `computeRiskIndex()`: Base (40) + risk penalties − stabilizers; clamped 0–100. Bands (v2.0): Low 0–34, Moderate 35–54, Elevated 55–69, High 70+. Inputs: normalized assumptions (from extraction), list of risks (severity, confidence, risk_type), optional macro link count/decay, optional previous score for delta. Penalties: severity points × confidence; structural vs market split; DataMissing/ExpenseUnderstated capped; ramps for exit cap compression, DSCR, LTV+vacancy; tier overrides (e.g. force Elevated for DSCR &lt; 1.1). Stabilizers: low LTV, exit cap ≥ cap rate in; cap 20. Macro: unique linked macro signal categories add a capped penalty. |
| **Versioning** | `RISK_INDEX_VERSION = "2.0 (Institutional Stable)"`; stored on `deal_scans.risk_index_version`; methodology locked per portfolio view when set. |
| **Outputs** | `deal_scans.risk_index_score`, `risk_index_band`, `risk_index_breakdown` (JSONB); `risk_score_history` (append per scan for trajectory); `deals` denormalized (latest_risk_score, latest_risk_band, latest_scanned_at, scan_count); `risk_audit_log` for score deltas. Finalization is via RPC `finalize_scan_risk_and_history` (same transaction as scan update + history insert; idempotent on scan_id). |

---

## 5. Data model highlights

| Table / area | Purpose |
|--------------|---------|
| **organizations** | Workspaces: name, created_by, plan (FREE/PRO/PRO+/ENTERPRISE), billing_status, stripe_*. |
| **organization_members** | (org_id, user_id, role: OWNER \| ADMIN \| MEMBER). |
| **profiles** | id = auth.users.id, role (platform_admin \| platform_dev \| platform_support \| user); used for platform bypass only; entitlements come from org plan. |
| **deals** | organization_id, created_by, name, asset_type, market, latest_scan_id, latest_risk_score, latest_risk_band, latest_scanned_at, scan_count, market_key. |
| **deal_inputs** | deal_id, raw_text (underwriting text). |
| **deal_scans** | deal_id, extraction (JSONB), status, completed_at, model, risk_index_* , macro_linked_count, key assumption columns. |
| **deal_risks** | deal_scan_id, risk_type, severity_original/current, what_changed_or_trigger, confidence, evidence_snippets. |
| **signals** | user_id, run_id, idx, signal_type, what_changed, action, confidence, etc. |
| **deal_signal_links** | deal_risk_id, signal_id, link_reason (macro ↔ deal risk overlay). |
| **risk_score_history** | deal_id, scan_id (UNIQUE), score, risk_band, completed_at, percentile, snapshot_id; append-only for trajectory. |
| **risk_audit_log** | deal_id, scan_id, previous_score, new_score, delta, band_change, model_version. |
| **portfolio_views** | organization_id, created_by, name, config_json, is_shared, locked_method_version (optional). |
| **Benchmark layer** | benchmark_cohorts, benchmark_cohort_snapshots, benchmark_snapshot_members, benchmark_snapshot_distributions, deal_benchmarks. |
| **Governance** | risk_policies, risk_policy_evaluations, governance_decision_log, policy_overrides. |
| **Billing / usage** | workspace_usage (scans_lifetime_count), stripe_webhook_events, stripe_webhook_audit, billing_audit_log. |
| **Invites** | organization_invites (org_id, email, role, token_hash, status, accepted_at). |
| **API** | api_tokens (organization_id, name, token_hash, last_used_at). |

RLS is enabled on tenant data; service role used for scan creation, finalize RPC, webhooks, and server-only reads.

---

## 6. Auth, entitlements, and plans

| Aspect | Details |
|--------|---------|
| **Auth** | Supabase Auth; session in app; `profiles` created/updated on login (`ensureProfile`); `OWNER_EMAIL` env → role set to `platform_admin`. |
| **Org context** | `profiles.current_org_id`; user must be in `organization_members` for the org; deal/scan/portfolio access is org-scoped via RLS. |
| **Workspace plans** | Stored on `organizations.plan`: **FREE**, **PRO**, **PRO+**, **ENTERPRISE**. Defined in `lib/entitlements/workspace.ts`. FREE: 3 lifetime scans, 1 portfolio, no benchmark/policy/invites/trajectory/export/lock. PRO: unlimited scans, 3 portfolios, benchmark (no snapshot build), 1 policy, support bundle, invites, 5 members. PRO+: 3 policies, 10 members, trajectory, governance export, methodology lock. ENTERPRISE: unlimited portfolios, snapshot build, cohorts, unlimited policies/members. |
| **Platform bypass** | `profiles.role === 'platform_admin'` → effective ENTERPRISE for that user regardless of org plan. |
| **Gating** | Scan creation uses `create_deal_scan_with_usage_check` (FREE: 3 lifetime scans). Benchmark/policy/invites/trajectory/export/lock checked via `getWorkspacePlanAndEntitlementsForUser`. Workspace features use `lib/entitlements/workspace.ts`; legacy `lib/entitlements.ts` is user-level (platform_admin vs free) for non-workspace checks. |

---

## 7. APIs and integrations

### App API routes (session auth)

| Area | Routes |
|------|--------|
| **Analyze** | POST `/api/analyze` — CRE Signal: body `{ inputs: string }`; OpenAI → runs + signals. |
| **Deals / scans** | GET/POST/PATCH/DELETE `/api/deals`, `/api/deals/[id]`; POST `/api/deals/scan` (deal_id, optional force, portfolio_view_id, override_method_lock); GET `/api/deals/[id]/benchmark`, `/api/deals/[id]/risk-trajectory`; GET `/api/deals/scans/[scanId]/percentile`, `/api/deals/scans/[scanId]/narrative`; POST `/api/deals/export-pdf`, `/api/deals/[id]/export-support-bundle`. |
| **Portfolio** | GET/POST/PATCH/DELETE `/api/portfolio-views`, `/api/portfolio-views/[id]`; GET `/api/portfolio/benchmark`, `/api/portfolio/governance-export`. |
| **Governance** | GET `/api/governance/dashboard`; GET/POST `/api/risk-policies`, `/api/risk-policies/[id]`, POST `/api/risk-policies/[id]/evaluate`, `/api/risk-policies/evaluate-all`; POST `/api/policy-overrides`. |
| **Benchmarks** | GET/POST `/api/benchmarks/cohorts`, `/api/benchmarks/cohorts/[id]`; POST `/api/benchmarks/snapshots/build`; GET `/api/benchmarks/snapshots`, `/api/benchmarks/snapshots/[id]`. |
| **Org / invite** | POST `/api/org/invite`; GET/DELETE `/api/org/members/[userId]`; GET `/api/org/current`; POST `/api/invite/accept`. |
| **Digest / usage** | GET `/api/usage/today`; POST `/api/digest/send-now`. |
| **Settings** | GET/POST `/api/settings/preferences`; GET/POST `/api/settings/api-tokens`, DELETE `/api/settings/api-tokens/[id]`. |
| **Billing** | POST `/api/billing/create-checkout-session`; POST `/api/stripe/portal`; GET `/api/pro/status`. |
| **Other** | GET `/api/methodology/export-pdf`; GET `/api/health`. |

### Public (no auth)

- POST `/api/stripe/webhook` — Stripe signature verified; idempotency via `stripe_webhook_events`; updates org plan/billing; unknown/missing price written to `stripe_webhook_audit`. See `lib/publicRoutes.ts` for allowlist.

### Cron (CRON_SECRET)

- GET `/api/cron/digest`, GET `/api/cron/email/process`.

### v1 read-only API (Bearer token)

- GET `/api/v1/deals/:id/risk` — Deal risk summary (score, band, scan_id, completed_at).
- GET `/api/v1/portfolio/risk-summary` — Portfolio risk summary (counts, distribution_by_band, policy_status).

Token resolved via `lib/apiAuth.ts` (hash in `api_tokens`); org-scoped.

### Integrations

- **OpenAI** — Analyze (CRE Signal), deal scan (extraction + risks), narrative.
- **Stripe** — Checkout, Portal, webhook; price → plan in `lib/stripeWebhookPlan.ts`.
- **Resend** — Digest and invite emails.

---

## 8. Conventions, env, logic, testing, migrations

| Topic | Details |
|-------|---------|
| **Conventions** | Next.js App Router under `app/`; server and shared logic in `lib/`; Supabase server client `lib/supabase/server.ts`, service role `lib/supabase/service.ts`; RLS for all tenant data; workspace entitlements in `lib/entitlements/workspace.ts`; structured errors in `lib/entitlements/errors.ts`. |
| **Env** | **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_ANALYST`, `STRIPE_PRICE_ID_FUND`. **OpenAI:** `OPENAI_API_KEY`. **Resend:** `RESEND_API_KEY`, `RESEND_FROM`. **App:** `NEXT_PUBLIC_APP_URL`, `OWNER_EMAIL`, `CRON_SECRET`, `ENABLE_FIXTURES`, `DEBUG_PDF_EXPORT`. |
| **Business logic** | Risk index and bands: `lib/riskIndex.ts`. Policy evaluation: `lib/policy/engine.ts`. Benchmark: `lib/benchmark/` (compute, percentile, snapshotBuilder, cohortRule, eligibility, classification). Overlay: `lib/crossReferenceOverlay.ts`. Digest: `lib/digest.ts`. Portfolio summary: `lib/portfolioSummary.ts`. Deal scan contract / normalization: `lib/dealScanContract.ts`, `lib/assumptionNormalization.ts`, `lib/assumptionValidation.ts`. Display plan (pricing): `lib/pricingDisplayPlan.ts`. |
| **Testing** | Vitest; tests under `lib/**/*.test.ts` and `app/api/**/*.test.ts`. Stress: `npm run stress:risk` (`scripts/stressRiskIndexV2.ts`). |
| **Migrations** | Supabase migrations in `supabase/migrations/` (numbered); apply in order. Key ones: 006 (organizations, organization_members), 007–008 (deals, deal_scans, deal_risks), 013 (risk_index on deal_scans), 023 (portfolio_views), 028 (risk_policies), 029 (benchmark layer), 031/032 (workspace_usage, create_deal_scan_with_usage_check, Stripe), 035 (roles), 036 (governance_decision_log), 037 (risk_score_history), 043/044/047 (risk_score_history UNIQUE, finalize RPC), 045 (accept_organization_invite_with_cap), 046 (profiles role cleanup), 041 (api_tokens). |
| **Docs to read first** | `docs/BILLING.md` (Stripe + plans). `docs/INSTITUTIONAL_EXECUTION_PLAN.md` (institutional direction, pricing, corrections). `docs/PHASE4_IMPLEMENTATION.md` and `docs/PHASE4_PATCHES_REFERENCE.md` (alignment patch and hardening). |

---

## Quick reference for analysts and agents

- **Where risk score is computed:** `lib/riskIndex.ts` — `computeRiskIndex()`, `RISK_INDEX_VERSION`.
- **Where signals are created:** `/api/analyze` → OpenAI → `parseSignals()` → `signals` table.
- **Where scan → score → history is finalized:** `app/api/deals/scan/route.ts` calls `finalize_scan_risk_and_history` RPC after overlay and risk index.
- **Where entitlements are defined:** `lib/entitlements/workspace.ts` — `getWorkspaceEntitlements(plan)`, `getWorkspacePlanAndEntitlementsForUser`.
- **Where plan is set from Stripe:** `app/api/stripe/webhook/route.ts` + `lib/stripeWebhookPlan.ts` (`planFromPriceId`).
- **Do not change:** Core risk scoring math, benchmark percentile logic, or cohort/snapshot build algorithms without explicit approval and versioning.
