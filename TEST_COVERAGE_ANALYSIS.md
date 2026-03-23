# Test Coverage Analysis

## Current State

| Category | Source Files | Test Files | Coverage |
|----------|-------------|------------|----------|
| API Routes | 73 | 6 | 8% |
| Pages & Components | 85 | 1 | 1% |
| Core Utilities (`lib/`) | 60 | 22 | 37% |
| Benchmark module | 9 | 4 | 44% |
| Policy module | 4 | 1 | 25% |
| Email module | 4 | 1 | 25% |
| Export/PDF module | 5 | 3 | 60% |
| Entitlements module | 4 | 2 | 50% |
| Prompts module | 3 | 0 | 0% |
| Demo module | 2 | 0 | 0% |
| **Total** | **256** | **42** | **16%** |

**Test results:** 40 of 42 test files passing (385 of 389 individual tests pass).
2 test files have pre-existing failures: `PricingClient.test.tsx` (missing `toBeInTheDocument` matcher) and `invite/accept/route.test.ts` (incomplete mock).

**Infrastructure fix:** Added `vitest.config.ts` with `@/` path alias, which resolved the `next/server` import failures that previously broke 13 test files.

### New tests added (this analysis)

| Test File | Tests | What it covers |
|-----------|-------|----------------|
| `lib/parseSignals.test.ts` | 11 | Signal parsing from AI output — actionable/non-actionable, field extraction, sorting |
| `lib/auth.test.ts` | 9 | `isOwner`, `canBypassRateLimit`, `canUseProFeature` |
| `lib/apiAuth.test.ts` | 9 | `hashApiToken` consistency/trimming, `getBearerToken` extraction |
| `lib/rateLimit.test.ts` | 9 | Org scan rate limiting — allow/block thresholds, custom options |
| `lib/usage.test.ts` | 15 | Daily usage reads, RPC increments, error handling, NaN safety |
| `lib/crossReferenceOverlay.test.ts` | 19 | `inferSignalContext`, `isSignalRelevant`, `runOverlay` early exits |

---

## Priority 1: High-Impact, Untested Business Logic

These files contain core business logic with no tests. Bugs here directly affect deal analysis accuracy and user-facing results.

### 1. `lib/riskIndex.ts` — Risk Calculation Engine (has tests, but needs more)
The existing `riskIndex.test.ts` covers basic scenarios. **Missing coverage:**
- Edge cases with missing/null signal inputs
- Boundary conditions between risk bands (e.g., scores at exact thresholds)
- Interaction between macro overlays and base risk scores

### 2. `lib/crossReferenceOverlay.ts` — Cross-Reference Overlay (NO tests)
Performs cross-referencing of signals which feeds into the risk engine. Zero test coverage for a module that directly affects deal scoring.

### 3. `lib/macroData.ts` + `lib/marketContextLookup.ts` — Macro/Market Data (NO tests)
Market context lookup drives macro adjustments in risk scoring. Untested.

### 4. `lib/parseSignals.ts` — Signal Parsing (NO tests)
Parses raw signals from AI responses. If this breaks, every scan produces garbage. Zero coverage.

### 5. `lib/icRecommendedActions.ts` — IC Recommended Actions (NO tests)
Generates investment committee recommendations. User-visible output with no tests.

---

## Priority 2: API Route Coverage (currently 8%)

Only 6 of 73 API routes have tests. The most critical untested routes:

| Route | Risk | Why |
|-------|------|-----|
| `POST /api/deals/scan` | **Critical** | Core scan creation — triggers AI analysis, writes to DB |
| `POST /api/analyze` | **Critical** | Main deal analysis endpoint |
| `POST /api/deals` | **High** | Deal CRUD — data integrity |
| `GET /api/deals/[id]/risk-trajectory` | **High** | Risk trajectory data for charts |
| `GET /api/deals/[id]/scenario-diff` | **High** | Scenario comparison logic |
| `POST /api/stripe/webhook` | **High** | Payment processing — financial impact |
| `GET /api/governance/dashboard` | **Medium** | Governance dashboard data |
| `POST /api/policy-overrides` | **Medium** | Policy override creation |
| `GET /api/v1/deals/[id]/risk` | **Medium** | Public API — external consumers depend on this |
| `GET /api/v1/portfolio/risk-summary` | **Medium** | Public API — external consumers depend on this |

