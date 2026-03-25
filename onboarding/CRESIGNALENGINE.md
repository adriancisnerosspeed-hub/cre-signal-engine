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
- Current methodology family: `RISK_INDEX_VERSION = "3.0 (Institutional Stable v3)"`
- Locked at: `2026-03-23`
- Score range: 0-100
- Bands (v3):
  - Low: 0-32
  - Moderate: 33-53
  - Elevated: 54-68
  - High: 69+
- This is deterministic and versioned. v3 introduced tighter band thresholds, stronger LTV+vacancy ramps, completeness penalty, missing-debt-rate penalty, and driver share cap of 35%.
- Risk dedup is by `risk_type` (highest severity wins), not by trigger text. This eliminates AI extraction variance as a source of score instability.
- Deterministic severity overrides in `lib/riskSeverityOverrides.ts` (v3.1) replace AI-assigned severity with assumption-driven severity for all risk types that have a numeric proxy. When required assumptions are present, overrides ALWAYS win — there is no AI fallback. Includes risk removal functions (`shouldRemoveExitCapCompression`, `shouldRemoveExpenseUnderstated`, `shouldRemoveDataMissing`) for risks that assumptions prove are non-issues.
- Post-normalization scoring-input hash cache in the scan route guarantees identical normalized inputs produce identical scores even across different AI extraction runs.
- Supply pressure grouping: when both VacancyUnderstated and RentGrowthAggressive are present with supply keywords, RentGrowthAggressive is demoted one level to avoid double-counting.

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
- Testing: Vitest (config: `vitest.config.ts` with `@/` path alias)
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

### Supplemental AI Insights (Phase 3)

- **Purpose:** Non-deterministic, supplemental market/macro-style bullets only. The CRE Signal Risk Index™ in `lib/riskIndex.ts` is never modified by this feature.
- **Entitlements:** `WorkspaceEntitlements.canUseAiInsights` — `true` for `PRO+` and `ENTERPRISE`; `false` for `FREE` and `PRO`. Resolved with `getWorkspacePlanAndEntitlementsForUser` (so `platform_admin` gets Enterprise entitlements).
- **Feature flag:** Row in `feature_flags` with `name = 'ai-insights'` must be `enabled` (checked server-side via `isFeatureEnabled`; service role bypasses RLS).
- **Persistence:** `ai_insights_cache` (migration `055_ai_insights_cache`); inserts use the Edge Function with service role; API reads cache when `expires_at` is null or in the future (generation sets ~24h TTL).
- **API:** `GET /app/api/deals/scans/[scanId]/ai-insights/route.ts` — session + current org, verifies deal/scan belongs to org, then cache hit or `supabase.functions.invoke('ai-insights', …)` with the user access token.
- **Edge Function:** `supabase/functions/ai-insights/index.ts` — Deno; JWT auth; OpenAI Chat Completions (`gpt-4o-mini`, JSON object). Set secret **`OPENAI_API_KEY`** on the Supabase project for this function. `supabase/config.toml` sets `[functions.ai-insights] verify_jwt = true`.
- **UI:** `app/app/deals/[id]/AiInsightsPanel.tsx` embedded on both `app/app/deals/[id]/page.tsx` (main deal overview tab, after explainability diff) and `app/app/deals/[id]/scans/[scanId]/page.tsx` (below Risk Index). Disclaimer + show/hide toggle. Both locations use the same `showAiInsightsPanel = canUseAiInsights && aiInsightsFlag` gating.

### Supabase schema additions (migrations 051–060)

- `051_feature_flags` — `feature_flags` (name, enabled, …); RLS: `platform_admin` only for authenticated reads/writes; service role bypasses RLS. Defines `public.is_platform_admin()` for policies.
- `052_testimonials` — marketing testimonials; public read of `active` rows; `platform_admin` CRUD.
- `053_leads` — lead capture rows; no authenticated insert policy (writes via service role); `platform_admin` SELECT.
- `054_changelog_entries` — public read; `platform_admin` write.
- `055_ai_insights_cache` — supplemental AI payloads keyed by `deal_scan_id`; org members SELECT via deal/org join; `platform_admin` can read all.
- `056_memo_share_links_password` — optional `password_hash` on `memo_share_links` (Phase 6 share flow).
- `057_seed_testimonials` — seeds three anonymized marketing testimonials when `testimonials` is empty.
- `058_hardening_changelog_rls` — Tightens `changelog_entries` public read policy to only published rows (`published_at IS NOT NULL AND published_at <= now()`); drops the old unrestricted `USING (true)` policy.
- `059_add_scoring_input_hash` — Adds `scoring_input_hash TEXT` column to `deal_scans` with partial index on `(deal_id, scoring_input_hash)` where hash is not null and status is completed. Used for post-normalization scoring-input cache.
- `060_enable_ai_insights_flag` — Enables the `ai-insights` feature flag in `feature_flags` table.

