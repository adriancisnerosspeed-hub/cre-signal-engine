# Billing (Stripe + Entitlements)

## Overview

- **Free**: 10 analyzes/day, manual digest (up to 6 signals), no scheduled digest.
- **Pro**: 200 analyzes/day, manual + scheduled digest, up to 12 signals per email.
- **Owner** (OWNER_EMAIL): Bypasses limits; same as Pro for features.

Plan is stored in `profiles.role` (`free` | `pro` | `owner`). Stripe webhook updates `profiles.role` when a subscription is created/updated/deleted.

## Environment variables (Vercel / .env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (server-only). |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret for `POST /api/stripe/webhook`. |
| `STRIPE_PRICE_ID_PRO` | Yes | Stripe Price ID for Pro monthly (e.g. `price_xxx`). |
| `NEXT_PUBLIC_APP_URL` | Recommended | Base URL for checkout/portal return URLs. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Used by webhook and analyze (usage_daily writes). |
| `OWNER_EMAIL` | Optional | Email that gets owner role (bypass). |

## Stripe Dashboard setup

1. **Products & prices**
   - Create a Product (e.g. "CRE Signal Engine Pro").
   - Add a recurring Price (monthly), copy the Price ID → `STRIPE_PRICE_ID_PRO`.

2. **Customers**
   - Customers are created on first checkout via `POST /api/stripe/checkout`; no manual creation needed.

3. **Webhooks**
   - Developers → Webhooks → Add endpoint.
   - URL: `https://your-app.vercel.app/api/stripe/webhook`.
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

4. **Billing portal**
   - Settings → Billing → Customer portal: configure as needed (e.g. allow cancel).

## Supabase

1. Run migration **004_billing_stripe_usage.sql** (creates `stripe_customers`, `subscriptions`, `usage_daily`; RLS as in the file).
2. `profiles.role` is the source of truth for plan; webhook sets it to `pro` or `free`.

## API routes

- **POST /api/stripe/checkout** (auth required): Creates or reuses Stripe customer, returns Checkout session URL for Pro.
- **POST /api/stripe/portal** (auth required): Returns Billing portal session URL.
- **POST /api/stripe/webhook** (no auth; verify Stripe signature): Updates `subscriptions` and `profiles.role`.

## Enforcement

- **Analyze**: Before running, checks `usage_daily` for today; if `analyze_calls >= entitlements.analyze_calls_per_day` returns 429 with `upgrade_url`.
- **Digest manual send**: Allowed for Free (cap 6 signals). Uses `entitlements.email_digest_max_signals`.
- **Digest scheduled (cron)**: Only users with `profiles.role` in (`pro`, `owner`) are processed; others are skipped and logged.

## Manual test checklist

1. **Free daily limit**: As free user, call analyze 11 times in a day → 11th returns 429 with upgrade CTA.
2. **Checkout**: Click Upgrade to Pro → completes Stripe Checkout → webhook sets `profiles.role` to `pro`.
3. **Pro analyze**: As Pro, exceed 10 analyzes in a day → requests succeed up to 200.
4. **Scheduled digest**: Set digest time; run cron; Free user skipped (log), Pro user receives email.
5. **Billing portal**: As Pro, click Manage billing → Stripe portal opens; can cancel.
6. **Cancel → free**: After canceling, when subscription ends (or webhook `customer.subscription.deleted`), `profiles.role` is set back to `free`.
