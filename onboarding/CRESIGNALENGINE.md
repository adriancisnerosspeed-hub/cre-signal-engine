# CRE Signal Engine - Project Memory

---

## Maintenance Protocol For Future AI

Read this file before doing substantial work in this repo.

- Update this file whenever features, plans, APIs, data flows, or key constraints materially change.
- If you change entitlement logic, pricing copy, or plan mapping, update the plan sections here immediately.
- If you discover that repo behavior and product copy differ, note both and mark which one is actually enforced.
- Pair updates here with `onboarding/Obstacles.md` and `onboarding/Assist.md` when the change also reveals a new friction pattern or user preference.

---

## 1. Product Snapshot

CRE Signal Engine is a CRE underwriting and governance platform for teams deploying real capital. The app combines AI-assisted extraction and narrative generation with deterministic risk scoring, benchmark context, governance policy checks, portfolio analytics, share/export flows, workspace billing, and organizational collaboration.

Core idea:

- ingest deal text or market text
- extract structured assumptions and risks
- compute a deterministic CRE Signal Risk Index score and band
- surface benchmark/governance/portfolio context around that score
- make outputs shareable, auditable, and operator-friendly

---

## 2. Core Product Surfaces

### Analyze / Signal Engine

- Route: `POST /api/analyze`
- Converts user-provided market/deal text into actionable CRE signals.
- Signals are stored and later used in digest flows and deal-risk overlay logic.

### Deals And Scans

- Users create deals and add raw underwriting inputs.
- Scans create `deal_scans`, `deal_risks`, extracted assumptions, and finalized risk outputs.
- Core outputs include:
  - `risk_index_score`
  - `risk_index_band`
  - `risk_index_breakdown`
  - scan narratives / IC memo support
  - share/export artifacts

### Risk Index

- Canonical implementation: `lib/riskIndex.ts`
- Current methodology family: `RISK_INDEX_VERSION = "2.0 (Institutional Stable)"`
- Score range: 0-100
- Bands:
  - Low: 0-34
  - Moderate: 35-54
  - Elevated: 55-69
  - High: 70+
- This is supposed to stay deterministic and versioned.

### Portfolio

- Main summary logic: `lib/portfolioSummary.ts`
- Current portfolio layer includes:
  - band distribution
  - concentration
  - PRPI (Portfolio Risk Pressure Index)
  - risk movement metrics
  - IC performance summary
  - policy/governance status
  - benchmark context

### Governance

- Policy tables and engine support shared risk policies, evaluations, overrides, and governance decisions.
- Governance exports and trajectory/history live in the higher paid tiers.
- Important governance principle: prefer visible warnings and audit trails over silent normalization.

### Benchmarks

- Snapshot-based benchmark system with cohorts, snapshot members/distributions, and per-deal benchmark rows.
- Benchmarking should be treated as snapshot-driven and deterministic, not live and floating.

### Collaboration / Workspace

- Organizations, organization members, invites, current org switching, member caps by plan.
- Roles in org membership: `OWNER`, `ADMIN`, `MEMBER`.
- Platform role bypass exists through `profiles.role = platform_admin`.

### Billing

- Stripe Checkout + Billing Portal + webhook.
- Organization plan is the main source of truth for workspace entitlements.

### Email / Digest

- Resend is used for invite and digest email flows.
- There is background email processing via cron/outbox patterns.

### API / Export / Sharing

- Methodology PDF export
- IC memo / deal export support
- support bundle export
- public share links for selected memo-like outputs
- enterprise-oriented API token support for v1 read-only APIs

---

## 3. Architecture Snapshot

- Framework: Next.js App Router
- UI: React + Tailwind v4 + shadcn/ui (base-nova preset, `components/ui/*`, `lib/utils.ts` `cn()`)
- Database/Auth: Supabase
- Payments: Stripe
- AI: OpenAI
- Email: Resend
- Testing: Vitest
- PDF/ZIP tooling: `pdf-lib`, `jszip`

Key server/business-logic hubs:

- `lib/riskIndex.ts`
- `lib/portfolioSummary.ts`
- `lib/entitlements/workspace.ts`
- `app/api/deals/scan/route.ts`
- `app/api/stripe/webhook/route.ts`
- `lib/benchmark/*`
- `lib/policy/*`
- `lib/featureFlags.ts` — `isFeatureEnabled` / `getAllFlags` with in-memory TTL cache (reads `feature_flags`; use server client with appropriate role)

### Supabase schema additions (migrations 051–056)

- `051_feature_flags` — `feature_flags` (name, enabled, …); RLS: `platform_admin` only for authenticated reads/writes; service role bypasses RLS. Defines `public.is_platform_admin()` for policies.
- `052_testimonials` — marketing testimonials; public read of `active` rows; `platform_admin` CRUD.
- `053_leads` — lead capture rows; no authenticated insert policy (writes via service role); `platform_admin` SELECT.
- `054_changelog_entries` — public read; `platform_admin` write.
- `055_ai_insights_cache` — supplemental AI payloads keyed by `deal_scan_id`; org members SELECT via deal/org join; `platform_admin` can read all.
- `056_memo_share_links_password` — optional `password_hash` on `memo_share_links` (Phase 6 share flow).

Next migration file index: **057**.

---

## 4. Canonical Plan Model

### Internal Plan Slugs

- `FREE`
- `PRO`
- `PRO+`
- `ENTERPRISE`

### Current User-Facing Pricing Labels

- Starter
- Analyst
- Fund
- Enterprise
- Founding Member Offer (discounted Analyst positioning in pricing copy)

### Important Mapping Nuance

