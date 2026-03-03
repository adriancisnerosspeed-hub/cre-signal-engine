# Phase 4 — Institutional Alignment Patch (Implementation Summary)

This document describes the **Institutional Alignment Patch** and the **final hardening pass**: predictability and governance correctness fixes without new product features. No changes to core risk scoring or benchmark math; additive changes only unless explicitly noted as behavior fixes. Deterministic architecture and structured error codes are preserved.

**Single plan:** Alignment + hardening are in one plan: `.cursor/plans/institutional_alignment_patch_56d3c298.plan.md`.

**Related:** `docs/INSTITUTIONAL_EXECUTION_PLAN.md`, `docs/BILLING.md`, `docs/BENCHMARK_PRICING_WORKSPACE_QA.md`.

---

## Scope Overview

| Patch | Goal | Status |
|-------|------|--------|
| **PATCH 1** | risk_score_history in same DB transaction as scan finalization | Done |
| **PATCH 2** | Methodology version lock scoped to portfolio context only | Done |
| **PATCH 3** | Invite entitlement alignment (PRO/PRO+/Enterprise; member cap + required_plan) | Done |
| **PATCH 4** | Pricing page + copy alignment (no “per seat”; PRO/PRO+/Enterprise copy) | Done |
| **Roles & copy** | Platform vs workspace roles; "workspace members" copy; permission order | Done |
| **PATCH 1 hardening** | UNIQUE(scan_id); RPC logs history insert failure; retry idempotent (no duplicate history) | Done |
| **PATCH 2 hardening** | Enforce portfolio_view.organization_id === deal.organization_id; reject foreign portfolio_view_id | Done |
| **PATCH 3 hardening** | Member cap concurrency: invite accept in transaction with lock; test two parallel accepts | Done |
| **Roles hardening** | profiles.role cleanup: remove free/pro; only platform_admin, platform_dev, platform_support, user; entitlements only bypass from profile | Done |
| **Health hardening** | Authenticated detailed health only for platform_admin OR workspace OWNER; MEMBER gets { ok: true } only | Done |

---

## PATCH 1 — risk_score_history transactional integrity

**Goal:** Ensure `risk_score_history` is written in the same DB transaction as the scan result (score/band persistence) so history stays consistent. History insert must not fail the scan (best-effort inside transaction).

**Current behavior:** `app/api/deals/scan/route.ts` inserts into `risk_score_history` after the RPC and after computing risk index (post-`runOverlay`). Insert is best-effort (non-fatal) but outside the same transaction as the scan row and its risk_index_* update.

**Planned implementation:**

- **Idempotency:** UNIQUE(scan_id) on risk_score_history + `INSERT ... ON CONFLICT (scan_id) DO NOTHING` for history. deal_scans update always executes regardless of history conflict.
- **Single completed_at:** One `p_completed_at` input; write consistently to both deal_scans and risk_score_history.
- Add RPC `finalize_scan_risk_and_history` that in one transaction: (1) UPDATE deal_scans with risk_index_* and completed_at (always runs); (2) INSERT into risk_score_history with ON CONFLICT (scan_id) DO NOTHING. On history conflict/failure: RAISE NOTICE only; do not re-raise.
- Scan route: after computing score/band and completed_at, call this RPC; remove direct deal_scans update and risk_score_history insert from the route.
- **Tests:** When scan succeeds, history row exists. Retry RPC does not create duplicate history.

**Files to add/change:**

- New migration (e.g. `043_finalize_scan_risk_and_history.sql`) defining the RPC.
- `app/api/deals/scan/route.ts`: call finalize RPC; remove client-side history insert and move deal_scans risk_index_* update into RPC or keep single update path via RPC.

---

## PATCH 2 — Methodology version lock scope fix

**Goal:** Lock applies only when the user is scanning **within** a locked portfolio context, not globally for the org.

**Current behavior:** Scan route blocks any scan if **any** `portfolio_view` in the org has `locked_method_version` set and different from `RISK_INDEX_VERSION`.

**Planned implementation:**

- Add optional `portfolio_view_id` to scan request body.
- **If `portfolio_view_id` is not provided:** do not run the lock check; scan proceeds.
- **If `portfolio_view_id` is provided:** load that portfolio view. Enforce `portfolio_view.organization_id === deal.organization_id`. Return deterministic errors: **404** `{ code: "PORTFOLIO_VIEW_NOT_FOUND" }` if view not found or not visible; **403** `{ code: "PORTFOLIO_CONTEXT_FORBIDDEN" }` if org mismatch. Only then, if `locked_method_version` set and differs from `RISK_INDEX_VERSION`, return 403 `METHOD_VERSION_LOCKED` unless `override_method_lock`; on override write to governance_decision_log.
- Lock only when portfolio_view_id is present.
- **Tests:** Org has locked view, scan without `portfolio_view_id` → not blocked. Foreign portfolio_view_id → 404 or 403 per above. Valid same-org view with locked version mismatch → 403 unless override.
- Add error codes to `lib/entitlements/errors.ts` (or scan route): `PORTFOLIO_VIEW_NOT_FOUND`, `PORTFOLIO_CONTEXT_FORBIDDEN`.

