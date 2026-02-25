# CRE Signal Engine — Release Checklist

Use this checklist before deploying to production.

## Pre-deploy

- [ ] **Migrations**  
  Apply all Supabase migrations in order (including `017_deal_signal_links_unique_idempotent.sql` so `deal_signal_links` has `UNIQUE(deal_risk_id, signal_id)`).

- [ ] **Build**  
  Run `npm run build` and fix any TypeScript or build errors. (Local build may need network for Google Fonts; Vercel has it. Resend is lazy-initialized so `RESEND_API_KEY` is optional at build time.)

- [ ] **Env**  
  Confirm production env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, `RESEND_API_KEY` (if using digest or workspace invites).

## Security & RLS

- [ ] **RLS**  
  Members can access only org-scoped data; non-members are blocked. No client-side service role.

- [ ] **Auth**  
  Default org bootstrap runs server-side after auth callback (service role); `profiles.current_org_id` is set correctly.

## Smoke test (critical path)

1. **Signup** → New user can register and land in app.
2. **Org bootstrap** → After auth callback, user has one org and is member; `current_org_id` is set.
3. **Create deal** → Create a deal from `/app/deals/new`.
4. **Scan** → Run deal scan (no force); idempotency by `input_text_hash` works (same input = reuse).
5. **Rescan (Fresh)** → Click "Rescan (Fresh)"; request uses `POST /api/deals/scan` with `body.force === 1`; new scan is created.
6. **Overlay** → After scan, overlay runs; `deal_signal_links` has no duplicate `(deal_risk_id, signal_id)` rows.
7. **IC Summary** → Deal page → IC Summary tab shows snapshot, risks, linked signals, recommended actions.
8. **IC narrative** → Generate IC Memorandum Narrative (Pro); Free sees paywall/redaction.
9. **Upgrade** → Billing/Stripe: upgrade to Pro; webhook sets `profiles.role`; Pro features unlock.

## Rescan behavior (reference)

- **Normal scan**  
  `POST /api/deals/scan` with `{ deal_id }` (no `force`). Uses `input_text_hash` idempotency; reuses completed scan if same input and within 24h.

- **Rescan (Fresh)**  
  `POST /api/deals/scan` with `{ deal_id, force: 1 }`. Skips idempotency; always creates a new scan.

## Post-deploy

- [ ] **Usage**  
  Check `usage_daily` and deal scan limits; 429 when at limit.

- [ ] **Workspace**  
  Pro: invite by email → accept link → member appears in workspace; Free: single-user only.
