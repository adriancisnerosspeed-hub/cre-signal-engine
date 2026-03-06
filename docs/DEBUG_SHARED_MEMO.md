# Debug: Shared memo "Scan not found"

## 1. API route: `app/api/shared/memo/[token]/route.ts`

### Full query flow

**Query 1 — Lookup share link**
```ts
service
  .from("memo_share_links")
  .select("id, scan_id, organization_id, view_count, expires_at")
  .eq("token", token)
  .is("revoked_at", null)
  .maybeSingle();
```
- Queries `memo_share_links` by `token`, with `revoked_at IS NULL`. Correct.

**Query 2 — Fetch scan (failing point)**
```ts
service
  .from("deal_scans")
  .select("id, created_at, risk_index_score, risk_index_band, deals!inner(name, asset_type, market)")
  .eq("id", l.scan_id)
  .single();
```
- Joins to `deals` via embed `deals!inner(...)`. If the embed fails or returns no row, `.single()` throws / returns error and we respond with "Scan not found".

**Query 3 — Narrative**
```ts
service
  .from("deal_scan_narratives")
  .select("content")
  .eq("deal_scan_id", l.scan_id)
  .maybeSingle();
```
- Narrative is in table `deal_scan_narratives`, column `content`. Correct.

---

## 2. Where IC memo narrative is stored

- **Not** on `deal_scans` — there is no `narrative` column on `deal_scans`.
- **Table:** `deal_scan_narratives` (migration 014)
- **Column:** `content` (TEXT NOT NULL)
- **FK:** `deal_scan_id` → `deal_scans(id)`, UNIQUE(deal_scan_id)

**deal_scans columns** (from migrations; equivalent to what you’d see from):

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'deal_scans' ORDER BY ordinal_position;
```

- 008: id, deal_id, deal_input_id, input_text_hash, extraction, model, prompt_version, status, created_at, completed_at, cap_rate_in, exit_cap, noi_year1, ltv, hold_period_years  
- 013: risk_index_score, risk_index_band, risk_index_breakdown  
- 021: scenario_label, asset_type, market  
- 023: risk_index_version, macro_linked_count  
- 024: actual_outcome_type, actual_outcome_value, actual_outcome_at, actual_outcome_metadata  

There is **no** `narrative` column on `deal_scans`. Narrative lives in `deal_scan_narratives.content`.

---

## 3. RLS and client

- **API route** uses `createServiceRoleClient()` only. Service role bypasses RLS. So RLS on `memo_share_links` does **not** block the read.
- **Page** `app/shared/memo/[token]/page.tsx` also uses `createServiceRoleClient()`. Same: no anon/session, RLS not the cause.

---

## 4. Root cause

The **deal_scans** query uses `deals!inner(name, asset_type, market)` and `.single()`. With PostgREST/Supabase, that embed can fail or return no row (e.g. relationship name or response shape), so the route returns 404 "Scan not found". Same pattern as the share create route we fixed earlier.

**Fix:** Use a two-step lookup (deal_scans by id, then deals by deal_id) and use `.maybeSingle()` so we don’t treat "no row" as an exception.

---

## 5. Note on where "Scan not found" appears

- **API route** returns JSON `{ error: "Scan not found" }` when the deal_scans query fails.
- **Page** at `/shared/memo/[token]` does **not** call this API; it runs its own Supabase queries in the Server Component. When its deal_scans query fails, the page calls `notFound()`. So the visible "Scan not found" may be from the API only if something fetches it; otherwise it’s from the page’s `notFound()` (or a custom not-found UI). Fixing both the API route and the page avoids the failure in either path.
