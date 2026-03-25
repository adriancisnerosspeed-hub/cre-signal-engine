# CRE Signal Engine - Obstacles & Friction Log

---

## Instructions For Future AI

This file is AI-facing project memory. Read it before doing substantial work.

- If a similar obstacle happens again, add a tick to the existing heading instead of creating a duplicate entry.
- If a previously hard thing becomes easy for the user, note the improvement under the relevant entry.
- Keep entries factual, short, and operational.
- Prefer "what failed -> what fixed it -> how to pre-empt it next time."

**Tick meaning:** more ticks = this has shown up repeatedly across sessions and should be pre-empted early.

**Critical user context:** the user is effectively non-technical for implementation purposes. They can approve direction, compare outcomes, and follow exact instructions, but they should not be expected to debug code, reason about migrations, or manually repair infra unless absolutely necessary.

---

## 1. User Operating Model

### 1a. User Does Best When AI Handles Nearly Everything End-To-End ✓✓✓✓
- **What happened:** Repeated sessions showed the user wants the AI to do the implementation, debugging, file edits, and command execution instead of pushing work back onto them.
- **Best fix:** Do the work directly whenever tooling allows. Only ask the user to do the parts that are truly external or permission-bound.
- **What explanation clicked:** Plain-English cause/effect plus exact commands or exact dashboard clicks when manual action is unavoidable.
- **Improvement observed:** The user has improved at judging product direction, spotting mismatches, and reviewing outputs, but not at low-level coding mechanics.
- **Pre-emption for future AI:** Default to a concierge workflow. Minimize manual coding steps, avoid "go paste this SQL" unless there is no CLI or API path, and separate "what I changed" from the rare "what you must do."

### 1b. CLI And Automation Are Strongly Preferred Over Manual Dashboards ✓✓✓
- **What happened:** Manual SQL editor workflows, dashboard-only steps, and repetitive hand-operated setup created major friction. The user explicitly called out Supabase CLI as a big improvement over manual migration pasting.
- **Best fix:** Use the CLI, scripts, cron routes, and automated flows whenever possible.
- **What explanation clicked:** "This replaces the manual dashboard step with one exact command."
- **Improvement observed:** The user now actively asks for automation-first solutions rather than accepting painful manual workflows.
- **Pre-emption for future AI:** Before asking the user to click through a dashboard, check whether the same thing can be done through repo code, CLI, API, or an existing script.

### 1c. Repeated Commands Need Narration, Not Silent Retries ✓
- **What happened:** The user became frustrated when commands or scripts were re-run without a clear explanation of why.
- **Best fix:** State why a rerun is needed before rerunning it.
- **What explanation clicked:** "I am rerunning this because the last failure came from X, and this checks whether Y is now fixed."
- **Pre-emption for future AI:** If you rerun a command, explain the reason in one sentence first.

---

## 2. Planning And Communication Friction

### 2a. Large Structured Tasks Work Best When Broken Into Plan -> Audit -> Implement ✓✓✓
- **What happened:** The most successful sessions used structured prompts with OBJECTIVE, numbered deliverables, acceptance criteria, or attached plan files. Unstructured large changes increased drift.
- **Best fix:** First audit what already exists, then implement only what is missing, then verify against acceptance criteria.
- **What explanation clicked:** A file-by-file or phase-by-phase map of what will change.
- **Improvement observed:** The user now often asks to compare "already implemented vs still missing" before coding, which reduces redundant work.
- **Pre-emption for future AI:** For multi-file work, mirror the structure of the spec, verify current repo state first, and avoid rewriting areas that already satisfy the request.

### 2b. "Do Not Edit The Plan File" Usually Means The Plan Is The Contract ✓✓
- **What happened:** Multiple sessions used an attached plan with explicit instructions to implement it without changing the plan itself.
- **Best fix:** Treat the plan as the execution contract and keep implementation scoped to it.
- **Pre-emption for future AI:** If a plan file is attached, follow it exactly unless the user explicitly asks for a plan revision.

### 2c. Short Confirmations Mean "Continue" ✓✓
- **What happened:** The user often responds with brief confirmations instead of detailed follow-up.
- **Best fix:** Treat short affirmations as approval to proceed.
- **Pre-emption for future AI:** Do not force extra clarification after a clear "yes," "go for it," or equivalent.