### Recommended approach for API route tests
- Mock Supabase client and `next/server` (fix existing import issues first)
- Test request validation (bad inputs, missing fields)
- Test authorization checks (unauthenticated, wrong role)
- Test happy-path response shape

---

## Priority 3: Untested Library Modules

### `lib/prompts/` — AI Prompt Templates (0 tests)
- `creSignalPrompt.ts`, `dealScanPrompt.ts`, `icMemoNarrative.ts`
- These construct prompts sent to OpenAI. Tests should validate prompt structure, variable interpolation, and that required sections are present.

### `lib/demo/` — Demo Deal/Scan Creation (0 tests)
- `createDemoDeal.ts`, `runDemoScan.ts`
- Demo flows are often the first thing prospects see. Should validate data shape and default values.

### `lib/digest.ts` — Email Digest Generation (0 tests)
- Builds digest content from portfolio data. Should test content generation and edge cases (empty portfolio, single deal, many deals).

### `lib/auth.ts` + `lib/apiAuth.ts` — Authentication Utilities (0 tests)
- Auth helper functions should be tested for token validation, role checking, and error handling.

### `lib/memoShareAuth.ts` + `lib/memoShareUnlock.ts` — Memo Sharing Auth (0 tests)
- Password-protected memo sharing. Should test hash verification, expiry, and access control.

### `lib/rateLimit.ts` — Rate Limiting (0 tests)
- If rate limiting fails silently, abuse goes undetected. Test threshold enforcement and reset behavior.

### `lib/usage.ts` — Usage Tracking (0 tests)
- Tracks scan usage against tier limits. Wrong counts could block paying users or allow overuse.

---

## Priority 4: Fix Remaining Broken Tests (2 failing files)

~~13 test files were failing~~ → **Resolved to 2** by adding `vitest.config.ts` and running `npm install`.

Remaining failures:
1. **`app/pricing/PricingClient.test.tsx`** — Uses `toBeInTheDocument` from `@testing-library/jest-dom` but no setup file configures the matchers. Fix: add a vitest setup file that imports `@testing-library/jest-dom/vitest`.
2. **`app/api/invite/accept/route.test.ts`** — Mock Supabase client is missing `.rpc()` method. Fix: add `rpc` to the mock.

---

## Priority 5: Component/Page Tests (currently 1%)

