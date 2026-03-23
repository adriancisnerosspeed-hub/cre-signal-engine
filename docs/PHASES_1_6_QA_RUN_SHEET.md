# Phases 1-6 QA Run Sheet (Compact)

Use this as the fast execution checklist. Mark each item Pass/Fail.

## Preflight

- [ ] Migrations applied through `058_hardening_changelog_rls.sql`.
- [ ] Supabase Edge Function deployed: `ai-insights`.
- [ ] Supabase secret exists: `OPENAI_API_KEY`.
- [ ] App env has `OPENAI_API_KEY` (local/Vercel).
- [ ] `OWNER_EMAIL` configured for owner tools.

## Test 1: Guest -> Demo Form -> Lead + Email

1. Open `/` logged out.
2. Submit demo form with real email.
3. Verify in Supabase `leads` table:
   - row created
   - `source = demo_snapshot`
4. Verify email received with PDF attachment.
5. Spam check: submit repeatedly and verify 429 after limit.

Pass when all 5 checks succeed.

## Test 2: Owner -> Feature Flag Toggle

1. Log in as owner and open `/owner/dev`.
2. In Feature Flags, toggle `ai-insights` OFF.
3. Open eligible scan page and verify AI Insights panel is hidden.
4. Toggle `ai-insights` ON.
5. Refresh scan page and verify panel is visible (allow cache TTL).

Pass when hide/show behavior tracks flag state.

## Test 3: Tier Override Enforcement

1. In `/owner/dev`, set org plan to `FREE`.
   - Verify no trajectory/governance export/AI Insights.
   - Verify free scan limit behavior.
2. Set to `PRO`.
   - Verify unlimited scans.
   - Verify still no trajectory and no AI Insights entitlement.
3. Set to `PRO+`.
   - Verify trajectory + governance export visible.
   - Verify AI Insights visible when flag ON.
4. Set to `ENTERPRISE`.
   - Verify full feature availability.

Pass when each tier's expected gating matches.

## Test 4: Cross-User Feature Grant

1. Keep `ai-insights` flag ON.
2. Log in as second user in PRO+ or ENTERPRISE workspace.
3. Verify AI Insights visible on scan page.
4. As owner, turn flag OFF.
5. Verify second user no longer sees AI Insights panel.

Pass when feature visibility changes globally by flag.

## Test 5: Changelog Security

1. Insert changelog row with `published_at = NULL`.
2. Visit `/changelog`.
3. Verify draft row does not appear.
4. Verify published rows still appear.

Pass when draft is hidden publicly.

## Test 6: Password-Protected Share

1. Create share link with password from scan page.
2. Open link in incognito.
3. Verify unlock form appears.
4. Verify wrong password fails.
5. Verify correct password unlocks memo.

Pass when lock/unlock behavior works exactly.

## Failure Triage Map

- Lead/email failures: `app/api/leads/demo-snapshot/route.ts`, `lib/email/sendDemoSnapshotEmail.ts`
- AI Insights failures: `app/api/deals/scans/[scanId]/ai-insights/route.ts`, `supabase/functions/ai-insights/index.ts`
- Flag issues: `app/api/owner/feature-flags/route.ts`, `lib/featureFlags.ts`
- Tier gating issues: `lib/entitlements/workspace.ts`, `app/api/owner/tier-override/route.ts`
- Changelog visibility issues: migration `058_hardening_changelog_rls.sql`, `app/changelog/page.tsx`
- Share unlock issues: `app/api/shared/memo/[token]/unlock/route.ts`, `lib/memoShareAuth.ts`, `lib/memoShareUnlock.ts`

## Done Criteria

- [ ] All 6 tests pass
- [ ] No unexpected 401/403/500 in tested flows
- [ ] AI Insights only appears when entitlement + flag allow it
- [ ] Draft changelog entries are not publicly visible
