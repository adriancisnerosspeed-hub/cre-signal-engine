# Billing (Stripe + Entitlements)

## Overview

Plan is stored in `organizations.plan` (`FREE` | `PRO` | `PRO+` | `ENTERPRISE`). Stripe webhook updates `organizations.plan` when a subscription is created/updated/deleted.

### Plan Tiers

| User-Facing | Internal Slug | Key Limits |
|-------------|---------------|------------|
| Free | `FREE` | 3 lifetime scans, 1 member |
| Starter | `PRO` | 10 scans/month, 5 members |
| Analyst | `PRO+` | Unlimited scans, 10 members, trajectory, AI insights |
| Fund / Enterprise | `ENTERPRISE` | Unlimited everything |

### 7-Day Starter Trial

New organizations automatically receive a 7-day trial of Starter (PRO) features:
- `organizations.trial_ends_at` = signup time + 7 days
- `organizations.trial_plan` = `'PRO'`
- The `plan` column stays `'FREE'` — trial is an overlay resolved by `lib/entitlements/workspace.ts`
- When `trial_ends_at > now()` AND `trial_plan` is set AND `plan = 'FREE'`, PRO entitlements apply
- Trial automatically expires (no cron needed)
- Stripe subscription activation clears trial fields (`trial_ends_at = NULL, trial_plan = NULL`)

### Annual Billing

Annual plans offer 20% savings (except Founding Member — same price).

| Plan | Monthly | Annual (per month) | Annual Total |
|------|---------|-------------------|--------------|
| Starter | $97/mo | $78/mo | $936/yr |
| Analyst | $297/mo | $238/mo | $2,856/yr |
| Fund | $797/mo | $638/mo | $7,656/yr |
| Founding | $147/mo | $147/mo | $1,764/yr |

## Environment Variables (Vercel / .env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (server-only). |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret for `POST /api/stripe/webhook`. |
| `STRIPE_PRICE_ID_STARTER` | Yes | Stripe Price ID for Starter monthly. Maps to plan `PRO`. |
| `STRIPE_PRICE_ID_ANALYST` | Yes | Stripe Price ID for Analyst monthly. Maps to plan `PRO+`. |
| `STRIPE_PRICE_ID_FUND` | Yes | Stripe Price ID for Fund monthly. Maps to plan `ENTERPRISE`. |
| `STRIPE_PRICE_ID_FOUNDING` | Yes | Stripe Price ID for Founding Member monthly. Maps to plan `PRO+`. |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Optional | Stripe Price ID for Starter annual. Maps to plan `PRO`. |
| `STRIPE_ANALYST_ANNUAL_PRICE_ID` | Optional | Stripe Price ID for Analyst annual. Maps to plan `PRO+`. |
| `STRIPE_FUND_ANNUAL_PRICE_ID` | Optional | Stripe Price ID for Fund annual. Maps to plan `ENTERPRISE`. |
| `STRIPE_FOUNDING_ANNUAL_PRICE_ID` | Optional | Stripe Price ID for Founding Member annual. Maps to plan `PRO+`. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Root domain for checkout/portal return URLs (e.g. `https://yourdomain.com`). No trailing slash. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Used by webhook and analyze (usage_daily writes). |

## Public Routes and Stripe Verification

- **Do not** enable Vercel Password Protection, Deployment Protection, or Vercel Authentication on the production deployment. Stripe (and bots) need to reach `/` with no cookies and get the full landing page with no redirects.
- Public routes (no auth): `/`, `/pricing`, `/login`, `/terms`, `/privacy`, `/auth/callback`. API: `/api/stripe/webhook`.
- See `lib/publicRoutes.ts` for the allowlist. Middleware must not redirect these paths.

## Stripe Dashboard Setup

1. **Products & prices**
   - Create Products for each tier (Starter, Analyst, Fund, Founding Member).
   - Add monthly and/or annual recurring Prices per product.
   - Copy Price IDs to the corresponding env vars.

2. **Customers**
   - Customers are created on first checkout via `POST /api/billing/create-checkout-session`; no manual creation needed.

3. **Webhooks**
   - Developers -> Webhooks -> Add endpoint.
   - URL: `https://your-app.vercel.app/api/stripe/webhook`.
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   - Copy the signing secret -> `STRIPE_WEBHOOK_SECRET`.

4. **Billing portal**
   - Settings -> Billing -> Customer portal: configure as needed (e.g. allow cancel, plan switching).

## Supabase

- `organizations.plan` is the source of truth for entitlements; webhook sets it.
- `organizations.trial_ends_at` and `organizations.trial_plan` enable the 7-day trial overlay.
- Price-to-plan mapping: `lib/stripeWebhookPlan.ts` (handles both monthly and annual price IDs).

## API Routes

- **POST /api/billing/create-checkout-session** (auth required): Creates Stripe checkout session. Accepts `{ plan, workspace_id, interval }` where interval is `"monthly"` or `"annual"`.
- **POST /api/stripe/portal** (auth required): Returns Billing portal session URL.
- **POST /api/stripe/webhook** (no auth; verify Stripe signature): Updates `organizations.plan` and clears trial fields on subscription activation.

## Enforcement

- **Scan cap:** `monthly_scan_usage` table with `upsert_monthly_scan_usage` RPC for atomic counting. PRO = 10/month. Enforced in scan route before OpenAI call.
- **Lifetime cap:** FREE = 3 scans, enforced by `create_deal_scan_with_usage_check` RPC (trial-aware since migration 062).
- **Trial:** Entitlements layer resolves trial overlay. RPC also trial-aware to prevent FREE cap blocking trial users.
