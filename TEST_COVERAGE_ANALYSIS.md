# Test Coverage Analysis

## Current State

| Category | Source Files | Test Files | Coverage |
|----------|-------------|------------|----------|
| API Routes | 73 | 6 | 8% |
| Pages & Components | 85 | 1 | 1% |
| Core Utilities (`lib/`) | 60 | 17 | 28% |
| Benchmark module | 9 | 4 | 44% |
| Policy module | 4 | 1 | 25% |
| Email module | 4 | 1 | 25% |
| Export/PDF module | 5 | 3 | 60% |
| Entitlements module | 4 | 2 | 50% |
| Prompts module | 3 | 0 | 0% |
| Demo module | 2 | 0 | 0% |
| **Total** | **256** | **36** | **14%** |

**Test results:** 22 of 35 test files passing (183 of 198 individual tests pass).
13 test files currently fail — mostly due to `next/server` import resolution issues in the Vitest environment and some missing module stubs.

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

## Priority 4: Fix Existing Broken Tests (13 failing files)

Before adding new tests, fix the 13 currently failing test files:

1. **`next/server` import resolution** — Most API route tests fail because Vitest can't resolve `next/server`. Fix by adding a proper `vitest.config.ts` with `deps.inline` or module aliasing.
2. **Missing module stubs** — Some tests reference modules that need mocking (Supabase, Stripe).
3. **`jsdom` environment** — `PricingClient.test.tsx` fails because `jsdom` isn't found by the npx-invoked vitest. Add vitest as a direct dependency or ensure `jsdom` is properly resolved.

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

1. **Create `vitest.config.ts`** — Fix `next/server` resolution so all 13 broken tests pass again. This unblocks ~15 failing tests immediately.
2. **Add tests for `lib/parseSignals.ts`** — Pure function, easy to test, critical to correctness.
3. **Add tests for `lib/crossReferenceOverlay.ts`** — Pure logic, high impact on risk scores.
4. **Add tests for `lib/auth.ts` and `lib/apiAuth.ts`** — Security-critical, straightforward to mock.
5. **Add tests for `lib/rateLimit.ts`** and `lib/usage.ts` — Protect against billing and abuse issues.

---

## Summary

The codebase has **14% test file coverage** (36 test files for 256 source files). The existing tests are well-written and focused on core risk/benchmark logic, but major gaps exist in:

- **API routes** (92% untested) — the entire request/response layer
- **Signal parsing and cross-referencing** — the data pipeline feeding risk calculations
- **Authentication and authorization** — security-critical code
- **AI prompt construction** — drives the quality of AI-generated analysis
- **Component rendering** — almost no UI tests

Fixing the broken test infrastructure (vitest config) should be the first step, followed by adding tests for the untested pure-logic modules in `lib/`.
