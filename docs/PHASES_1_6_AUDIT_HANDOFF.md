# Phases 1-6 Audit Handoff

This document is a single source of truth for a follow-up chat to verify the 6-phase rollout end to end.
It captures intended scope, implemented artifacts, known hardening fixes, and a strict verification checklist.

## Goal

Ensure the following phase bundles are complete and regression-free:

1. Homepage conversion
2. Testimonials
3. AI Insights
4. Owner/dev dashboard (feature flags, tier override, debug tools)
5. Analytics + changelog + onboarding + SEO + dark mode
6. Share links/password + scan throttling polish

## Transcript Sources Reviewed

- [DB + shadcn init](4da6d18d-7572-42c2-b366-009111060106)
- [Landing + testimonials](383b69d7-5f45-4e53-bb7e-b4924e73b469)
- [AI insights feature](ab02cc50-f17d-416a-ba10-9d447dbf975f)
- [Owner dev tools](a4618c7c-2ac0-4ab0-b63a-d43514eda86b)
- [SEO + PostHog + themes](908dc41a-a74f-4d30-9e3a-fefcec322f70)
- [Onboarding + changelog + shares](297b32b3-3115-4470-87d0-681984c91d31)

## Phase-by-Phase Intended Scope vs Implemented State

## Phase 1: Data/Foundation

### Intended
- Add core supporting tables for flags, testimonials, leads, changelog, AI insight cache.
- Add optional password field for memo share links.
- Add baseline UI primitives/theme setup.

### Implemented
- Migrations:
  - `051_feature_flags.sql`
  - `052_testimonials.sql`
  - `053_leads.sql`
  - `054_changelog_entries.sql`
  - `055_ai_insights_cache.sql`
  - `056_memo_share_links_password.sql`
- Seed migration: `057_seed_testimonials.sql`
- Utility: `lib/featureFlags.ts` with cache + clear path.

### Notes
- `053_leads.sql` uses `CREATE TABLE IF NOT EXISTS` intentionally for idempotency.

## Phase 2: Homepage Conversion + Testimonials + Lead Capture

### Intended
- Institutional landing refresh.
- Demo snapshot lead form that writes leads and sends sample PDF email.
- Testimonials carousel on marketing surfaces.

### Implemented
- Landing page updates in `app/page.tsx` and styling in `app/globals.css`.
- `app/components/DemoSnapshotForm.tsx`.
- Public API: `app/api/leads/demo-snapshot/route.ts`.
- Email path: `lib/email/sendDemoSnapshotEmail.ts`.
- PDF path: `lib/marketing/demoSnapshotPdf.ts`.
- Testimonials:
  - `lib/marketing/testimonials.ts`
  - `lib/marketing/types.ts`
  - `app/components/TestimonialCarousel.tsx`
  - seeded via `057_seed_testimonials.sql`.

### Hardening applied after audit
- Added `/api/leads/demo-snapshot` to `PUBLIC_API_ROUTES` in `lib/publicRoutes.ts`.
- Added in-memory IP rate limit in `app/api/leads/demo-snapshot/route.ts` (5 requests / 15 minutes).

## Phase 3: AI Insights

### Intended
- Supplemental non-deterministic AI panel on scan detail.
- Gated by entitlement and feature flag.
- Cache outputs in database.
- Invoke Supabase Edge Function.

### Implemented
- Entitlements:
  - `lib/entitlements/workspace.ts` adds `canUseAiInsights` for `PRO+` and `ENTERPRISE`.
  - tests updated in `lib/entitlements/workspace.test.ts`.
- API route:
  - `app/api/deals/scans/[scanId]/ai-insights/route.ts`.
- UI:
  - `app/app/deals/[id]/AiInsightsPanel.tsx`
  - wired in `app/app/deals/[id]/scans/[scanId]/page.tsx`.
- Edge Function:
  - `supabase/functions/ai-insights/index.ts`
  - configured in `supabase/config.toml` (`verify_jwt = true`).
- Cache table:
  - `055_ai_insights_cache.sql`.

### Required runtime dependencies
- Supabase function deployed: `supabase functions deploy ai-insights`.
- Supabase function secret set: `OPENAI_API_KEY`.
- Feature flag row exists and enabled: `name = 'ai-insights'`.

## Phase 4: Owner/Dev Dashboard

### Intended
- Restricted owner area with operational controls.
- Feature flag management.
- Tier override and debug/test tooling.

### Implemented
- Layout gate:
  - `app/owner/layout.tsx`.
- Auth helpers:
  - `lib/auth.ts` (`isOwner`)
  - `lib/ownerAuth.ts` (`requireOwner`).
- UI:
  - `app/owner/dev/page.tsx`
  - `app/owner/dev/OwnerDevDashboard.tsx`
  - tab/panel files under `app/owner/dev/*`.
- Owner APIs:
  - `app/api/owner/feature-flags/route.ts`
  - `app/api/owner/tier-override/route.ts`
  - `app/api/owner/test-email/route.ts`
  - `app/api/owner/test-scan/route.ts`
  - `app/api/owner/debug/route.ts`.

