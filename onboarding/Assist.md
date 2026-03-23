# CRE Signal Engine - AI Assist Profile

---

## Purpose

This file is for future AI chats, not for the user. It captures stable user preferences, working patterns, explanation styles, and product-building biases that should shape how work gets done in this repo.

Update this file whenever a preference becomes clearly durable across sessions.

---

## 1. Core User Model

- The user is effectively non-technical for implementation work.
- Do not expect them to debug code, reason through stack traces, write SQL, or repair build issues.
- Default to doing the work yourself.
- Only ask the user to do actions that are truly external, permission-bound, or require their personal judgment.
- When manual action is unavoidable, give exact commands or exact click paths and explain what the step does in plain English.

---

## 2. Communication Preferences

- Be direct. Minimal fluff.
- Start with a short status line before substantial exploration or edits.
- Ask only the critical questions. If ambiguity is small and reversible, choose a sensible default and move.
- For large work, use a clear plan, phase list, or file-by-file map.
- If rerunning a command, say why first.
- Treat short confirmations as approval to continue.
- Prefer concise final summaries with:
  - what changed
  - what still needs user action, if any
  - what you verified

---

## 3. What Makes Things Click For This User

- Plain-English system mapping works best:
  - "this route writes this table"
  - "this env var controls this behavior"
  - "this plan slug maps to this pricing tier"
- Exact examples help more than theory.
- Cause-and-effect framing works better than abstract code discussion.
- "What changed / why it failed / what fixes it" is more effective than generic explanations.
- When there is product or infra confusion, compare old behavior vs new behavior explicitly.

---

## 4. Preferred Working Style

- Prefer automation, CLI, and repo-native workflows over manual dashboard work.
- If there is a CLI/API path, use it before asking the user to do repetitive manual work.
- Audit existing implementation before starting large features.
- For structured prompts with OBJECTIVE / ACCEPTANCE or an attached plan, follow that structure closely.
- Treat docs, implementation summaries, and handoff notes as useful assets, not optional extras.
- For complex features, the best pattern is:
  - audit current repo state
  - compare against request/plan
  - implement missing pieces
  - verify
  - update memory docs if needed

---

## 5. Product And UX Preferences

- The app should feel institutional, serious, and operator-focused.
- Favor deterministic, auditable, governance-oriented behavior over "smart" but opaque behavior.
- Avoid hypey "AI magic" language when outcome-based language is stronger.
- The user prefers workspace/member language over "seats."
- The product should reduce operational friction for underwriting teams, not create extra process.
- Dark and light mode quality both matter once a surface is important enough.
- Shareable outputs, governance visibility, and clean operator workflows are valued.

---

## 6. Pricing / Plan Language Preferences

- User-facing pricing labels currently used in the app:
  - Starter
  - Analyst
  - Fund
  - Enterprise
- Internal plan slugs in core entitlement logic:
  - `FREE`
  - `PRO`
  - `PRO+`
  - `ENTERPRISE`
- Future chats must be careful not to assume user-facing tier names and internal plan slugs are one-to-one without checking current code.
- The owner dev tools now show customer-facing names alongside internal slugs (e.g., `Starter (PRO)`). If the user references a tier by its customer-facing name, map it: Starter = PRO, Analyst = PRO+, Fund = ENTERPRISE.

---

## 7. Stable Preferences For Future Chats

- Minimize how much the user has to touch code.
- Prefer "I handled it" over "here are five things for you to go figure out."
- If a dashboard step is required, make it short and exact.
- If a task is already partly implemented, identify what is done vs missing before coding more.
- If something is materially changed in the product, update the memory docs so the next chat starts informed.

---

## 8. Questions Future Chats Should Ask Only When Needed

- Is this change user-facing, governance-only, or internal infrastructure?
- Should this be gated by workspace plan, and if so, which plan?
- Does this change actual scoring/business logic, or only UI/reporting/workflow?
- Is existing data supposed to be backfilled, or is this for new records only?
- Is the user asking for actual enforced behavior, or just pricing/marketing copy?
- Does the user want the fastest acceptable implementation, or the more institutional/auditable one?

---

## 9. Maintenance Rule

- Add new entries only when they are durable preferences, not one-off comments.
- Merge with existing points when possible.
- If the user clearly changes a prior preference, update this file instead of preserving stale guidance.

