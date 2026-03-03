# Phase 4 Patches 1–4 — What Was Added (Reference)

Quick reference for files created or modified for the Institutional Alignment Patch (Patches 1–4). Plan: `.cursor/plans/institutional_alignment_patch_56d3c298.plan.md`.

---

## PATCH 1 — risk_score_history transactional integrity + hardening

| Item | Change |
|------|--------|
| **New** `supabase/migrations/043_risk_score_history_unique_scan_id.sql` | Adds `UNIQUE(scan_id)` on `risk_score_history`; removes duplicate rows first. Enables idempotent `ON CONFLICT (scan_id) DO NOTHING` in RPC. |
| **New** `supabase/migrations/044_finalize_scan_risk_and_history.sql` | Defines RPC `finalize_scan_risk_and_history( p_scan_id, p_deal_id, p_score, p_band, p_completed_at, p_breakdown, p_version, p_macro_linked_count, p_percentile, p_snapshot_id )`. In one transaction: (1) UPDATE `deal_scans` with risk_index_* and completed_at; (2) INSERT into `risk_score_history` with `ON CONFLICT (scan_id) DO NOTHING`. Logs history failure via NOTICE only; does not re-raise. |
| **Modified** `app/api/deals/scan/route.ts` | After computing score/band/breakdown, calls `service.rpc("finalize_scan_risk_and_history", { ... })` instead of directly updating `deal_scans` and inserting into `risk_score_history`. Logs RPC errors as non-fatal. |

---

## PATCH 2 — Methodology lock scope + portfolio context

| Item | Change |
|------|--------|
| **Modified** `lib/entitlements/errors.ts` | Added error codes: `PORTFOLIO_VIEW_NOT_FOUND`, `PORTFOLIO_CONTEXT_FORBIDDEN`. |
| **Modified** `app/api/deals/scan/route.ts` | Request body accepts optional `portfolio_view_id`. **If absent:** no lock check; scan proceeds. **If present:** loads portfolio view by id; enforces `portfolio_view.organization_id === deal.organization_id`; returns 404 `PORTFOLIO_VIEW_NOT_FOUND` if view missing, 403 `PORTFOLIO_CONTEXT_FORBIDDEN` if org mismatch; only then enforces `locked_method_version` vs `RISK_INDEX_VERSION` (403 `METHOD_VERSION_LOCKED` unless override; on override writes to `governance_decision_log`). |

---

## PATCH 3 — Invite entitlement alignment + member cap concurrency

| Item | Change |
|------|--------|
| **Modified** `app/api/org/invite/route.ts` | When at member cap (`count >= maxMembers`), 403 response now includes `required_plan`: `"PRO+"` when plan is PRO, `"ENTERPRISE"` when plan is PRO+. Uses `plan` from `getWorkspacePlanAndEntitlementsForUser`. |
| **New** `supabase/migrations/045_accept_organization_invite_with_cap.sql` | Defines RPC `accept_organization_invite_with_cap( p_invite_id, p_user_id )`. In one transaction: lock org FOR UPDATE; get plan and max members; if at cap return `(ok=false, code=MEMBER_LIMIT_REACHED, required_plan)`; else INSERT into `organization_members`, UPDATE `organization_invites` (status=accepted, accepted_at), return ok. |
| **Modified** `app/api/invite/accept/route.ts` | After validating token/email, calls `service.rpc("accept_organization_invite_with_cap", { p_invite_id, p_user_id })` instead of counting members and inserting/updating in the route. On RPC `ok=false` and `code=MEMBER_LIMIT_REACHED`, returns 403 with `required_plan` in body. Removed direct `organization_members` insert and `organization_invites` update. Removed unused import `getWorkspacePlanAndEntitlements`. |

---

## PATCH 4 — Pricing page and copy alignment

| Item | Change |
|------|--------|
| **Modified** `app/pricing/types.ts` | Added `"pro_plus"` to `PricingDisplayPlan` type. |
| **Modified** `app/pricing/page.tsx` | `displayPlan`: uses workspace plan only for PRO/PRO+/ENTERPRISE (no profile "pro" fallback); maps PRO+ to `"pro_plus"`. FREE section: added bullet "1 workspace member (creator only); no collaboration". PRO section: "Workspace collaboration (up to 5 members)" → "Up to 5 workspace members". **New PRO+ section:** $499/workspace/mo, up to 10 members, 3 policies, trajectory, governance export; uses `PricingClient` with `slot="pro_plus"`. |
| **Modified** `app/pricing/PricingClient.tsx` | Slot type extended to `"pro" | "pro_plus" | "enterprise"`. New branch for `slot === "pro_plus"`: Manage billing when `displayPlan === "pro_plus"`; "Included" copy for platform_admin/enterprise; "Upgrade to PRO+" button otherwise. |
| **Modified** `app/settings/workspace/page.tsx` | Uses `getWorkspacePlanAndEntitlementsForUser(service, orgId, user.id)` instead of `getEntitlementsForUser`; derives `memberLimitLabel` ("Up to N workspace members included" or "Unlimited members"); passes `memberLimitLabel` to `WorkspaceClient`; plan display shows workspace plan (FREE/PRO/PRO+/ENTERPRISE) and member limit label. |
| **Modified** `app/settings/workspace/WorkspaceClient.tsx` | Accepts optional prop `memberLimitLabel`; heading "Members" → "Workspace members" with optional suffix "· {memberLimitLabel}". |

---

## Micro-tweaks (optional)

| Item | Change |
|------|--------|
| **Pricing displayPlan test** | **New** `lib/pricingDisplayPlan.ts`: `getDisplayPlan(profilePlan, workspacePlan)` — single source of truth for pricing UI state. **New** `lib/pricingDisplayPlan.test.ts`: unit tests that PRO+ workspace ⇒ `pro_plus`, etc. **New** `app/pricing/PricingClient.test.tsx`: UI test (jsdom) — when `displayPlan="pro_plus"` and `slot="pro_plus"`, shows "Manage billing" and does not show "Upgrade to PRO+"; when `displayPlan="free"`, shows "Upgrade to PRO+". **Modified** `app/pricing/page.tsx`: uses `getDisplayPlan()` from lib. Prevents regressions when refactoring UI. |
| **Webhook unmatched / unknown price visibility** | **Modified** `app/api/stripe/webhook/route.ts`: Always writes to `stripe_webhook_audit` when price is unknown (`unknown_price_id`) or missing (`missing_price_id`) on subscription created/updated, so config mistakes can be diagnosed from the audit table without reading logs. |

---

## Summary table

| Patch | New files | Modified files |
|-------|-----------|----------------|
| 1 | `043_risk_score_history_unique_scan_id.sql`, `044_finalize_scan_risk_and_history.sql` | `app/api/deals/scan/route.ts` |
| 2 | — | `lib/entitlements/errors.ts`, `app/api/deals/scan/route.ts` |
| 3 | `045_accept_organization_invite_with_cap.sql` | `app/api/org/invite/route.ts`, `app/api/invite/accept/route.ts` |
| 4 | — | `app/pricing/types.ts`, `app/pricing/page.tsx`, `app/pricing/PricingClient.tsx`, `app/settings/workspace/page.tsx`, `app/settings/workspace/WorkspaceClient.tsx` |
| Micro-tweaks | `lib/pricingDisplayPlan.ts`, `lib/pricingDisplayPlan.test.ts`, `app/pricing/PricingClient.test.tsx` | `app/pricing/page.tsx`, `app/api/stripe/webhook/route.ts` |
