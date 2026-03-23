# CRE Signal Engine - Onboarding For Future AI Chats

---

## Read Order

For any non-trivial session in this repo, read these files first:

1. `onboarding/ONBOARDING.md`
2. `onboarding/CRESIGNALENGINE.md`
3. `onboarding/Assist.md`
4. `onboarding/Obstacles.md`

Use `docs/SYSTEM_OVERVIEW.md` as the deeper system reference when needed.

---

## Purpose Of Each Memory File

- `onboarding/CRESIGNALENGINE.md`
  - Canonical AI-facing summary of the app, feature surface, plan model, and important constraints.
- `onboarding/Assist.md`
  - Stable user preferences, communication style, explanation patterns, and workflow expectations.
- `onboarding/Obstacles.md`
  - Recurring friction log: technical failures, user confusion patterns, what fixed them, and what to pre-empt next time.

---

## Mandatory Maintenance Rules

- If you change features, plans, APIs, product behavior, or important architecture:
  - update `onboarding/CRESIGNALENGINE.md`
- If you learn a durable user preference or explanation style:
  - update `onboarding/Assist.md`
- If you hit meaningful friction, repeated confusion, or a recurring failure pattern:
  - update `onboarding/Obstacles.md`
- If the issue already exists in `onboarding/Obstacles.md`:
  - add a tick to the existing entry instead of duplicating it
- If the user got better at something previously hard:
  - note that improvement in `onboarding/Obstacles.md`

Always mention in your final response when you updated any of these files.

---

## Working Rules For Future Chats

- Assume the user wants minimal manual work.
- Prefer CLI, scripts, and automated paths over dashboard-heavy instructions.
- Do the implementation yourself whenever tooling allows.
- Ask only critical clarifying questions.
- For large requests, audit current state before coding.
- If a plan file is attached and the user says not to edit it, treat it as the execution contract.
- If pricing copy and backend entitlements differ, document both and identify which one is actually enforced.

---

## Quality Bar For These Files

- Write for AI, not for end-user polish.
- Be explicit, concrete, and operational.
- Prefer durable guidance over one-off noise.
- Merge overlapping points instead of creating repetitive entries.
- Preserve important drift notes when repo reality and prior docs differ.