**Files to change:**

- `app/api/deals/scan/route.ts`: accept optional `portfolio_view_id`; run lock check only when provided and view is locked.
- Callers (e.g. deal detail page) may omit `portfolio_view_id`; future “scan from portfolio” flows can pass it.

---

## PATCH 3 — Invite entitlement alignment

**Decision:** Invites allowed for PRO, PRO+, and ENTERPRISE. FREE cannot invite. Not Enterprise-only.

**Implemented / to complete:**

- **Invite route** (`app/api/org/invite/route.ts`): FREE → 403 with “Workspace invites require a paid plan” and `required_plan: "PRO"`. Member cap: when `count >= maxMembers`, return 403 with `code: "MEMBER_LIMIT_REACHED"` and `required_plan: "PRO+"` when current plan is PRO, or `required_plan: "ENTERPRISE"` when current plan is PRO+.
- **Invite accept:** RPC `accept_organization_invite_with_cap` in one transaction: lock org FOR UPDATE; count; enforce cap; insert membership; mark invite accepted. Route calls RPC; 403 MEMBER_LIMIT_REACHED with required_plan when at cap. **Integration test:** two parallel accepts at cap — one succeeds, one 403; final count == maxMembers.
- **UI:** No “seats”; use “workspace members”, “Up to 5 members included”, “Up to 10 members included” (see PATCH 4).

**Files:**

- `app/api/org/invite/route.ts`: ensure `required_plan` is set when returning `MEMBER_LIMIT_REACHED` (PRO+ when on PRO, ENTERPRISE when on PRO+).
- `app/api/invite/accept/route.ts`: ensure `required_plan` in 403 body when at member cap.
- `lib/entitlements/errors.ts`: already defines `required_plan?: "PRO" | "PRO+" | "ENTERPRISE"`.

---

## PATCH 4 — Pricing page and copy alignment + Stripe

**Goal:** Pricing and settings copy match enforced entitlements exactly; remove all "seats" language. Confirm Stripe webhook supports PRO+ and sets organizations.plan after checkout. no “per seat”; explicit member and policy limits.

**Planned implementation:**

- **Pricing page** (`app/pricing/page.tsx`): Fix any `plan` vs `displayPlan` variable bugs. Ensure:
  - **FREE:** No collaboration; 1 workspace member (creator); 3 lifetime scans; etc.
  - **PRO — $299/workspace/mo:** Up to 5 workspace members; 1 active governance policy; unlimited scans; benchmark; export; etc.
  - **PRO+ — $499/workspace/mo:** Up to 10 workspace members; up to 3 active governance policies; risk trajectory; governance export; plus PRO features. Add or clarify PRO+ section if missing.
  - **ENTERPRISE:** Unlimited members; cohort creation; snapshot build; API access; custom pricing.
  - Remove any “per seat” or “seats” wording.
- **Settings / workspace UI** (`app/settings/workspace/`): Use “Workspace members”, “Up to 5 members included” (PRO), “Up to 10 members included” (PRO+), “Unlimited members” (Enterprise).

**Files:**

- `app/pricing/page.tsx`
- `app/settings/workspace/WorkspaceClient.tsx`, `app/settings/workspace/page.tsx`

---

## Workspace member model (finalized)

- **Pricing:** Workspace-based; not per seat.
- **Invites:** PRO, PRO+, ENTERPRISE (FREE cannot invite).
- **FREE:** maxMembers = 1 (creator only). No invites.
- **PRO:** maxMembers = 5.
- **PRO+:** maxMembers = 10.
- **ENTERPRISE:** Unlimited members.

**Enforcement:** Server-side member cap on invite creation and invite accept; 403 `MEMBER_LIMIT_REACHED` with `required_plan` when at cap. UI uses “workspace members” and “Up to N members included” only.

---

## Role system architecture (finalized)

**Separation:**

- **Platform roles** (`profiles.role`): platform_admin, platform_dev, platform_support, user (default). Not exposed in workspace UI. Used for bypass and internal access.
- **Workspace roles** (`organization_members.role`): OWNER, ADMIN, MEMBER. Used for workspace permissions only.

**Permission order:**

1. If `profiles.role === 'platform_admin'` → bypass entitlements and workspace role checks (see `lib/entitlements/workspace.ts`).
2. Else: resolve workspace plan and workspace role; enforce entitlements then role permission.
3. Do not mix platform and workspace roles in checks; do not expose platform_admin to normal users.

**Implementation notes:**

- Migration `035_role_system_refactor.sql` already defines workspace roles as OWNER/ADMIN/MEMBER and profiles as free/pro/platform_admin. Optional follow-up: extend `profiles.role` to include platform_dev, platform_support, user (default) and migrate free → user if product decision is to standardize on “user” as default.
- `getPlanForUser` (lib/entitlements.ts): platform_admin → bypass; others use workspace plan for entitlements.
- **Hardening (045):** Migrate free/pro → user, owner → platform_admin (if present). Code must not rely on free/pro for entitlements (workspace plan only; platform_admin bypass only).