Next migration file index: **061**.

### Public marketing / lead capture (Phase 2)

- Landing (`app/page.tsx`): dark institutional palette (`.landing.landing-premium`), trust badges, hero + **Instant Risk Snapshot** form (`app/components/DemoSnapshotForm.tsx`).
- **POST `/api/leads/demo-snapshot`**: Zod validation; inserts `leads` via service role; sample IC memo PDF via `lib/marketing/demoSnapshotPdf.ts` + `buildIcMemoPdf`; email with PDF attachment via `lib/email/sendDemoSnapshotEmail.ts`. Optional **`DEMO_CALENDLY_URL`** or **`NEXT_PUBLIC_CALENDLY_URL`** for the booking link (defaults to `https://calendly.com` if unset).
- **Testimonials:** `lib/marketing/testimonials.ts` + types in `lib/marketing/types.ts`; `app/components/TestimonialCarousel.tsx` on home and `app/pricing/page.tsx`.
- **Landing CTAs** (`app/components/LandingCta.tsx`): **Start Free Evaluation (3 scans)** → `/login?eval=true`.

### Phase 5 — SEO, analytics, dark mode

- **Site URL:** `lib/site.ts` — `getSiteUrl()` prefers `NEXT_PUBLIC_APP_URL`, then `NEXT_PUBLIC_SITE_URL`, then `https://${VERCEL_URL}`, else `http://localhost:3000`. Used for `metadataBase`, canonical URLs, `sitemap.xml`, and `robots.txt`.
- **Root metadata:** `app/layout.tsx` — default title template, OpenGraph/Twitter, `suppressHydrationWarning` on `<html>`.
- **Theme:** `next-themes` via `app/providers.tsx` (`attribute="class"`, `defaultTheme="system"`). `app/components/ThemeToggle.tsx` in `app/components/AppNav.tsx`.
- **PostHog (optional):** `posthog-js` + `posthog-node`. Env: **`NEXT_PUBLIC_POSTHOG_KEY`**, **`POSTHOG_API_KEY`** (server fallback), **`NEXT_PUBLIC_POSTHOG_HOST`** (defaults `https://us.i.posthog.com`). Client: `app/providers.tsx` — init with `capture_pageview: false` + manual `$pageview` on route change (`Suspense` + `useSearchParams`). `lib/analyticsClient.ts` — `captureClientEvent`, `identifyAnalyticsUser`. Server: `lib/posthogServer.ts` — `captureServerEvent` (fire-and-forget `shutdown()` per call). Events: **`user_signed_in`** (`app/auth/callback/route.ts`), **`deal_scan_completed`** (`app/api/deals/scan/route.ts`), **`ic_memo_pdf_exported`** (`app/api/deals/export-pdf/route.ts`), **`demo_snapshot_lead_submitted`** (`app/components/DemoSnapshotForm.tsx`). `AppNav` calls **`identifyAnalyticsUser`** on session and **`posthog.reset()`** on sign-out.
- **Sitemap / robots:** `app/sitemap.ts` (marketing routes: `/`, `/pricing`, `/sample-report`, `/terms`, `/privacy`, `/changelog`, `/login`). `app/robots.ts` — allows `/`; disallows `/api/`, `/app/`, `/owner/`, `/settings/`, `/auth/`, `/invite/`, `/digest/`.
- **OG images:** `app/opengraph-image.tsx` (default marketing), `app/shared/memo/[token]/opengraph-image.tsx` (deal name when link exists and not password-only). `generateMetadata` on `app/shared/memo/[token]/page.tsx` includes canonical URLs and Twitter `summary_large_image`.
- **Page metadata:** `app/page.tsx`, `app/pricing/page.tsx`, `app/sample-report/page.tsx`, `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/changelog/page.tsx`, `app/login/layout.tsx` — titles, descriptions, `openGraph`/`alternates` where appropriate.

### Owner developer dashboard (`/owner/dev`)

