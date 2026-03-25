# CLAUDE.md — CRE Signal Engine

## Project Overview

CRE Signal Engine is a commercial real estate underwriting and governance platform. It combines AI-assisted extraction with deterministic risk scoring, benchmarking, governance policies, portfolio analytics, and export/sharing workflows.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (auth + DB) · Stripe (billing) · OpenAI (extraction) · Resend (email) · Vitest (testing) · pdf-lib / jszip (exports)

## Key Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (next build)
npm run lint         # ESLint
npm test             # Vitest run (single pass)
npm run test:watch   # Vitest watch mode
```

## Architecture

### Core Data Flow: Deal Scan Pipeline

1. User submits deal text → `POST /api/deals/scan`
2. Input hash checked against 7-day cache (configurable via `SCAN_CACHE_TTL_HOURS`)
3. OpenAI extracts assumptions/risks (`temperature: 0`, `top_p: 1`, `seed: 42`)
4. Risk normalization: dedup by `risk_type` (highest severity wins), supply pressure grouping, deterministic severity overrides
5. Signal parsing → `lib/parseSignals.ts`
6. Cross-reference overlay → `lib/crossReferenceOverlay.ts` (macro linking only, no severity bump)
7. Scoring-input hash check: if identical normalized inputs seen before, reuse exact prior score
8. Deterministic risk scoring → `lib/riskIndex.ts` (score 0–100, bands: Low 0-32 / Moderate 33-53 / Elevated 54-68 / High 69+)
9. Finalization writes scan outputs + audit rows + scoring_input_hash

### Key Business Logic Hubs

- `lib/riskIndex.ts` — Risk Index v3.0 (Institutional Stable v3). **Do not casually change scoring math.**
- `lib/portfolioSummary.ts` — Portfolio summary (band distribution, PRPI, concentration)
- `lib/entitlements/workspace.ts` — Canonical entitlement enforcement (source of truth over pricing copy)
- `lib/policy/engine.ts` — Governance policy evaluation
- `lib/benchmark/*` — Snapshot-based benchmarking (deterministic, not live)
- `app/api/stripe/webhook/route.ts` — Payment webhook

### Plan Tier Mapping

| User-Facing | Internal Slug | Key Limits |
|-------------|---------------|------------|
| Free | `FREE` | 3 lifetime scans, 1 member |
| Starter | `PRO` | Unlimited scans, 5 members |
| Analyst | `PRO+` | + trajectory, governance export, AI insights, 10 members |
| Fund / Enterprise | `ENTERPRISE` | + cohorts, snapshots, unlimited everything |

**Known drift:** Pricing page copy does not match enforced entitlements in several places. Treat `lib/entitlements/workspace.ts` as truth.

## Testing

### Current State

- **45 test files** covering **256 source files**, **467 of 471 tests passing**
- `vitest.config.ts` configures `@/` path alias for module resolution
- 4 pre-existing test failures remain: `PricingClient.test.tsx` (3 — missing jest-dom matchers) and `invite/accept/route.test.ts` (1 — incomplete mock)
- Tests use Vitest 2.0 with `@testing-library/react` and `jsdom` for component tests
- See `TEST_COVERAGE_ANALYSIS.md` for full gap analysis and prioritized recommendations

### Testing Conventions

- Test files live next to source: `lib/foo.ts` → `lib/foo.test.ts`
- API route tests: `app/api/.../route.test.ts` alongside `route.ts`
- Mock Supabase client for DB-dependent tests
- Mock `next/server` for API route tests (currently broken — needs vitest config fix)
- PDF/ZIP tests should validate structure, not raw binary content (see Obstacles 4d)
- When changing entitlements, always grep for the changed property in test files (see Obstacles 5a-pre)

### Recently Added Tests

- `lib/parseSignals.test.ts` — 11 tests (signal parsing from AI output)
- `lib/crossReferenceOverlay.test.ts` — 19 tests (signal context, relevance, overlay logic)
- `lib/auth.test.ts` — 9 tests (owner check, role gates)
- `lib/apiAuth.test.ts` — 9 tests (token hashing, bearer extraction)
- `lib/rateLimit.test.ts` — 9 tests (org scan rate limiting)
- `lib/usage.test.ts` — 15 tests (daily usage tracking, RPC calls)
- `lib/deterministicInvariant.test.ts` — 8 tests (v3 scoring invariants: order, trigger-text, monotonicity)
- `lib/riskIndex.test.ts` — 8 tests (v3 determinism, bands, completeness/debt-rate penalties)
- `lib/riskSeverityOverrides.test.ts` — 18 tests (all deterministic override rules + DataMissing removal + reference building determinism)
- `lib/riskInjection.test.ts` — 30 tests (7 injection rules, boundary cases, 20-run determinism, full integration)
- `lib/bandConsistency.test.ts` — 4 tests (v3 band boundary consistency)
- `lib/robustness.test.ts` — 41 tests (stress scenarios, invariance, monotonicity, PDF output)
- `lib/monthlyScanLimit.test.ts` — 10 tests (monthly scan cap enforcement, entitlement values, month key format)

### Remaining Critical Test Gaps

1. **Deal scan pipeline** — most important flow, minimal coverage
2. **API routes** — 92% untested (67 of 73 routes)
3. **AI prompt templates** (`lib/prompts/`) — zero tests
4. **Memo share auth** (`lib/memoShareAuth.ts`) — zero tests
5. **Component/page tests** — only 1 exists (and broken)

## Constraints & Rules

- **Risk scoring is deterministic and versioned.** Never introduce non-determinism into `computeRiskIndex()`.
- **Snapshot-based benchmarks.** Do not reintroduce live/floating percentile behavior.
- **Delta comparability must be earned.** Never default `delta_comparable` to `true` without evidence.
- **Prefer visible warnings over silent normalization.** Mismatches should be flagged, not hidden.
- **Append-only audit patterns.** Use idempotent writes for scan finalization, audit logs, invite acceptance.
- **Workspace plan is source of truth** for feature gating — not profile role, not pricing copy.

## File Guide

| What | Where |
|------|-------|
| System overview | `docs/SYSTEM_OVERVIEW.md` |
| Project memory | `onboarding/CRESIGNALENGINE.md` |
| Known obstacles | `onboarding/Obstacles.md` |
| AI assist profile | `onboarding/Assist.md` |
| Test coverage analysis | `TEST_COVERAGE_ANALYSIS.md` |
| Billing docs | `docs/BILLING.md` |
| Entitlements | `lib/entitlements/workspace.ts` |
| Risk engine | `lib/riskIndex.ts` |
| Severity overrides | `lib/riskSeverityOverrides.ts` |
| Deal scan normalization | `lib/dealScanContract.ts` |
| Macro overlay | `lib/crossReferenceOverlay.ts` |
| Stress harness | `scripts/stressRiskIndexV2.ts` |
| Scan pipeline | `app/api/deals/scan/route.ts` |
| Stripe webhook | `app/api/stripe/webhook/route.ts` |
| Migrations | `supabase/migrations/` (next index: 062) |
| Feature flags | `lib/featureFlags.ts` (60s TTL cache) |

## User Context

The project owner is non-technical for implementation purposes. Default to doing work end-to-end. Use CLI/automation over manual dashboard steps. Give exact commands when manual action is unavoidable. See `onboarding/Assist.md` for full communication and working style preferences.