### Access model
- Owner access is email-based via `OWNER_EMAIL` match.

## Phase 5: SEO + Analytics + Theming + Changelog Shell

### Intended
- Metadata, canonical URLs, sitemap/robots, OG images.
- Optional analytics with PostHog.
- Theme provider + dark mode toggle.
- Public changelog page and in-app banner.

### Implemented
- Site URL helper: `lib/site.ts`.
- Root metadata/theme provider:
  - `app/layout.tsx`
  - `app/providers.tsx`
  - `app/components/ThemeToggle.tsx`
  - `app/components/AppNav.tsx`.
- SEO:
  - `app/sitemap.ts`
  - `app/robots.ts`
  - `app/opengraph-image.tsx`
  - `app/shared/memo/[token]/opengraph-image.tsx`.
- Analytics:
  - `lib/analyticsClient.ts`
  - `lib/posthogServer.ts`
  - event hooks in auth/scan/export/demo form paths.
- Changelog:
  - `app/changelog/page.tsx`
  - `app/components/ChangelogBanner.tsx`
  - `app/app/layout.tsx` banner injection.

### Hardening applied after audit
- New migration `058_hardening_changelog_rls.sql` to restrict public changelog reads to published rows only.

## Phase 6: Onboarding + Share Password + Rate-Limit + Final Polish

### Intended
- In-app onboarding flow.
- Optional password protection on memo shares.
- Scan route rate limiting.
- Public changelog route support.

### Implemented
- Onboarding:
  - `app/app/components/OnboardingFlow.tsx`
  - `app/api/org/onboarding/route.ts`
  - surfaced in `app/app/page.tsx`.
- Share password:
  - `056_memo_share_links_password.sql`
  - `app/api/shared/memo/[token]/unlock/route.ts`
  - `lib/memoShareAuth.ts`
  - `lib/memoShareUnlock.ts`
  - share UI integration in `ShareMemoModal` and shared memo page components.
- Scan throttling:
  - `lib/rateLimit.ts`
  - enforced in `app/api/deals/scan/route.ts`.
- Public route registration:
  - `/changelog` in `lib/publicRoutes.ts`.

## Conflict/Overlap Findings (Resolved)

1. Public API route list did not include `/api/leads/demo-snapshot`.
   - Resolved in `lib/publicRoutes.ts`.
2. Changelog RLS allowed broad reads (`USING (true)`).
   - Resolved by `058_hardening_changelog_rls.sql`.
3. Demo lead route had no anti-abuse throttle.
   - Resolved with in-memory IP limit in route handler.

## Open Risk/Operational Notes (Non-blocking)

- Demo snapshot rate limit is in-memory only (per runtime instance). For strict global anti-abuse, move to Redis/KV.
- If `MEMO_SHARE_COOKIE_SECRET` is not set, fallback currently uses `SUPABASE_SERVICE_ROLE_KEY`. Prefer dedicated cookie secret in production.
- AI Insights requires both entitlement and feature flag; missing either looks like "feature unavailable", not a hard error.

## Verification Checklist (Run In Order)

## 1) Guest lead flow
- Visit `/` while logged out.
- Submit demo form.
- Confirm row in `leads` with `source = demo_snapshot`.
- Confirm email with PDF attachment arrives.
- Submit rapid repeated requests; verify 429 after threshold.

## 2) Owner feature flags
- Log in as owner (`OWNER_EMAIL`).
- Open `/owner/dev`.
- Toggle `ai-insights` flag off then on.
- Verify scan page AI Insights panel hides/shows accordingly (allow up to cache TTL).

## 3) Tier override gating
- Set org to `FREE`; verify scan limits and no trajectory/governance export/AI Insights.
- Set org to `PRO`; verify unlimited scans but still no trajectory/AI Insights.
- Set org to `PRO+`; verify trajectory/governance export and AI Insights (if flag on).
- Set org to `ENTERPRISE`; verify full feature set.

## 4) Cross-user verification
- Enable `ai-insights` as owner.
- Log in as a different user in eligible workspace.
- Confirm AI Insights visible.
- Disable flag as owner.
- Confirm AI Insights hidden for second user.

## 5) Changelog security check
- Insert a draft changelog row (`published_at = NULL`) directly in DB.
- Visit `/changelog`; draft must not appear.
- Confirm published rows do appear.

## 6) Share password check
- Create password-protected share link from scan page.
- Open in incognito; verify unlock prompt.
- Verify incorrect password fails and correct password unlocks.

## Environment/Deploy Checklist

- Supabase migrations through `058` applied.
- Supabase function deployed: `ai-insights`.
- Supabase secret set: `OPENAI_API_KEY`.
- App runtime env set (`OPENAI_API_KEY`) in local + Vercel for non-edge OpenAI paths.
- `OWNER_EMAIL` configured for owner/dev access.

## "Definition of Done" For Follow-Up Chat

Everything is complete when:

- All six verification sections pass.
- No unexpected 401/403/500 in the tested flows.
- AI Insights works only when both entitlement and flag permit it.
- Draft changelog entries are not visible publicly.
- No regressions found in owner/dev controls or share-link behavior.
