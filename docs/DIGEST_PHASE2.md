# Phase 2: Timezone-Aware Daily Digest

## Required environment variables

- **RESEND_API_KEY** – Resend API key for sending email. Get it from [Resend](https://resend.com). For testing you can use their onboarding domain.
- **CRON_SECRET** – Random secret (e.g. `openssl rand -hex 32`) used to authenticate cron requests. Set in Vercel so Vercel sends `Authorization: Bearer <CRON_SECRET>` when invoking the cron.
- **SUPABASE_SERVICE_ROLE_KEY** – Used only by the cron job to read `user_preferences` and resolve user emails. Set in Vercel (and optionally locally for testing cron).
- **SUPABASE_URL** or **NEXT_PUBLIC_SUPABASE_URL** – Used by the service-role client in cron.
- **NEXT_PUBLIC_APP_URL** (optional) – Base URL of the app (e.g. `https://your-app.vercel.app`) for links in digest emails.

Optional:

- **RESEND_FROM** – Override sender (default: `CRE Signals <onboarding@resend.dev>`).

## Supabase dashboard steps

1. Run the migration **003_digest_preferences_and_sends.sql** in SQL Editor (copy from `supabase/migrations/003_digest_preferences_and_sends.sql`).
2. No need to reload schema cache for these tables; RLS is enabled and policies are in place.

## Vercel cron setup and redeploy

1. Add env vars in Vercel: **RESEND_API_KEY**, **CRON_SECRET**, **SUPABASE_SERVICE_ROLE_KEY**, and **SUPABASE_URL** (if not already set).
2. Deploy. The `vercel.json` cron runs **every 5 minutes** and calls `GET /api/cron/digest`. Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
3. For manual testing: `GET /api/cron/digest?secret=YOUR_CRON_SECRET`.