---


## Final hardening pass (summary)

- **risk_score_history:** Add UNIQUE(scan_id) (migration 044). RPC finalize_scan_risk_and_history logs history insert failure (RAISE NOTICE); use ON CONFLICT (scan_id) DO NOTHING so retry creates no duplicate. Test: retry RPC does not create duplicate history.
- **Portfolio method lock:** Enforce portfolio_view.organization_id === deal.organization_id. Deterministic errors: 404 PORTFOLIO_VIEW_NOT_FOUND if view not visible; 403 PORTFOLIO_CONTEXT_FORBIDDEN if org mismatch. Lock only when portfolio_view_id is provided. Test: foreign portfolio_view_id rejected.
- **Member cap concurrency:** RPC accept_organization_invite_with_cap: lock org FOR UPDATE; count; enforce cap; insert membership; mark invite accepted in one transaction. Integration test: two parallel accepts at cap — one succeeds, one 403 MEMBER_LIMIT_REACHED; final count == maxMembers.
- **profiles.role cleanup:** Migrate free/pro → user, owner → platform_admin (if present). Allowed: platform_admin, platform_dev, platform_support, user. Code does not rely on free/pro for entitlements (workspace plan only; platform_admin bypass only).
- **Health endpoint:** Authenticated detailed health (database_ok, stripe_configured, workspace_plan, latest_method_version) only for platform_admin OR workspace OWNER. Regular MEMBER gets { ok: true } only. Test: MEMBER cannot access system details.

**Schema changes (hardening):** 043 risk_score_history UNIQUE(scan_id); 044 RPC finalize_scan_risk_and_history; 045 RPC accept_organization_invite_with_cap; 046 profiles.role cleanup (user/platform_admin/platform_dev/platform_support).


## QA checklist

- [x] No global scan blocking due to unrelated locked portfolio view (after PATCH 2).
- [x] History consistent with scans; no missing points (after PATCH 1).
- [x] Invite flow matches entitlements; FREE cannot invite; PRO/PRO+ caps enforced; required_plan returned.
- [ ] All tests pass.
- [x] No “seats” in UI; “workspace members” and “Up to N members included” used.
- [x] platform_admin bypass works; permission checks deterministic; structured error responses.
- [x] risk_score_history UNIQUE(scan_id); retry creates no duplicate history.
- [x] Foreign portfolio_view_id rejected; lock only when portfolio_view_id provided.
- [x] Invite accept at cap: transaction with lock; two parallel accepts → one succeeds, one 403.
- [x] profiles.role cleanup done; entitlements only bypass from profile.
- [x] Health detailed response only for platform_admin or OWNER; MEMBER gets { ok: true } only.

---

## Files added or modified (summary)

| Area | File(s) | Change |
|------|---------|--------|
| PATCH 1 | New migration `043_*` | RPC finalize_scan_risk_and_history |
| PATCH 1 | `app/api/deals/scan/route.ts` | Call finalize RPC; remove client-side history insert |
| PATCH 2 | `app/api/deals/scan/route.ts` | Optional portfolio_view_id; 404 PORTFOLIO_VIEW_NOT_FOUND, 403 PORTFOLIO_CONTEXT_FORBIDDEN; lock only when provided |
| PATCH 3 | `app/api/org/invite/route.ts` | required_plan on MEMBER_LIMIT_REACHED |
| PATCH 3 | `app/api/invite/accept/route.ts` | required_plan on MEMBER_LIMIT_REACHED |
| PATCH 4 | `app/pricing/page.tsx` | displayPlan fix; PRO/PRO+/Enterprise copy; no seats |
| PATCH 4 | `app/settings/workspace/*` | “Workspace members” copy |
| PATCH 4 / Stripe | app/api/stripe/webhook/route.ts | Confirm PRO+ mapping and organizations.plan set after checkout |
| Roles | Migrations / lib/entitlements.ts | profiles.role set and getPlanForUser if extended |
| PATCH 1 hardening | New migration 043, 044 | risk_score_history UNIQUE(scan_id); RPC finalize_scan_risk_and_history |
| PATCH 2 hardening | app/api/deals/scan/route.ts | portfolio_view org check; reject foreign view |
| PATCH 3 hardening | New migration (RPC) | accept_organization_invite_with_cap; app/api/invite/accept/route.ts |
| Roles hardening | Migration 046, lib/entitlements.ts, lib/auth.ts | profiles.role cleanup; bypass only from profile |
| Health hardening | app/api/health/route.ts | Detailed health only for platform_admin or OWNER |
| Docs | This file | Phase 4 implementation summary |

---

*Document created as the Phase 4 / Institutional Alignment Patch summary. Alignment + hardening are in one plan: .cursor/plans/institutional_alignment_patch_56d3c298.plan.md. Update the “Status” column and checklist as each patch is completed.*
