# Phase 4 — What Was Implemented

This document summarizes **what was added or changed** to complete the Institutional Alignment Patch and final hardening pass. It complements `docs/PHASE4_IMPLEMENTATION.md` (which defines scope and status) by describing the concrete implementation.

**Reference:** `.cursor/plans/institutional_alignment_patch_56d3c298.plan.md`, `docs/INSTITUTIONAL_EXECUTION_PLAN.md`, `docs/BILLING.md`.

---

## 1. Risk score history (PATCH 1 + hardening)

**Goal:** Write `risk_score_history` in the same DB transaction as scan finalization; no duplicate history on retry.

**Implemented:**

- **Migration 043** (`043_risk_score_history_unique_scan_id.sql`): `UNIQUE(scan_id)` on `risk_score_history` so `INSERT ... ON CONFLICT (scan_id) DO NOTHING` is idempotent.
- **Migration 044** (`044_finalize_scan_risk_and_history.sql`): RPC `finalize_scan_risk_and_history` that in one transaction (1) updates `deal_scans` with `risk_index_*` and `completed_at`, (2) inserts into `risk_score_history` with `ON CONFLICT (scan_id) DO NOTHING`. History insert failure is logged via `RAISE NOTICE` only and does not fail the transaction.
- **Scan route** (`app/api/deals/scan/route.ts`): After computing score/band and `completed_at`, calls `finalize_scan_risk_and_history`; no client-side `deal_scans` risk update or `risk_score_history` insert.

---

## 2. Methodology version lock scope (PATCH 2 + hardening)

**Goal:** Lock applies only when scanning **within** a locked portfolio context; reject foreign `portfolio_view_id`.

**Implemented:**

- **Scan route** (`app/api/deals/scan/route.ts`):
  - Optional `portfolio_view_id` in request body.
  - If `portfolio_view_id` is **absent**: lock check is skipped; scan proceeds.
  - If `portfolio_view_id` is **present**: load portfolio view; enforce `portfolio_view.organization_id === deal.organization_id`. Return **404** `PORTFOLIO_VIEW_NOT_FOUND` if view not found; **403** `PORTFOLIO_CONTEXT_FORBIDDEN` if org mismatch. Only then, if `locked_method_version` is set and differs from `RISK_INDEX_VERSION`, return 403 `METHOD_VERSION_LOCKED` unless `override_method_lock`; on override, write to `governance_decision_log`.
- **Error codes** in `lib/entitlements/errors.ts`: `PORTFOLIO_VIEW_NOT_FOUND`, `PORTFOLIO_CONTEXT_FORBIDDEN`.

---

## 3. Invite entitlement alignment (PATCH 3 + hardening)

**Goal:** Invites for PRO, PRO+, ENTERPRISE only; member cap enforced with `required_plan` on `MEMBER_LIMIT_REACHED`; accept at cap is atomic.

**Implemented:**

- **Invite route** (`app/api/org/invite/route.ts`): FREE → 403 with “Workspace invites require a paid plan” and `required_plan: "PRO"`. When at member cap, 403 `MEMBER_LIMIT_REACHED` with `required_plan: "PRO+"` (when on PRO) or `"ENTERPRISE"` (when on PRO+).
- **Migration 045** (`045_accept_organization_invite_with_cap.sql`): RPC `accept_organization_invite_with_cap(p_invite_id, p_user_id)` — in one transaction locks org `FOR UPDATE`, counts members, enforces cap, inserts into `organization_members`, marks invite accepted. Returns `(ok, code, required_plan)`; at cap returns `ok=false`, `code=MEMBER_LIMIT_REACHED`, `required_plan`.
- **Invite accept route** (`app/api/invite/accept/route.ts`): Validates token/email then calls RPC; returns 403 with `required_plan` when RPC returns at cap.

---

## 4. Pricing and copy alignment (PATCH 4)

**Goal:** No “per seat” language; PRO/PRO+/Enterprise copy; “workspace members” and “Up to N members included.”

**Implemented:**

- **Pricing page** (`app/pricing/page.tsx`): FREE (1 workspace member, 3 lifetime scans, no collaboration), PRO ($299/workspace/mo, up to 5 workspace members, 1 policy), PRO+ ($499/workspace/mo, up to 10 members, 3 policies, trajectory, governance export), ENTERPRISE (unlimited members, cohort/snapshot/API). Display uses `displayPlan` from workspace plan; `profilePlan` from `getPlanForUser` used only for platform_admin bypass display.
- **Workspace settings** (`app/settings/workspace/page.tsx`, `WorkspaceClient.tsx`): Member limit label “Up to N members included” (or “Unlimited members”); invite section copy “Workspace invites require a paid plan”; workspace collaboration blurb aligned to same wording. No “seats” anywhere.

---

## 5. Roles and copy (platform vs workspace)

**Goal:** Clear separation of platform roles and workspace roles; consistent “workspace members” copy and permission order.

**Implemented:**

- **Workspace UI copy:** “Workspace members,” “Up to 5 members included,” “Up to 10 members included,” “Unlimited members,” “Workspace invites require a paid plan” (see above).
- **Permission order:** (1) `profiles.role === 'platform_admin'` → bypass in `getWorkspacePlanAndEntitlementsForUser`; (2) else workspace plan and workspace role drive entitlements and permissions. No mixing of platform and workspace roles in checks; platform roles not exposed in workspace UI.