---

## 3. Schema, Migration, And Backfill Friction

### 3a. Migration Numbering And Repo Reality Drift Easily ✓✓✓
- **What happened:** Specs and plans sometimes referenced migration numbers that no longer matched the actual repo, and new work occasionally collided with existing numbering.
- **Best fix:** Check the current `supabase/migrations/` state before naming or sequencing anything.
- **What explanation clicked:** "The spec says X, but the repo already has that number, so we need the next available migration."
- **Pre-emption for future AI:** Never trust a proposed migration number without checking the repo first.

### 3b. Constraint And Function Changes Often Require Drop-Then-Recreate ✓✓
- **What happened:** Postgres changes failed when constraints or RPC return signatures were changed in place.
- **Best fix:** Drop the old constraint/function first, then recreate it in the new shape.
- **Pre-emption for future AI:** If a migration changes a function signature, return type, or an old CHECK constraint, assume you may need explicit `DROP FUNCTION` or constraint replacement.

### 3c. New Code Paths Do Not Automatically Fix Old Rows ✓✓
- **What happened:** Several features were correct for new writes but left old rows null, stale, or unbackfilled.
- **Best fix:** Decide explicitly whether the change is "new data only" or requires a backfill path.
- **What explanation clicked:** "This code fixes future writes, but existing rows remain unchanged unless we backfill them."
- **Pre-emption for future AI:** Call out backfill requirements explicitly whenever adding columns, audit logs, or derived fields.

### 3d. Idempotent Append-Only Patterns Reduce Pain ✓✓
- **What happened:** Audit/history style features were much safer once they used append-only tables with uniqueness or conflict protection.
- **Best fix:** Use patterns like `UNIQUE(scan_id)`, `ON CONFLICT DO NOTHING`, and append-only audit tables.
- **Pre-emption for future AI:** Prefer idempotent write paths for scan finalization, audit logs, history, invite acceptance, and webhook-driven data.

---

## 4. Build, Type, And Runtime Friction

### 4a. Cross-Cutting Features Frequently Trigger Nearby TypeScript Or Next.js Failures ✓✓✓
- **What happened:** Large changes often surfaced unrelated or adjacent type/build failures in UI files, tests, generated route types, or response handling.
- **Best fix:** Expect one verification pass after implementation and keep fixes surgical.
- **Pre-emption for future AI:** After broad feature work, run verification and assume at least one small follow-up fix may be needed outside the main file.

### 4b. Supabase Query Objects Are Promise-Like, Not Full Promises ✓
- **What happened:** Chaining Promise helpers directly onto Supabase query builders caused type/runtime friction.
- **Best fix:** Await the query result normally instead of assuming native Promise helpers.
- **Pre-emption for future AI:** Treat Supabase builders as special query objects, not generic Promises.

### 4c. Complex Embedded PostgREST Queries Often Mislead Faster Than Two-Step Lookups ✓✓
- **What happened:** Single embedded lookups produced wrong shapes, false "not found" paths, or relation-type confusion.
- **Best fix:** Use two simpler lookups when correctness matters more than query compactness.
- **What explanation clicked:** "First get the scan, then get the parent deal/org with a second query."
- **Pre-emption for future AI:** If an embedded query starts getting tricky, prefer separate queries with explicit typing.

### 4d. Binary Response Typing And PDF Internals Are Recurring Sharp Edges ✓✓✓
- **What happened:** ZIP/PDF routes and tests repeatedly hit issues around `Uint8Array` response bodies and compressed PDF content.
- **Best fix:** Wrap binary payloads in supported response types and test PDF helpers/structure instead of raw compressed bytes.
- **Pre-emption for future AI:** For PDF or ZIP work, plan for special response typing and avoid fragile raw-binary string assertions.

### 4e. Supabase Edge Functions (Deno) Break Next.js `tsc` If Included ✓
- **What happened:** `next build` type-checks all `**/*.ts` including `supabase/functions/**` with `https://` ESM imports, which TypeScript cannot resolve in the Next project.
- **Best fix:** Exclude `supabase/functions` in root `tsconfig.json` so Deno code is not part of the Next compile graph.
- **Pre-emption for future AI:** If `next build` fails on a Deno URL inside `supabase/functions`, confirm `exclude` covers that folder before refactoring the edge function.