- **Access:** `app/owner/layout.tsx` checks `isOwner(user.email)` from `lib/auth.ts` (matches `OWNER_EMAIL`, case-insensitive). Everyone else is redirected to `/app`. Independent of workspace plan. **Nav:** logged-in users who are the owner see a **Dev tools** link in `app/components/AppNav.tsx` (driven by `show_owner_dev` on `GET /api/org/current`). Wrong URL **`/app/owner/dev`** redirects to **`/owner/dev`** via `app/app/owner/dev/page.tsx`.
- **UI:** `app/owner/dev/page.tsx` loads aggregate stats via service role (including all orgs, profiles, org members, and auth user emails); `app/owner/dev/OwnerDevDashboard.tsx` tabbed panels: **Plan & flags** (combined tier override + feature flag toggles in `PlanAndFlagsPanel.tsx` — plan selector defaults to org's current plan, single-org view auto-displays the workspace inline without a dropdown; feature flags shown as simple on/off toggle rows), risk index sandbox (client `computeRiskIndex` + optional IC memo PDF sample), usage/leads table (Organizations and Profiles stat boxes are clickable — open detail dialogs listing all records with plan, billing, member count, creator email, role, and anonymous/unlinked account indicators), test tools (Resend, risk dry-run, fetch AI insights via existing scan route), localStorage A/B label, debug actions (Stripe env check, reset `total_full_scans_used`, clear `usage_daily` for a user).
- **APIs (owner session required):** `lib/ownerAuth.ts` `requireOwner()` then service role as needed — `GET`/`POST`/`PATCH`/`DELETE` `app/api/owner/feature-flags/route.ts` (clears `lib/featureFlags` cache on writes); `POST` `app/api/owner/test-email/route.ts`; `POST` `app/api/owner/test-scan/route.ts` (deterministic dry-run, no OpenAI); `POST` `app/api/owner/tier-override/route.ts` (calls `clearFeatureFlagCache()` + `revalidatePath("/app", "layout")` after plan update so both feature flags and server components refresh without manual reload); `POST` `app/api/owner/process-outbox/route.ts` (manually triggers email outbox processing — same as cron but on-demand, for immediate delivery of queued invite emails); `POST` `app/api/owner/debug/route.ts`.
- **Scan detail dev tools:** `app/app/deals/[id]/scans/[scanId]/ScanDevTools.tsx` — owner-only collapsible panel on scan snapshot pages showing scoring identity (hashes, model, version), score breakdown (base/penalties/stabilizers/final), band floor overrides, injected risks, edge flags, validation errors, per-driver score contributions with confidence multipliers, risk table with injected/overridden badges and point values, and raw extraction JSON viewer. Uses `ForceRescanButton` for cache-bypass rescan.
- **Inline Force Rescan:** `app/app/deals/[id]/DealDetailClient.tsx` renders a "Force Rescan" button next to the main scan button (owner-only, `isOwner` prop). Bypasses all 3 cache layers via `force: 1` with owner session. Separate from the `ForceRescanButton` component used in ScanDevTools and TestToolsPanel.
- **Plan & flags UX:** `app/owner/dev/PlanAndFlagsPanel.tsx` — combined panel replaces the former separate "Feature flags" and "Tier override" tabs. Plan selector defaults to the selected org's current plan (no more resetting to FREE on refresh). Single-org workspaces show the org info inline instead of a dropdown. Feature flags are displayed as toggle rows (on/off) instead of a full CRUD table. A yellow tip appears when PRO+/ENTERPRISE is selected, reminding about the `ai-insights` flag requirement.

### Phase 6 — Onboarding, changelog, password shares, scan rate limit

- **Onboarding:** `app/app/components/OnboardingFlow.tsx` — three steps (workspace → first scan → invite) using shadcn `Card` / `Button`; shown when `organizations.onboarding_completed` is false (`app/app/page.tsx`). Completes via `PATCH /api/org/onboarding`. Passes `canInviteMembers` from `getWorkspacePlanAndEntitlementsForUser` (FREE users see upgrade copy instead of invite CTA). Navigation buttons use programmatic `router.push()` after awaiting `markComplete()` to avoid race conditions with `router.refresh()`. Error recovery: `completing` state resets in a `finally` block so buttons aren't permanently disabled if the PATCH fails.
- **Changelog:** Public `app/changelog/page.tsx` reads `changelog_entries` (published rows only). `app/app/layout.tsx` loads the latest published entry and renders `app/components/ChangelogBanner.tsx` (client: dismiss stores `cre_changelog_seen_id` in `localStorage`). `/changelog` is in `lib/publicRoutes.ts` `PUBLIC_ROUTES`.
- **Password-protected memo shares:** `POST /api/deals/scans/[scanId]/share` accepts optional JSON `{ password }`; bcrypt hash stored in `memo_share_links.password_hash` (migration `056_memo_share_links_password`). `GET` on the same route returns `password_protected` (boolean). Viewers unlock via `POST /api/shared/memo/[token]/unlock` (sets httpOnly cookie `memo_share_unlock` using `lib/memoShareAuth.ts`; optional env **`MEMO_SHARE_COOKIE_SECRET`** — falls back to `SUPABASE_SERVICE_ROLE_KEY` if unset). `app/shared/memo/[token]/page.tsx` shows `SharedMemoPasswordForm` until unlocked; `GET /api/shared/memo/[token]` returns 401 `{ password_required: true }` unless cookie or `X-Share-Password` header matches (`lib/memoShareUnlock.ts`). `app/app/deals/[id]/ShareMemoModal.tsx` supports optional password when creating a link.
- **Scan rate limit:** `lib/rateLimit.ts` — default **20** `deal_scans` rows per org per rolling hour (`ORG_SCAN_RATE_LIMIT_PER_HOUR`), counted before OpenAI on `POST /api/deals/scan` (skipped for `platform_admin`; does not apply to early `reused: true` responses). Returns **429** with `code: SCAN_RATE_LIMIT` and `Retry-After` header.
- **Demo snapshot rate limit:** In-memory IP-based, 5 requests per 15 minutes per IP on `POST /api/leads/demo-snapshot`; prevents abuse of unauthenticated PDF generation + Resend email sends.
- **Pricing drift note:** `app/pricing/page.tsx` Starter tier includes an inline note that Starter workspaces currently receive unlimited scans while marketing line may still say “10 scans / month” — enforcement remains `lib/entitlements/workspace.ts` (PRO = unlimited scans).

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
- no supplemental AI Insights (`canUseAiInsights`)

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
- no supplemental AI Insights (`canUseAiInsights`)

### Pro / Analyst Users (`PRO+`)

- everything in `PRO`
- 3 active governance policies
- max 10 members
- trajectory enabled
- governance export enabled
- methodology lock enabled
- still no cohort creation or snapshot build
- supplemental AI Insights entitlement enabled (`canUseAiInsights`; still requires feature flag `ai-insights`)

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
- supplemental AI Insights entitlement enabled (`canUseAiInsights`; still requires feature flag `ai-insights`)

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
3. Scan route checks input-text-hash cache (7-day TTL by default, configurable via `SCAN_CACHE_TTL_HOURS` env var, default `168`). If a cached scan with identical input hash exists, it is reused immediately.
4. If no cache hit, OpenAI extracts assumptions and risks using `gpt-5.4-mini` with `temperature: 0`, `top_p: 1`, `seed: 42`, `frequency_penalty: 0.1`, `presence_penalty: 0`, and `response_format: { type: "json_object" }` for structured, reproducible output.
5. Risks are normalized and deduplicated by `risk_type` (highest severity wins, triggers merged). Supply pressure grouping demotes RentGrowthAggressive when VacancyUnderstated is present with supply keywords.
5b. Assumptions are percent-normalized (`lib/assumptionNormalization.ts`).
5c. **Deterministic risk injection** (`lib/riskInjection.ts`): injects missing risks that the numeric assumptions mathematically warrant but the AI may have non-deterministically omitted. 7 rules cover DebtCostRisk, RefiRisk, VacancyUnderstated, ExitCapCompression, ConstructionTimingRisk, RentGrowthAggressive, and ExpenseUnderstated. Injected risks are marked in the breakdown (`injected_risk_types`) for the Score Debug panel. Does NOT replace risks already extracted by the AI.
6. **Deterministic severity overrides v3.1** (`lib/riskSeverityOverrides.ts`): replace AI-assigned severity with assumption-driven severity. When required assumptions are present, overrides ALWAYS win (Low floor) — AI severity is NEVER used as fallback. Proxies: DebtCostRisk (LTV-primary + debt_rate secondary), RefiRisk (LTV + hold + debt_rate, with debt_rate-only fallback for LTV<70), VacancyUnderstated (vacancy + construction keyword bump-up), RentGrowthAggressive (rent_growth ≥8/5/3), ExitCapCompression (spread-based, removal when >0.5), ExpenseUnderstated (expense_growth, missing+NOI→M, ≥3.0→removal), ConstructionTimingRisk (always Medium), DataMissing (count-based on 6 critical keys, removal when all present with High confidence). Three risk removal functions: `shouldRemoveExitCapCompression`, `shouldRemoveExpenseUnderstated`, `shouldRemoveDataMissing`.
7. Overlay logic connects relevant macro signals. Macro penalty is captured via `macroLinkedCount`/`macroDecayedWeight` in `computeRiskIndex()` — no severity bump on individual risks.
8. Post-normalization scoring-input hash is computed from canonical sorted risk/assumption data. If a recent completed scan with the same hash exists, its score/band/breakdown is reused verbatim (second-level cache).
9. If no scoring cache hit, `computeRiskIndex()` calculates score, band, and breakdown. The `risk_fingerprint` is stored in the breakdown.
10. Finalization writes scan outputs and history/audit rows. Both `scoring_input_hash` and completion metadata are stored.
11. Deal, portfolio, export, and governance surfaces consume the result.

**Score stability notes (v3.1):**
- The scoring function (`lib/riskIndex.ts`) is fully deterministic — identical inputs always produce identical scores. Version: `3.1 (Institutional Stable v3.1)`.
- **Six layers of determinism protection:** (1) input-text-hash cache (7-day TTL), (2) risk_type-based dedup eliminates duplicate risks, (3) **deterministic risk injection** ensures math-warranted risks are always present regardless of AI extraction variance, (4) **severity overrides with no AI fallback** — when required assumption values exist, the override ALWAYS returns a deterministic severity (Low floor), never the AI-assigned severity, (5) **risk removal** — ExitCapCompression (spread >0.5), ExpenseUnderstated (≥3.0%), and DataMissing (all core assumptions High confidence) are removed from the risk list when assumptions prove they're non-issues, (6) scoring-input-hash cache guarantees identical normalized inputs reuse exact prior scores.
- Score variability between rescans is now limited to genuinely different risk extractions that survive dedup, injection, override, and removal.
- Pure determinism tests exist in `lib/riskIndex.test.ts`, `lib/deterministicInvariant.test.ts`, `lib/riskInjection.test.ts`, and `lib/riskSeverityOverrides.test.ts` (33 tests including randomized-AI-severity stress test).
- **Owner force rescan:** `force=1` with owner session bypasses all cache layers (text-hash, scoring-input-hash), allowing fresh AI extraction + injection + scoring. Non-owner `force=1` only bypasses Layer 1 TTL cache.

### Macro Signal Display (Deal Detail)

- On the deal detail Overview tab, linked macro signals are shown in a single consolidated "Linked Macro Signals" section after the risks list, not repeated under each risk.
- Each unique signal appears once with badge chips listing the risk types it affects.
- Per-risk sections show only a count of linked signals (e.g., "2 linked signals") rather than the full signal content.
- Cross-reference overlay logic in `lib/crossReferenceOverlay.ts` is unchanged — deduplication is purely a display concern.

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

## 10. Testing State

- **44 test files**, 455 of 459 tests pass. 4 pre-existing failures remain (3 PricingClient jest-dom matchers, 1 invite/accept mock).
- `vitest.config.ts` resolves `@/` path aliases so all library and API route tests can import modules correctly.
- Test files live next to source: `lib/foo.ts` → `lib/foo.test.ts`.
- Key tested modules: `riskIndex`, `deterministicInvariant`, `riskSeverityOverrides`, `bandConsistency`, `dealScanContract`, `robustness`, `modelGovernance`, `parseSignals`, `crossReferenceOverlay`/`macroRelevance`, `auth`/`apiAuth`, `rateLimit`, `usage`, `benchmark/*`, `policy/engine`, `entitlements`, `export/*`.
- v3 stress harness: `scripts/stressRiskIndexV2.ts` (10 scenarios + 7 assertions including completeness penalty, missing-debt-rate penalty, and trigger-text invariance).
- Key untested areas: most API routes (92%), AI prompt templates, demo module, memo share auth, component rendering.
- Full gap analysis and recommendations: `TEST_COVERAGE_ANALYSIS.md`.
- When changing entitlements, always grep for the changed property in test files (obstacle 5a-pre).

---

## 11. Fast File Guide

- Product/system overview: `docs/SYSTEM_OVERVIEW.md`
- Billing and price-id mapping: `docs/BILLING.md`
- Entitlements: `lib/entitlements/workspace.ts`
- Pricing UI: `app/pricing/page.tsx`, `app/pricing/PricingClient.tsx`, `app/pricing/PricingComparisonTable.tsx`
- Deal scan pipeline: `app/api/deals/scan/route.ts`
- Risk engine: `lib/riskIndex.ts`
- Portfolio summary: `lib/portfolioSummary.ts`
- Stripe webhook: `app/api/stripe/webhook/route.ts`
- Governance roadmap/patch context: `docs/PHASE1_IMPLEMENTATION.md`, `docs/PHASE4_IMPLEMENTATION.md`, `docs/PHASE4_PATCHES_REFERENCE.md`
- Claude Code project context: `CLAUDE.md`
- Test coverage analysis: `TEST_COVERAGE_ANALYSIS.md`