The user-facing pricing names and the internal plan slugs are not perfectly aligned.

Current practical mapping in the repo:

- Free evaluation -> `FREE`
- Starter -> `PRO`
- Analyst -> `PRO+`
- Fund -> `ENTERPRISE`
- Enterprise custom tier exists in pricing copy, but most enforced server-side entitlements still top out at `ENTERPRISE`

Future chats must verify whether they are changing:

- actual entitlement logic
- pricing copy only
- checkout/product naming only

Do not assume those are already synchronized.

---

## 5. Current Enforced Entitlements

Canonical server-side source: `lib/entitlements/workspace.ts`

### Free Users (`FREE`)

- 3 lifetime scans
- 1 portfolio
- no benchmark
- no policy/governance features
- no support bundle
- no invites
- max 1 member
- no trajectory
- no governance export
- no methodology lock

### Basic / Starter Users (`PRO`)

- unlimited scans
- 3 portfolios
- benchmark consumption enabled
- policy features enabled
- support bundle enabled
- invites enabled
- 1 active governance policy
- max 5 members
- no trajectory
- no governance export
- no methodology lock

### Pro / Analyst Users (`PRO+`)

- everything in `PRO`
- 3 active governance policies
- max 10 members
- trajectory enabled
- governance export enabled
- methodology lock enabled
- still no cohort creation or snapshot build

### Fund / Enterprise-Internal Users (`ENTERPRISE`)

- unlimited scans
- unlimited portfolios
- benchmark enabled
- snapshot build enabled
- cohort creation enabled
- unlimited governance policies
- unlimited members
- trajectory enabled
- governance export enabled
- methodology lock enabled
- API-token-oriented enterprise workflows exist around this tier

---

## 6. Current Pricing-Copy Vs Entitlement Drift

This matters. Future chats should not assume the pricing page equals enforced backend behavior.

Current notable drift:

- `app/pricing/page.tsx` says Starter has `10 scans / month`, but server-side entitlements currently give `PRO` unlimited scans.
- `app/pricing/page.tsx` says Starter includes `2 workspace members`, while server-side entitlements currently give `PRO` max `5`.
- `app/pricing/page.tsx` says Analyst includes `5 workspace members`, while server-side entitlements currently give `PRO+` max `10`.
- `app/pricing/page.tsx` says Fund includes `Up to 10 workspace members`, while internal `ENTERPRISE` entitlements currently allow unlimited members.

Treat `lib/entitlements/workspace.ts` as actual enforcement unless the user explicitly asks to realign pricing and backend behavior.

---

## 7. Important User-Facing Features By Tier Bucket

### Free

- account creation / workspace creation
- 3 free evaluation scans
- basic deal creation and scan usage inside the free cap
- core risk score visibility on those scans

### Basic / Starter

- full deal scanning beyond free cap
- IC-ready PDF export
- share links
- benchmark consumption
- one active governance policy
- small-team collaboration

### Pro / Analyst

- everything in Starter
- risk trajectory
- governance export packet
- richer portfolio and governance workflows
- more policy capacity and team capacity

### Fund / Enterprise Internal

- everything in Pro / Analyst
- custom cohorts
- snapshot build control
- institutional benchmark administration
- broader admin workflows and enterprise-style support posture

### Enterprise Custom Copy Layer

- pricing page also advertises:
  - API access
  - custom reporting
  - enterprise SLA
- Treat this as packaging/sales positioning unless and until a distinct enforced server-side plan model is added.

---

## 8. Operational Data Flow

### Deal Scan Flow

1. User creates or selects a deal.
2. User submits raw underwriting text.
3. Scan route extracts assumptions and risks.
4. Overlay logic may connect relevant signals.
5. `computeRiskIndex()` calculates score, band, and breakdown.
6. Finalization writes scan outputs and history/audit rows.
7. Deal, portfolio, export, and governance surfaces consume the result.

### Benchmark Flow

1. Cohorts define the population.
2. Snapshots freeze benchmark membership/distributions.
3. Deal benchmark records store percentile/band against a snapshot.
4. Portfolio/deal UI reads snapshot-backed benchmark context.

### Governance Flow

1. Policies are defined per org.
2. Policies evaluate against deal/portfolio context.
3. Decisions, overrides, and escalation actions should be auditable.

---

## 9. Key Constraints Future Chats Must Preserve

- Do not casually change risk-scoring math.
- Do not reintroduce live/non-deterministic percentile behavior where snapshot-based behavior is intended.
- Do not silently treat delta values as comparable without verifying comparability.
- Do not conflate workspace plan state with profile/platform role state.
- Do not change pricing/plan behavior without checking both user-facing copy and enforced entitlement code.
- Prefer append-only/idempotent audit and history patterns.

---

## 10. Fast File Guide

- Product/system overview: `docs/SYSTEM_OVERVIEW.md`
- Billing and price-id mapping: `docs/BILLING.md`
- Entitlements: `lib/entitlements/workspace.ts`
- Pricing UI: `app/pricing/page.tsx`, `app/pricing/PricingClient.tsx`, `app/pricing/PricingComparisonTable.tsx`
- Deal scan pipeline: `app/api/deals/scan/route.ts`
- Risk engine: `lib/riskIndex.ts`
- Portfolio summary: `lib/portfolioSummary.ts`
- Stripe webhook: `app/api/stripe/webhook/route.ts`
- Governance roadmap/patch context: `docs/PHASE1_IMPLEMENTATION.md`, `docs/PHASE4_IMPLEMENTATION.md`, `docs/PHASE4_PATCHES_REFERENCE.md`