### 4f. Hardcoded Dark-Mode Colors Break Light Mode Across 25+ Files ✓
- **What happened:** ~25 files used inline `style={{ color: "#a1a1aa", backgroundColor: "#18181b" }}` and similar hardcoded dark-mode hex values, bypassing the CSS variable system in `globals.css`. In light mode, this produced invisible text (pale gray on white), black boxes, and unreadable UI across methodology, deals, portfolio, governance, settings, digest, and onboarding pages.
- **Best fix:** Systematic conversion of all inline `style={{}}` color/background props to Tailwind theme-aware classes (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-background`, `border-border`, `bg-muted/50`). Semantic/status colors (blue, red, green, amber) were preserved as-is since they work in both themes.
- **Color mapping used:**
  - `#fafafa` / `#e4e4e7` → `text-foreground`
  - `#a1a1aa` / `#71717a` → `text-muted-foreground`
  - `#18181b` / `#0a0a0a` → `bg-card` or `bg-background`
  - `rgba(255,255,255,0.03)` → `bg-muted/50`
  - `rgba(255,255,255,0.08)` / `#3f3f46` → `border-border`
- **Pre-emption for future AI:** When adding new UI, always use Tailwind theme tokens (`text-foreground`, `bg-card`, `border-border`) instead of hex values. Check that `app/settings/page.tsx` uses `dark:` variants as the reference pattern. Never use inline `style={{}}` for colors that should adapt to theme.

### 4g. Tier Override Requires Page Refresh Before Next Action ✓
- **What happened:** After changing the org tier via the owner dev tools, the next scan request hit a 500 (ECONNRESET/terminated). The scan worked fine after a manual browser refresh.
- **Root cause:** The tier-override API route updated the database but did not call `revalidatePath`, so Next.js server components continued serving stale entitlement data. A potential race condition with the `FOR UPDATE` lock in the scan RPC also contributed.
- **Best fix:** Added `revalidatePath("/app", "layout")` to the tier-override API route and `router.refresh()` to the client-side TierSetterPanel after a successful change.
- **Pre-emption for future AI:** Any API route that changes org-level state consumed by server components (plan, entitlements, feature flags) should call `revalidatePath` so the next navigation uses fresh data.

### 4h. Dev Tools Showing Internal Slugs Instead Of Customer-Facing Names ✓
- **What happened:** The tier setter in owner dev tools displayed `FREE`, `PRO`, `PRO+`, `ENTERPRISE` — the internal plan slugs. The user expected to see the customer-facing names (Starter, Analyst, Fund, Enterprise) and was confused by the mismatch.
- **Best fix:** Updated the TierSetterPanel to show labels like `Starter (PRO)`, `Analyst (PRO+)`, `Fund / Enterprise (ENTERPRISE)` alongside internal values. The stored value stays the internal slug.
- **Pre-emption for future AI:** Any admin/owner UI that displays plan names should show the customer-facing label alongside the internal slug, not just the slug.

### 4i. AI Insights Panel Only Visible On Scan Detail Page ✓
- **What happened:** The AI Insights panel was only rendered on the scan detail page (`/app/deals/[id]/scans/[scanId]`), not the main deal overview page. The user could not find it without clicking into a specific scan from the recent scans list.
- **Best fix:** Added the `AiInsightsPanel` to the main deal detail page (`app/app/deals/[id]/page.tsx`) in the overview tab, after the explainability diff section and before recent scans. Same dual gate: `canUseAiInsights && aiInsightsFlag`.
- **Pre-emption for future AI:** When adding gated features, put them on the most visible surface the user is likely to visit, not only on deep drill-down pages.

### 4j. Redundant Dev Tool Tabs And Plan Selector Resetting To FREE ✓
- **What happened:** The dev tools had separate "Feature flags" and "Tier override" tabs, which was confusing since they're closely related. Additionally, the tier override plan dropdown always initialized to `"FREE"` (hardcoded `useState`) instead of reading the selected org's current plan, so it appeared to "reset" on every page load.
- **Best fix:** Merged both into a single "Plan & flags" tab (`PlanAndFlagsPanel.tsx`). Plan selector now initializes to the selected org's current plan and updates when the org changes. Single-org workspaces show the org inline without a redundant dropdown. Feature flags converted from CRUD table to simple toggle rows.
- **Pre-emption for future AI:** When state is derived from a prop (e.g. org's current plan), always initialize `useState` from the prop value, not a hardcoded default. When two dev tool panels are tightly related, consider merging them into one tab.

### 4k. AI Insights Dual-Gate Not Obvious From Tier Override Alone ✓
- **What happened:** After changing the org tier to PRO+ via the dev tools tier override, the AI Insights panel still did not appear on deal pages. The user assumed changing the tier was sufficient.
- **Root cause:** AI Insights requires TWO independent conditions: (1) `canUseAiInsights` entitlement from PRO+/ENTERPRISE plan, AND (2) the `ai-insights` feature flag must be enabled in the `feature_flags` table. The tier override only changes the plan — it does not auto-enable feature flags. Additionally, the tier override route did not call `clearFeatureFlagCache()`, so even if the flag was already enabled, cached values could persist for up to 60 seconds.
- **Best fix:** Added `clearFeatureFlagCache()` to the tier override route. Added a yellow reminder banner in the TierSetterPanel that appears when PRO+ or ENTERPRISE is selected, explaining the dual-gate requirement.
- **Pre-emption for future AI:** When a feature is gated by BOTH a plan entitlement AND a feature flag, make the dependency explicit in the admin UI. Don't assume users will discover the second gate on their own. Any admin route that changes state consumed by feature-flag-gated code paths should also clear the flag cache.

### 4m. Force Rescan Button Not Discoverable In Debug Section ✓
- **What happened:** The Force Rescan button was placed in the owner debug section near ScoreDebugPanel, but the user couldn't find it. The normal "Rescan (Fresh)" button returned "Score unchanged" because Layer 2 (text-hash) cache intercepted the request, and the user had no obvious way to bypass it.
- **Root cause:** The button was tucked away in a collapsible debug panel rather than placed next to the primary action button where the user was already looking.
- **Best fix:** Added an inline "Force Rescan" button right next to the main scan button in `DealDetailClient`, visible only to the owner (`isOwner` prop). Subtle styling (transparent background, gray border) distinguishes it from the primary action.
- **Pre-emption for future AI:** Owner-only action buttons should be placed near the standard action they supplement, not buried in a separate debug section. Users look where they already interact. Debug panels are for inspection, not for primary actions.

### 4l. Invite Emails Not Delivering — Async Outbox Not Obvious ✓
- **What happened:** User sent a workspace invite and saw "Invite sent to {email}", but the recipient never received the email. The invite was queued in `email_outbox` but the cron job wasn't processing it (either cron not running, `CRON_SECRET` not set, or Vercel Hobby plan limiting cron frequency to once/day).
- **Root cause:** The invite system uses an async outbox pattern: clicking "Send invite" inserts into `email_outbox` with `status='QUEUED'`, and a separate cron job (`/api/cron/email/process`) processes the queue. The UI said "Invite sent" even though the email was only queued, not sent.
- **Best fix:** Added `POST /api/owner/process-outbox` route and "Process email queue" button in dev tools Test Tools tab so the owner can manually trigger delivery. Changed the success message to "Invite queued for {email} — email will be delivered shortly."
- **Pre-emption for future AI:** When an operation uses an outbox/queue pattern, always provide a manual trigger in dev tools and make the UI message reflect the actual state (queued vs sent). Users will assume "sent" means delivered.

---

## 5. Entitlements, Billing, And Pricing Drift

### 5a-pre. Test Assertions Can Lag Behind Implementation Changes ✓
- **What happened:** `lib/entitlements/workspace.test.ts` asserted `canInviteMembers: false` for PRO, but the implementation in `workspace.ts` and the onboarding doc both said `true`. The test predated the PRO invite capability change and was never updated.
- **Best fix:** Fixed the test assertion to match the implementation. Always verify test expectations against the current implementation when updating entitlements.
- **Pre-emption for future AI:** When changing entitlement logic, grep for the changed property name in test files and update assertions to match.

### 5a. Workspace Plan, Profile Plan, And Pricing Display Can Drift Apart ✓✓
- **What happened:** UI sometimes showed the wrong plan because it relied on profile-level state or stale display logic instead of workspace plan state.
- **Best fix:** Use workspace plan as the source of truth for workspace billing, feature gating, and pricing-state display.
- **What explanation clicked:** "The user profile role is not the same thing as the organization's paid plan."
- **Improvement observed:** The user is getting better at spotting when UI plan messaging does not match actual workspace capabilities.
- **Pre-emption for future AI:** When working on billing or gated UI, verify which plan source is authoritative before editing copy or logic.

### 5b. Pricing Copy And Enforced Entitlements May Not Match Exactly ✓✓
- **What happened:** Current repo state shows drift between user-facing pricing copy and server-side entitlements or limits.
- **Best fix:** Distinguish "marketing copy" from "actual enforced entitlement logic" and document both when relevant.
- **Pre-emption for future AI:** Before changing plan copy, compare `app/pricing/*`, `PricingComparisonTable`, and `lib/entitlements/workspace.ts`.

### 5c. Stripe Webhook 200 Does Not Mean The Plan Actually Updated ✓
- **What happened:** Webhooks could succeed while the organization plan stayed unchanged because the subscription price ID did not map to the expected env var.
- **Best fix:** Verify the exact Stripe price ID mapping used by the webhook and compare it to environment config.
- **What explanation clicked:** Showing the actual price-id-to-plan mapping and the env suffixes being checked.
- **Improvement observed:** The user now has a better mental model of "subscription item price ID -> mapped plan -> organization.plan update."
- **Pre-emption for future AI:** When billing seems wrong, inspect the webhook mapping before assuming the webhook route failed.

---

## 6. Governance, Benchmark, And Risk Consistency Friction

### 6a. Deterministic Snapshot-Based Benchmarking Must Win Over Legacy Live Percentiles ✓✓
- **What happened:** Legacy live percentile behavior conflicted with the newer snapshot-based benchmark model.
- **Best fix:** Deprecate legacy live percentile paths and route consumers toward snapshot-backed APIs.
- **Pre-emption for future AI:** If benchmark work touches old percentile routes, verify that you are not reintroducing non-deterministic live behavior.

### 6b. Silent Inconsistencies Are Worse Than Visible Warnings ✓✓✓
- **What happened:** Band mismatches, version drift, and delta comparability could quietly produce misleading outputs if not surfaced.
- **Best fix:** Make mismatches explicit in UI, export, and logs; avoid pretending values are comparable when they are not.
- **What explanation clicked:** "Stored display value and canonical recomputed value are not interchangeable; verify and flag instead of silently rewriting."
- **Improvement observed:** The user now pushes for visible governance signals instead of silent fallback behavior.
- **Pre-emption for future AI:** Prefer explicit mismatch indicators, review flags, audit rows, and version checks over silent normalization.

### 6c. Delta Comparability Must Be Earned, Not Assumed ✓✓
- **What happened:** Risk movement, deterioration, and backtest-style logic became wrong when missing breakdown data or version drift was treated as comparable.
- **Best fix:** Only count delta-based features when comparability is explicitly true.
- **Pre-emption for future AI:** Never default `delta_comparable` to true when the supporting evidence is missing.

---

## 7. Invite, Email, And Background Processing Friction

### 7a. Outbox + Retry + Hashed Tokens Is Better Than Inline Email Sending ✓✓
- **What happened:** Inline invite email sending and raw token handling were less reliable and less safe.
- **Best fix:** Queue email work, process it via cron/outbox, store hashed tokens, and make invite accept idempotent.
- **Pre-emption for future AI:** For user-facing email flows, prefer an auditable outbox model over immediate fire-and-forget sends.

### 7b. Concurrency Matters On Member Caps And Invite Acceptance ✓✓
- **What happened:** Member-limit enforcement is vulnerable to races if done only in app code.
- **Best fix:** Use RPC/database locking for accept flows that change org membership counts.
- **Pre-emption for future AI:** If a plan limit can be hit concurrently, enforce it transactionally.

---

## 8. Risk Scoring And Determinism Friction

### 8a. AI Extraction Variance Causes Score Instability Even With temperature=0 ✓✓
- **What happened:** Same deal text scanned 5 times in 2 minutes produced scores of 41→47→44→47→41. The root cause was GPT producing slightly different risk lists, triggers, and evidence snippets per call. The trigger-text-based dedup key (`${risk_type}:${trigger.slice(0,200).lower()}`) meant rephrased triggers created duplicate risks that changed the score.
- **Best fix (v3):** Changed risk dedup to use `risk_type` only (highest severity wins, triggers merged). Added deterministic severity overrides for all risk types with numeric proxies. Added post-normalization scoring-input-hash cache so identical normalized inputs always reuse exact prior scores.
- **Pre-emption for future AI:** Never use AI-generated free-text fields (trigger text, evidence snippets) as dedup keys or scoring inputs. Only use structured fields (risk_type, severity, confidence) that can be deterministically overridden.

### 8b. Overlay Severity Bump Double-Counts Macro Penalty ✓
- **What happened:** `crossReferenceOverlay.ts` had a `bumpedSeverity()` function that mutated individual risk severity after linking macro signals. This was non-deterministic (depended on which signals existed in a 30-day window) and also double-counted the macro penalty that was already captured via `macroLinkedCount`/`macroDecayedWeight` in `computeRiskIndex()`.
- **Best fix (v3):** Removed the severity bump entirely. Macro penalty is now only captured through the macro count/weight parameters in the scoring engine.
- **Pre-emption for future AI:** The scoring engine should be the single place where macro impact is accounted for. Never mutate individual risk severity based on signal overlay — use aggregate parameters instead.

### 8c. Model Switch (gpt-4o → gpt-5.4-mini) Amplified Extraction Variance ✓
- **What happened:** Switching from gpt-4o to gpt-5.4-mini caused further score drift because different models extract different assumptions/risks from the same text. The weak trigger-text-based dedup let model-specific noise through.
- **Best fix (v3):** The three-layer determinism protection (input-text cache, risk_type dedup + severity overrides, scoring-input cache) makes scoring robust to model switches. Different models may still extract different risk_types, but the scoring from normalized inputs is guaranteed stable.
- **Pre-emption for future AI:** When switching extraction models, run the stress harness (`npx tsx scripts/stressRiskIndexV2.ts`) and verify all assertions pass. Score stability should not depend on which model is used.

### 8d. Supply/Vacancy Risk Overlap Creates Double-Counting ✓
- **What happened:** VacancyUnderstated and RentGrowthAggressive often covered the same underlying supply risk (e.g., "3-year pipeline of 12,000 units"). Both risks were scored independently, effectively double-counting supply pressure.
- **Best fix (v3):** Added supply pressure grouping: when both risks are present and RentGrowthAggressive's trigger contains supply keywords, its severity is demoted one level with a transparent marker `[supply overlap with VacancyUnderstated]`.
- **Pre-emption for future AI:** When two risk types commonly share an underlying cause, add grouping logic to prevent double-counting rather than relying on the AI to avoid overlap.

---

## 9. User Improvement Log

### 9a. Better At Spotting Spec-vs-Repo Drift ✓✓
- **Observed improvement:** The user increasingly notices when a prompt or plan may not match the current repo and asks for an audit before implementation.
- **What helped:** Showing the gap plainly: "Here is what the spec says, here is what already exists, here is what is still missing."

### 9b. Better At Product And Governance Reasoning Than At Coding Mechanics ✓✓✓
- **Observed improvement:** The user now contributes stronger requirements around determinism, auditability, role/plan behavior, and operator workflow even though hands-on coding remains a weak area.
- **What helped:** Framing problems in product/system terms instead of raw code terms.

### 9c. Better At Asking For Automation Instead Of Accepting Painful Manual Steps ✓✓
- **Observed improvement:** The user explicitly asks for CLI-based or fully handled flows now, especially when past manual flows were painful.
- **What helped:** Demonstrating once that a CLI/script can replace a dashboard chore and then reusing that pattern.

