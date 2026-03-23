# Deterministic Scoring Fix — 2026-03-23

## Problem

Repeated scans of the **exact same deal text** produced different Risk Index scores (e.g., 47 → 56 → 51 → 56) and band jumps (Moderate ↔ Elevated). This violated the core promise of deterministic scoring. Additionally, the Supplemental AI Insights edge function returned a non-2xx status code on every invocation.

---

## Root Causes Identified

### 1. Frontend bypasses text-hash cache on every rescan

`app/app/deals/[id]/DealDetailClient.tsx:46` sends `force: 1` whenever a deal already has a scan:

```typescript
const body = hasScan ? { deal_id: dealId, force: 1 } : { deal_id: dealId };
```

In the scan route (`app/api/deals/scan/route.ts:140`), `forceRescan` causes the `input_text_hash` cache (Layer 1) to be skipped entirely:

```typescript
if (!forceRescan && rawText) { /* cache lookup */ }
```

Every UI rescan therefore triggers a fresh OpenAI extraction call.

### 2. OpenAI gpt-5.4-mini is not fully deterministic

Even with `temperature: 0`, `seed: 42`, `top_p: 1`, the model produces slightly different extractions across calls — different risk types, different assumption values, different trigger text. This is a documented limitation of OpenAI's seed parameter ("best effort" determinism, not guaranteed).

Different extractions cascade through the pipeline:
- Different risk sets → different severity overrides
- Different assumption values → different scoring penalties
- Different `scoring_input_hash` → Layer 2 cache miss
- Fresh `computeRiskIndex()` with different inputs → different score

### 3. Time-dependent inputs feed into scoring

Two components introduce temporal non-determinism after AI extraction:

- **Macro overlay**: `computeDecayedMacroWeight()` called with `new Date()`, meaning the decay calculation shifts by milliseconds between scan invocations.
- **Cross-reference overlay**: `runOverlay()` queries signals created within a 30-day sliding window. Signal set changes between scans affect `macroLinkedCount`.

### 4. Edge function uses deprecated model

`supabase/functions/ai-insights/index.ts:121` referenced `gpt-4o-mini`, a deprecated model, while the rest of the application had been migrated to `gpt-5.4-mini`. The function also lacked a top-level error boundary.

---

## Fixes Applied

### Section A: Eliminate Rescan Score Variability

**File:** `app/api/deals/scan/route.ts`

#### A1. Raw text normalization before hashing

Added `normalizeRawText()` to collapse whitespace, normalize line endings (`\r\n` → `\n`), and trim before computing the SHA-256 hash. Applied at all three hash call sites (Layer 1 cache, failed scan insert, successful scan insert). This prevents invisible text differences (copy-paste artifacts, encoding variations) from causing cache misses.

```typescript
function normalizeRawText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}
```

#### A2. Authoritative text-hash score lookup (force-safe)

**This is the critical fix.** Added a new cache layer that runs **even when `force: 1` is set**. After the existing Layer 1 cache block, the route now queries for any prior completed scan with the same `input_text_hash` and a non-null `risk_index_score`:

```typescript
if (rawText) {
  const textHash = inputTextHash(normalizedText);
  const { data: priorScored } = await service
    .from("deal_scans")
    .select("id, risk_index_score, risk_index_band, risk_index_breakdown")
    .eq("deal_id", dealId)
    .eq("input_text_hash", textHash)
    .eq("status", "completed")
    .not("risk_index_score", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorScored?.risk_index_score != null) {
    return NextResponse.json({
      scan_id: priorScored.id, deal_id: dealId, reused: true,
      risk_index_score: priorScored.risk_index_score,
      risk_index_band: priorScored.risk_index_band,
      risk_index_breakdown: priorScored.risk_index_breakdown,
    });
  }
}
```

Effect: If the deal's raw text hasn't changed, **no new scan is created, no AI is called, no new scan row is written, and the identical prior score is returned**. The raw text hash is now the authoritative determinism key.

A safe fallback log is emitted when the hash matches but no completed scored scan exists yet (first-ever scan of that text).

#### A3. Enhanced Layer 1 cache response

The existing `!forceRescan` cache path now selects and returns `risk_index_score` and `risk_index_band` inline, so the frontend gets deterministic data without an extra fetch.

#### A4. Diagnostic logging at all cache layers

