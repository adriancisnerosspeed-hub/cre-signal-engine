# Benchmark Layer, Pricing, Workspace Email — Diff Summary & QA Checklist

## Diff summary (files changed)

| File | Change |
|------|--------|
| `lib/portfolioSummary.ts` | Added `BenchmarkClassification`, `BenchmarkContext`, `benchmark` and `benchmark_context` on `PortfolioSummary`; added `getBenchmarkClassification()`, `computePortfolioPercentile()`; `getPortfolioSummary(service, orgId, options?)` with `benchmarkEnabled`; empty-org and full summary paths attach benchmark when enabled. |
| `lib/portfolioSummary.test.ts` | Tests for `getBenchmarkClassification` (all labels + priority), `computePortfolioPercentile` (single org → 50), `getPortfolioSummary` with/without `benchmarkEnabled`. |
| `lib/entitlements.ts` | New flags: `benchmark_enabled`, `explainability_enabled`, `backtest_enabled`, `workspace_enabled`. FREE: all false; PRO/OWNER: all true. |
| `lib/entitlements.test.ts` | New: unit tests for FREE/PRO/OWNER entitlement flags. |
| `app/app/portfolio/page.tsx` | Passes `benchmarkEnabled` to `getPortfolioSummary` and `benchmarkEnabled`/`backtestEnabled` to `PortfolioClient`. |
| `app/app/portfolio/PortfolioClient.tsx` | New props `benchmarkEnabled`, `backtestEnabled`; Benchmark card (percentile + classification) when `benchmarkEnabled && summary.benchmark`. |
| `app/api/deals/[id]/export-support-bundle/route.ts` | Backtest summary only added to ZIP when `entitlements.backtest_enabled`. |
| `app/app/deals/[id]/page.tsx` | Explainability diff section gated on `entitlements.explainability_enabled`; `ScenarioComparisonBlock` receives `explainabilityEnabled`. |
| `app/app/deals/[id]/ScenarioComparisonBlock.tsx` | New prop `explainabilityEnabled`; paywall shown when `!explainabilityEnabled \|\| plan === "free"`. |
| `app/api/deals/[dealId]/scenario-diff/route.ts` | Uses `getEntitlementsForUser` and gates on `explainability_enabled` instead of plan only. |
| `lib/email.ts` | `sendWorkspaceInviteEmail` now accepts `inviterName`; subject "You've been invited to CRE Signal Workspace"; body includes inviter name. |
| `lib/email/sendWorkspaceInvite.ts` | New: thin wrapper calling `sendWorkspaceInviteEmail`. |
| `app/api/org/invite/route.ts` | Generate 32-byte hex token; store `token_hash` (SHA-256) only; fetch inviter name from profiles; call `sendWorkspaceInvite` with retry once on failure; log send failures; response always includes `email_sent`, `invite_id`; no raw token in response. |
| `app/api/invite/accept/route.ts` | Look up invite by `token_hash` (hash incoming token); fallback lookup by `token` for legacy invites; add member, set status accepted. |
| `supabase/migrations/027_organization_invites_token_hash.sql` | Add `token_hash`; backfill from `token`; make `token` nullable; index on `token_hash`. |
| `app/api/org/invite/route.test.ts` | New: assert insert has `token_hash` and no `token`; assert `sendWorkspaceInvite` called with correct params and link with 64-char hex token. |
| `app/api/invite/accept/route.test.ts` | New: accept by token_hash returns 200 and updates invite/member; invalid token returns 404. |

---

## QA checklist

### Feature 1 — Benchmark layer
- [ ] **Portfolio page (Pro):** Log in as Pro; open Portfolio. Benchmark card is visible with percentile (e.g. "50th percentile") and classification (Conservative / Moderate / Aggressive / Concentrated / Deteriorating). Tooltip explains calculation.
- [ ] **Portfolio page (Free):** Log in as Free; open Portfolio. Benchmark card is not shown. No benchmark data in network/serialized summary.
- [ ] **Classification rules:** With test data (or seeded org), verify at least one classification appears correctly from PRPI/concentration/deterioration (e.g. high top market % → Concentrated).
- [ ] **Single portfolio:** With only one org, percentile is 50.

### Feature 2 — Pricing / entitlements
- [ ] **Free:** Export support bundle, methodology PDF, workspace invite, scenario comparison, and explainability diff are blocked or hidden. Paywall or disabled state when attempting.
- [ ] **Pro:** All of the above are allowed. Benchmark card, backtest in support bundle, explainability diff, scenario comparison, workspace invite visible and functional.
- [ ] **Support bundle:** As Free, export support bundle is 403. As Pro, export works; with `backtest_enabled` and sufficient outcome data, backtest_summary is included in ZIP.
- [ ] **Scenario diff API:** As Free (or when `explainability_enabled` false), GET scenario-diff returns 403. As Pro with explainability enabled, returns 200 when params valid.

### Feature 3 — Workspace invite email
- [ ] **Invite creation:** Create invite as Pro. DB row has `token_hash` set; no raw token stored. Response includes `invite_id` and `email_sent: true` when Resend succeeds.
- [ ] **Email content:** Inbox (or Resend logs) shows subject "You've been invited to CRE Signal Workspace", body with workspace name, inviter name, and "Accept invite" button linking to `/invite/accept?token=<64-char-hex>`.
- [ ] **Accept flow:** Open link in browser; sign in as the invited email; accept. User is added to workspace; invite status is `accepted`; token is invalidated for reuse.
- [ ] **Send failure:** If Resend fails (e.g. wrong API key), response is 200 with `email_sent: false` and `error`; invite row still exists; no raw token in response. Log shows failed send.
- [ ] **Legacy invite:** An invite created before migration (with `token` set) still accepts when using the old link (lookup by token).

### Post-implementation
- [ ] All tests pass: `npm test -- --run`
- [ ] No scoring math or existing behavior changed; additive only.
- [ ] Entitlement checks use `lib/entitlements` (no hardcoded Pro checks).