Only `PricingClient.test.tsx` exists (and it's broken). Key components to test:

| Component | Why |
|-----------|-----|
| `DealDetailClient.tsx` | Most complex page — renders risk scores, charts, actions |
| `PolicyClient.tsx` | Policy rule CRUD — validates complex form logic |
| `GovernanceDashboardClient.tsx` | Aggregates governance data — rendering correctness |
| `PortfolioClient.tsx` | Portfolio view with filtering/sorting |
| `OnboardingFlow.tsx` | First-run experience — broken onboarding loses users |
| `ShareMemoModal.tsx` | Password setting, link generation — security-relevant |

---

## Quick Wins (Highest ROI for Effort)

1. ~~**Create `vitest.config.ts`**~~ — **DONE.** Fixed `next/server` resolution, unblocked 11 previously broken test files.
2. ~~**Add tests for `lib/parseSignals.ts`**~~ — **DONE.** 11 tests covering field extraction, actionability, sorting.
3. ~~**Add tests for `lib/crossReferenceOverlay.ts`**~~ — **DONE.** 19 tests for signal context inference, relevance filtering, overlay early exits.
4. ~~**Add tests for `lib/auth.ts` and `lib/apiAuth.ts`**~~ — **DONE.** 18 tests for owner check, role gates, token hashing, bearer extraction.
5. ~~**Add tests for `lib/rateLimit.ts`** and `lib/usage.ts`~~ — **DONE.** 24 tests for rate limiting and usage tracking.

### Remaining Quick Wins
6. **Fix `PricingClient.test.tsx`** — Add `@testing-library/jest-dom` setup for `toBeInTheDocument` matcher.
7. **Fix `invite/accept/route.test.ts`** — Add `rpc` mock to the Supabase service mock.
8. **Add tests for `lib/prompts/`** — Validate prompt structure and variable interpolation.
9. **Add deal scan pipeline integration test** — Mock OpenAI, test the full scan flow end-to-end.
10. **Add tests for `lib/memoShareAuth.ts`** — Password hash verification and cookie logic.

---

## Known Obstacles Relevant to Testing (from `onboarding/Obstacles.md`)

These documented friction patterns directly affect testing strategy:

### 4a. Cross-cutting changes frequently trigger adjacent TS/Next.js failures
- Large changes often surface unrelated type/build failures. After adding tests, expect at least one follow-up fix pass.

### 4d. Binary response typing and PDF internals are recurring sharp edges
- ZIP/PDF routes and tests repeatedly hit issues around `Uint8Array` response bodies. Test PDF helpers/structure instead of raw compressed bytes. This is why `exportPdf.test.ts` and `buildMethodologyPdf.test.ts` are fragile.

### 4e. Supabase Edge Functions (Deno) break Next.js `tsc` if included
- `supabase/functions/` must be excluded from test discovery. Vitest config should exclude this path.

### 5a-pre. Test assertions can lag behind implementation changes
- Already observed: `workspace.test.ts` asserted `canInviteMembers: false` for PRO when implementation said `true`. **When changing entitlement logic, always grep for the changed property in test files.**

### 6b. Silent inconsistencies are worse than visible warnings
- Tests should verify that mismatches (band drift, version drift, delta comparability) produce explicit warnings/flags, not silent fallbacks.

### 6c. Delta comparability must be earned, not assumed
- `backtestEngine.ts` and risk trajectory logic should have tests that verify `delta_comparable` is never defaulted to `true` without supporting data.

---

## Deal Scan Pipeline — Critical Untested Path

The scan pipeline (from `onboarding/CRESIGNALENGINE.md` §8) is the most important data flow and has minimal test coverage:

1. **Input hash cache** (7-day TTL) — no tests for cache hit/miss/expiry logic
2. **OpenAI extraction** (`temperature: 0`, `top_p: 1`, `seed: 42`) — extraction mocking needed for determinism tests
3. **Signal parsing** (`lib/parseSignals.ts`) — zero tests
4. **Cross-reference overlay** (`lib/crossReferenceOverlay.ts`) — zero tests
5. **Risk scoring** (`lib/riskIndex.ts`) — has tests, but edge cases missing
6. **Scoring input hash + audit log** — no tests for audit row creation
7. **Finalization writes** — no tests for scan output persistence

Testing this pipeline end-to-end (with mocked OpenAI) would be the single highest-value integration test.

---

## Entitlement Drift Risk

Per `onboarding/CRESIGNALENGINE.md` §6, there is documented drift between pricing copy and enforced entitlements:

| Feature | Pricing Page Says | Entitlements Enforce |
|---------|-------------------|---------------------|
| Starter scans | 10/month | Unlimited |
| Starter members | 2 | 5 |
| Analyst members | 5 | 10 |
| Fund members | Up to 10 | Unlimited |

Tests for `lib/entitlements/workspace.ts` should cover all four plan tiers exhaustively and be treated as the source of truth. Any pricing page test should validate against actual entitlement values, not marketing copy.

---

## Summary

The codebase has **14% test file coverage** (36 test files for 256 source files). The existing tests are well-written and focused on core risk/benchmark logic, but major gaps exist in:

- **API routes** (92% untested) — the entire request/response layer
- **Deal scan pipeline** — the most critical data flow has minimal coverage
- **Signal parsing and cross-referencing** — the data pipeline feeding risk calculations
- **Authentication and authorization** — security-critical code
- **AI prompt construction** — drives the quality of AI-generated analysis
- **Component rendering** — almost no UI tests
- **Entitlement enforcement** — documented pricing/entitlement drift makes this a regression risk

Fixing the broken test infrastructure (vitest config) should be the first step, followed by adding tests for the untested pure-logic modules in `lib/` and then the deal scan pipeline as an integration test.