Added `console.info` logs at every cache decision point:
- `[SCAN CACHE] Layer 1 hit (input_text_hash, no force)` — Layer 1 cache hit
- `[SCAN CACHE] text-hash score reuse (force-safe)` — authoritative text-hash reuse
- `[SCAN CACHE] Text hash match but no completed score — proceeding normally` — first-ever scan fallback
- `[SCAN CACHE] Layer 2 miss (scoring_input_hash) — computing fresh score` — scoring-input cache miss
- `[SCAN CACHE] Miss → new score:` — fresh score computed (should only happen on genuinely new text)

#### A5. Pinned macro decay timestamp

`computeDecayedMacroWeight()` now receives `new Date(completedAt)` instead of defaulting to `new Date()`. This eliminates microsecond drift between concurrent scans.

#### A6. Pinned model snapshot

Changed from alias `gpt-5.4-mini` to snapshot `gpt-5.4-mini-2026-03-17` to prevent future model alias drift from introducing extraction changes.

---

### Section B: Fix Edge Function Non-2xx Error

**File:** `supabase/functions/ai-insights/index.ts`

#### B1. Updated model

Changed from deprecated `gpt-4o-mini` to `gpt-5.4-mini-2026-03-17` with pinned snapshot name.

#### B2. Early API key safety check

Added an immediate check for `OPENAI_API_KEY` at the top of the handler, before any other work. Logs `[ai-insights] Missing OPENAI_API_KEY` and returns a clear 500 error if the secret is not configured.

#### B3. Top-level try/catch error boundary

Wrapped the entire handler body in a try/catch that logs unhandled errors and returns a structured JSON error response instead of crashing the function.

#### B4. Deployment comments

Added comments documenting the required secret and deployment commands.

**File:** `app/api/deals/scans/[scanId]/ai-insights/route.ts`

#### B5. Improved error logging

Enhanced the `fnError` log to capture `message`, `context`, `status`, and `fnData` for better production debugging.

---

### Frontend Warning

**File:** `app/app/deals/[id]/DealDetailClient.tsx`

Added a warning comment above the `force: 1` line explaining the behavior and noting that the server-side authoritative text-hash lookup mitigates the risk.

---

## Files Changed

| File | Changes |
|------|---------|
| `app/api/deals/scan/route.ts` | `normalizeRawText()`, authoritative text-hash cache, enhanced Layer 1, logging, model pin, macro timestamp pin |
| `supabase/functions/ai-insights/index.ts` | Model update, API key check, try/catch boundary, deployment comments |
| `app/api/deals/scans/[scanId]/ai-insights/route.ts` | Enhanced error logging |
| `app/app/deals/[id]/DealDetailClient.tsx` | Warning comment on `force: 1` |

## No Migration Required

Both `input_text_hash` (migration 008) and `scoring_input_hash` (migration 059) already exist with appropriate indexes.

---

## Verification Steps

### Deterministic Scoring
1. Run the same deal text 5x via the UI
2. Confirm identical `risk_index_score` and `risk_index_band` every time
3. Check server logs for `[SCAN CACHE] text-hash score reuse (force-safe)` on scans 2-5
4. Verify no new `deal_scans` rows are created for repeated identical text

### Edge Function
1. Verify secret is set: `npx supabase secrets list` (check for `OPENAI_API_KEY`)
2. If missing: `npx supabase secrets set OPENAI_API_KEY=sk-...`
3. Deploy: `npx supabase functions deploy ai-insights`
4. Open a deal with a completed scan → toggle "Supplemental AI Insights" → confirm insights appear
5. Check Supabase function logs for errors

### Rollback

All changes are additive. To rollback:
- **Section A**: Remove the authoritative text-hash cache block and `normalizeRawText` calls
- **Section B**: Revert model name (though reverting to `gpt-4o-mini` would re-break the function)

---

## Architecture Note

The three-layer cache hierarchy is now:

```
Layer 0: Authoritative text-hash score reuse (force-safe)
  ↓ miss (first-ever scan of this text)
Layer 1: input_text_hash TTL cache (7-day window, skipped by force=1)
  ↓ miss (force=1 or TTL expired)
Layer 2: scoring_input_hash cache (post-normalization, 7-day window)
  ↓ miss (different canonical scoring inputs)
Layer 3: Fresh computeRiskIndex() computation
```

Layer 0 is the definitive fix. It guarantees that identical raw text always produces identical scores, regardless of AI extraction variability, macro overlay changes, or `force` flag usage.
