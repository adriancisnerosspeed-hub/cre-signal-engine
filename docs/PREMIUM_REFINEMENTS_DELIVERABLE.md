# CRE Premium Refinements — Deliverable

## 1. File-level code changes

| File | Change |
|------|--------|
| `supabase/migrations/019_profiles_total_full_scans_and_increment.sql` | New: `profiles.total_full_scans_used`, `increment_total_full_scans(p_user_id)` SECURITY DEFINER |
| `supabase/migrations/020_organization_invites_status_accepted.sql` | New: `organization_invites.status`, `accepted_at`, CHECK, index |
| `supabase/migrations/021_deal_scans_scenario_label_asset_type.sql` | New: `deal_scans.scenario_label`, `asset_type`, `market`, backfill, index for percentile |
| `lib/entitlements.ts` | Added `lifetime_full_scan_limit` (free: 3, pro/owner: null); free `deal_scans_per_day: 0` |
| `lib/usage.ts` | Added `getTotalFullScansUsed`, `incrementTotalFullScans` (RPC) |
| `app/api/deals/scan/route.ts` | Free: lifetime check before OpenAI, 429 `LIFETIME_LIMIT_REACHED`; Pro: daily cap; increment lifetime (free) or daily (pro) after commit; set `asset_type`/`market` on insert |
| `app/components/PaywallModal.tsx` | `variant="lifetime_limit"` with exact institutional copy; no backdrop close for lifetime; "Return to Deals" CTA |
| `app/app/deals/[id]/DealDetailClient.tsx` | On 429 check `data.code === "LIFETIME_LIMIT_REACHED"`; show paywall with `variant="lifetime_limit"` |
| `app/pricing/page.tsx` | Hero, FREE/PRO cards, "Why $99 Is a Rounding Error", footer; institutional copy |
| `lib/export/exportPdf.ts` | New: `buildExportPdf()` (pdf-lib), institutional layout, no AI branding |
| `app/api/deals/export-pdf/route.ts` | New: POST, Pro gate 403 `PRO_REQUIRED_FOR_EXPORT`, returns PDF |
| `app/app/deals/[id]/ExportPdfButton.tsx` | New: Export PDF button, 403 → PaywallModal |
| `app/app/deals/[id]/page.tsx` | ExportPdfButton, PercentileBlock, ScenarioComparisonBlock, plan; disclaimer text (no "AI-assisted") |
| `app/api/deals/scans/[scanId]/percentile/route.ts` | New: GET, same asset_type cohort, `sample_size`, Pro 403 `PRO_REQUIRED_FOR_PERCENTILE` |
| `app/app/deals/[id]/PercentileBlock.tsx` | New: Fetches percentile; `sample_size < 5` → "Limited benchmark data available."; free blurred + CTA |
| `app/api/deals/scans/[scanId]/route.ts` | New: PATCH `scenario_label`, Pro 403 `PRO_REQUIRED_FOR_SCENARIO` |
| `app/api/deals/[dealId]/scenario-diff/route.ts` | New: GET, risk score delta, band change, risks added/removed counts, Pro 403 |
| `app/app/deals/[id]/ScenarioComparisonBlock.tsx` | New: Base/Conservative selectors, Compare, diff display; free blurred + CTA |
| `app/app/portfolio/page.tsx` | New: Distribution by tier, Top 5 deals, Exposure by asset type/market; free blurred |
| `app/components/AppNav.tsx` | Link to `/app/portfolio` |
| `app/api/invite/accept/route.ts` | UPDATE invite `status='accepted'`, `accepted_at` instead of DELETE; filter by `status='pending'` |
| `app/settings/workspace/page.tsx` | Invites filter `status='pending'`; display Plan (Free/Pro) |
| `app/settings/workspace/WorkspaceClient.tsx` | Invite section always visible for canManage; when !canInvite disabled inputs + "Pro access required." |
| `app/api/org/invite/route.ts` | 403 body `{ code: "PRO_REQUIRED_FOR_INVITE" }` |
| `lib/export/scanNarrative.ts` | Disclaimer: "underwriting support tool" (removed "AI-assisted") |
| `app/app/deals/[id]/page.tsx` | IC Summary disclaimer same wording |

## 2. Migrations created

- `019_profiles_total_full_scans_and_increment.sql`
- `020_organization_invites_status_accepted.sql`
- `021_deal_scans_scenario_label_asset_type.sql`

## 3. New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/deals/export-pdf` | Generate PDF (Pro); 403 `PRO_REQUIRED_FOR_EXPORT` |
| GET | `/api/deals/scans/[scanId]/percentile` | Risk percentile (Pro); 403 `PRO_REQUIRED_FOR_PERCENTILE` |
| PATCH | `/api/deals/scans/[scanId]` | Set `scenario_label` (Pro); 403 `PRO_REQUIRED_FOR_SCENARIO` |
| GET | `/api/deals/[dealId]/scenario-diff` | Scenario diff (Pro); 403 `PRO_REQUIRED_FOR_SCENARIO` |

## 4. Gated endpoint list with error codes

| Endpoint | Gate | Error code |
|----------|------|------------|
| POST `/api/deals/scan` | Free lifetime cap | `LIFETIME_LIMIT_REACHED` (429) |
| POST `/api/deals/export-pdf` | Pro | `PRO_REQUIRED_FOR_EXPORT` (403) |
| GET `/api/deals/scans/[scanId]/percentile` | Pro | `PRO_REQUIRED_FOR_PERCENTILE` (403) |
| PATCH `/api/deals/scans/[scanId]` | Pro | `PRO_REQUIRED_FOR_SCENARIO` (403) |
| GET `/api/deals/[dealId]/scenario-diff` | Pro | `PRO_REQUIRED_FOR_SCENARIO` (403) |
| POST `/api/org/invite` | Pro | `PRO_REQUIRED_FOR_INVITE` (403) |

## 5. Race safety confirmation

- **Only mutation path**: `total_full_scans_used` is updated only via Postgres function `increment_total_full_scans(p_user_id)`.
- **Called once per successful full scan**: The scan route calls `incrementTotalFullScans(service, user.id)` exactly once, after deal_scans insert, deal_risks insert, overlay, risk index update, and only when `plan === "free"`.
- **Not called on reused scans**: When the route returns early with `reused: true`, no increment is called.
- **No double-increment**: The function is SECURITY DEFINER and performs a single atomic `UPDATE profiles SET total_full_scans_used = total_full_scans_used + 1 WHERE id = p_user_id`; concurrent requests each obtain one increment.
- **No manual UPDATE**: The service role does not perform direct `UPDATE profiles SET total_full_scans_used = ...` anywhere; it only calls the RPC.

## 6. Stripe webhook instant role update

- Webhook handler updates `profiles.role` in the same request on `checkout.session.completed` and `customer.subscription.updated` via `setProfilePlanFromSubscription` (sync `supabase.from("profiles").update({ role: plan })`).
- No async job, no queue, no polling. User has Pro on next request after successful payment.