---

## 6. Roles hardening (profiles.role cleanup)

**Goal:** Remove legacy `free`/`pro` from `profiles.role`; only `platform_admin`, `platform_dev`, `platform_support`, `user`; entitlements depend only on workspace plan except platform_admin bypass.

**Implemented:**

- **Migration 046** (`046_profiles_role_cleanup.sql`):
  - `UPDATE profiles SET role = 'user' WHERE role IN ('free', 'pro')`.
  - `UPDATE profiles SET role = 'platform_admin' WHERE role = 'owner'`.
  - Constraint `CHECK (role IN ('platform_admin', 'platform_dev', 'platform_support', 'user'))`, default `'user'`.
- **lib/auth.ts:**
  - `Role` type: `"platform_admin" | "platform_dev" | "platform_support" | "user"`.
  - `ensureProfile`: new users get `user`; OWNER_EMAIL gets `platform_admin`.
  - `canBypassRateLimit` and `canUseProFeature`: only `platform_admin`.
  - `getCurrentUserRole`: returns one of the four roles or `"user"` as fallback.
- **lib/entitlements.ts:**
  - `getPlanForUser` returns `PlatformPlan = "platform_admin" | "user"` (from `profiles.role`). Only `platform_admin` is treated as bypass; all others are `"user"` and use workspace plan for entitlements.
  - `getEntitlementsForUser`: uses `getPlanForUser`; platform_admin gets platform_admin entitlements, else free-level (workspace features use `getWorkspacePlanAndEntitlementsForUser`).
- **Route behavior:**
  - **Export PDF** (`app/api/deals/export-pdf/route.ts`): Uses `getWorkspacePlanAndEntitlementsForUser` for the deal’s org; allows export if `ownerBypass` or `entitlements.canUseSupportBundle` (no profile plan check).
  - **Scenario PATCH** (`app/api/deals/scans/[scanId]/route.ts`): Uses `getWorkspacePlanAndEntitlementsForUser`; allows if `ownerBypass` or `plan !== "FREE"`.
  - **Usage today** (`app/api/usage/today/route.ts`): Uses `getEntitlementsForUser` for limits (no direct `getEntitlements(plan)` with profile plan).
- **Portfolio page** (`app/app/portfolio/page.tsx`): `isFree` derived from workspace plan (`!ownerBypass && workspacePlan === "FREE"`) instead of profile plan; uses `getWorkspacePlanAndEntitlementsForUser` for plan and entitlements.
- **Pricing page** (`app/pricing/page.tsx`): `profilePlan` from `getPlanForUser` (so `"user"` when not platform_admin); display plan still from workspace plan for non–platform_admin users.

---

## 7. Health endpoint hardening

**Goal:** Detailed health response only for platform_admin or workspace OWNER; MEMBER gets `{ ok: true }` only.

**Implemented:**

- **app/api/health/route.ts:**
  - Resolves user; gets `platformPlan` from `getPlanForUser` and, if not platform_admin, workspace role for current org.
  - If not platform_admin **and** not OWNER in current org → return `{ ok: true }` only.
  - If platform_admin or OWNER → return full payload: `ok`, `database_ok`, `stripe_configured`, `workspace_plan`, `latest_method_version`.

---

## Files added

| File | Purpose |
|------|---------|
| `supabase/migrations/046_profiles_role_cleanup.sql` | profiles.role constraint and migration from free/pro/owner to user/platform_admin/... |

---

## Files modified (summary)

| Area | File(s) | Change |
|------|---------|--------|
| Roles & copy | `app/settings/workspace/page.tsx`, `WorkspaceClient.tsx` | Member label “Up to N members included”; invite copy “Workspace invites require a paid plan” |
| Roles hardening | `lib/auth.ts` | Role type; ensureProfile default user; canBypass/canUsePro only platform_admin |
| Roles hardening | `lib/entitlements.ts` | getPlanForUser → PlatformPlan; getEntitlementsForUser uses it |
| Export / scenario | `app/api/deals/export-pdf/route.ts`, `app/api/deals/scans/[scanId]/route.ts` | Use workspace entitlements instead of profile plan |
| Usage | `app/api/usage/today/route.ts` | Use getEntitlementsForUser |
| Portfolio | `app/app/portfolio/page.tsx` | isFree from workspace plan |
| Pricing | `app/pricing/page.tsx` | profilePlan fallback "user" when no user |
| Health | `app/api/health/route.ts` | Detailed response only for platform_admin or OWNER |
| Docs | `docs/PHASE4_IMPLEMENTATION.md` | Status and QA checklist updated |

---

## Migrations order

- **043** — `risk_score_history` UNIQUE(scan_id)
- **044** — RPC `finalize_scan_risk_and_history`
- **045** — RPC `accept_organization_invite_with_cap`
- **046** — profiles.role cleanup (user, platform_admin, platform_dev, platform_support)

Apply in numeric order. After 046, new users get `role = 'user'` by default; existing `free`/`pro` are migrated to `user`.

---

*This document reflects the implementation completed for Phase 4 (Institutional Alignment Patch + hardening). For scope and checklist, see `docs/PHASE4_IMPLEMENTATION.md`.*
