import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_SIGNAL_TYPES = [
  "Pricing",
  "Credit Availability",
  "Credit Risk",
  "Liquidity",
  "Supply-Demand",
  "Policy",
  "Deal-Specific",
];

export const DEFAULT_ACTIONS = ["Act", "Monitor"];

export type DigestPreferences = {
  signal_types: string[];
  actions: string[];
  min_confidence: string;
};

export type UserPreferencesRow = DigestPreferences & {
  user_id: string;
  timezone: string;
  digest_time_local: string;
  digest_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export function getDefaultPreferences(): DigestPreferences & { timezone: string; digest_time_local: string; digest_enabled: boolean } {
  return {
    signal_types: [...DEFAULT_SIGNAL_TYPES],
    actions: [...DEFAULT_ACTIONS],
    min_confidence: "Medium",
    timezone: "America/Chicago",
    digest_time_local: "07:00",
    digest_enabled: true,
  };
}

export type DigestSignal = {
  id: number;
  idx: number;
  signal_type: string;
  action: string;
  confidence: string;
  what_changed: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  created_at: string;
};

const CONFIDENCE_RANK: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

const ACTION_RANK: Record<string, number> = {
  Act: 3,
  Monitor: 2,
  Ignore: 1,
};

export function getConfidenceRank(confidence: string): number {
  const c = (confidence || "").trim();
  return CONFIDENCE_RANK[c] ?? 0;
}

function getActionRank(action: string): number {
  const a = (action || "").trim();
  return ACTION_RANK[a] ?? 0;
}

/**
 * Canonical string for dedupe: lowercases, trims, collapses whitespace,
 * removes punctuation, normalizes unicode quotes, optional numeric spacing.
 */
export function normalizeForDedupe(text: string | null): string {
  if (text == null) return "";
  let s = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // Normalize unicode quotes and dashes
  s = s
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-");
  // Remove punctuation (keep letters, digits, space, . - %)
  s = s.replace(/[^\w\s.\-%]/g, " ");
  // Collapse spaces again
  s = s.replace(/\s+/g, " ").trim();
  // Optional: normalize numeric spacing e.g. "11.5 %" -> "11.5%"
  s = s.replace(/(\d)\s*%\s/g, "$1% ");
  s = s.replace(/\s+%\s*(\d)/g, " %$1");
  return s;
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "at", "which", "on", "to", "for", "of", "in", "it", "and", "or", "by", "as",
]);

/** Tokenize canonical string for similarity: split on whitespace, drop stopwords. */
function tokenizeForSimilarity(canonical: string): string[] {
  return canonical
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/** Jaccard similarity over token sets: |A ∩ B| / |A ∪ B|. Returns 0 if both empty. */
function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const NEAR_DUPE_JACCARD_THRESHOLD = 0.75;

/** True if two canonical what_changed strings are near-duplicates (paraphrases). */
function isNearDuplicateWhatChanged(normA: string, normB: string): boolean {
  if (normA === normB) return true;
  if (normA.length >= 15 && normB.length >= 15 && (normA.includes(normB) || normB.includes(normA))) return true;
  if (normA.startsWith(normB) || normB.startsWith(normA)) return true;
  const tokensA = tokenizeForSimilarity(normA);
  const tokensB = tokenizeForSimilarity(normB);
  if (tokensA.length >= 2 && tokensB.length >= 2 && jaccardSimilarity(tokensA, tokensB) >= NEAR_DUPE_JACCARD_THRESHOLD)) {
    return true;
  }
  return false;
}

/** Primary dedupe key: signal_type + action + normalized(what_changed) only. */
export function signalFingerprint(s: DigestSignal): string {
  const typeKey = (s.signal_type ?? "").trim().toLowerCase();
  const actionKey = (s.action ?? "").trim().toLowerCase();
  const whatKey = normalizeForDedupe(s.what_changed);
  return `${typeKey}\0${actionKey}\0${whatKey}`;
}

/** Primary dedupe: keep only the most recent signal per fingerprint. Runs BEFORE grouping and caps. */
export function primaryDedupeSignals(signals: DigestSignal[]): DigestSignal[] {
  const byFp = new Map<string, DigestSignal>();
  const sorted = [...signals].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const s of sorted) {
    const fp = signalFingerprint(s);
    if (!byFp.has(fp)) byFp.set(fp, s);
  }
  return Array.from(byFp.values());
}

/** Within each (signal_type, action) bucket, drop near-duplicates by similar what_changed; keep best (confidence, recency). */
export function nearDedupeInBuckets(signals: DigestSignal[]): DigestSignal[] {
  const bucketKey = (s: DigestSignal) =>
    `${(s.signal_type ?? "Other").trim()}\0${(s.action ?? "Monitor").trim()}`;
  const byBucket = new Map<string, DigestSignal[]>();
  for (const s of signals) {
    const key = bucketKey(s);
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key)!.push(s);
  }
  const out: DigestSignal[] = [];
  for (const [, bucket] of byBucket) {
    const sorted = [...bucket].sort((a, b) => {
      const cr = getConfidenceRank(b.confidence) - getConfidenceRank(a.confidence);
      if (cr !== 0) return cr;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const kept: DigestSignal[] = [];
    for (const s of sorted) {
      const norm = normalizeForDedupe(s.what_changed);
      if (!norm) {
        kept.push(s);
        continue;
      }
      const similar = kept.some((k) => {
        const nk = normalizeForDedupe(k.what_changed);
        return isNearDuplicateWhatChanged(norm, nk);
      });
      if (!similar) kept.push(s);
    }
    out.push(...kept);
  }
  return out;
}

/** Sort by confidence (High > Medium > Low), then action (Act > Monitor > Ignore), then newest first. */
export function prioritizeSignals(signals: DigestSignal[]): DigestSignal[] {
  return [...signals].sort((a, b) => {
    const cr = getConfidenceRank(b.confidence) - getConfidenceRank(a.confidence);
    if (cr !== 0) return cr;
    const ar = getActionRank(b.action) - getActionRank(a.action);
    if (ar !== 0) return ar;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

const MAX_PER_TYPE_ACTION = 3;

/** Cap with diversity: max 3 per (signal_type, action), max total from param; within each bucket only one per unique normalized what_changed. */
export function capSignalsWithDiversity(
  signals: DigestSignal[],
  maxTotalSignals: number = 12
): { capped: DigestSignal[]; additionalCount: number } {
  const bucketSeen = new Map<string, Set<string>>();
  const bucketCount = new Map<string, number>();
  const capped: DigestSignal[] = [];
  for (const s of signals) {
    if (capped.length >= maxTotalSignals) break;
    const key = `${(s.signal_type || "Other").trim()}\0${(s.action || "Monitor").trim()}`;
    const n = bucketCount.get(key) ?? 0;
    if (n >= MAX_PER_TYPE_ACTION) continue;
    const whatNorm = normalizeForDedupe(s.what_changed);
    const seen = bucketSeen.get(key);
    if (seen?.has(whatNorm)) continue;
    if (!bucketSeen.has(key)) bucketSeen.set(key, new Set());
    bucketSeen.get(key)!.add(whatNorm);
    bucketCount.set(key, n + 1);
    capped.push(s);
  }
  const additionalCount = Math.max(0, signals.length - capped.length);
  return { capped, additionalCount };
}

export type PrepareDigestResult = {
  signals: DigestSignal[];
  additionalCount: number;
  signals_before_filter: number;
  signals_after_primary_dedupe: number;
  signals_after_near_dedupe: number;
  signals_sent: number;
  signals_truncated: number;
  dedupeApplied: boolean;
};

/**
 * Central pipeline: primary dedupe → near dedupe → prioritize → cap (with diversity).
 * Dedupe runs BEFORE grouping and BEFORE caps. Use for both manual send and cron send.
 * maxTotalSignals: plan-dependent (e.g. 6 free, 12 pro).
 */
export function prepareDigestSignals(
  signals: DigestSignal[],
  maxTotalSignals: number = 12
): PrepareDigestResult {
  const signals_before_filter = signals.length;
  const afterPrimary = primaryDedupeSignals(signals);
  const signals_after_primary_dedupe = afterPrimary.length;
  const afterNear = nearDedupeInBuckets(afterPrimary);
  const signals_after_near_dedupe = afterNear.length;
  const prioritized = prioritizeSignals(afterNear);
  const { capped, additionalCount } = capSignalsWithDiversity(prioritized, maxTotalSignals);
  const signals_sent = capped.length;
  const signals_truncated = additionalCount;
  const dedupeApplied =
    signals_after_primary_dedupe < signals_before_filter || signals_after_near_dedupe < signals_after_primary_dedupe;

  return {
    signals: capped,
    additionalCount,
    signals_before_filter,
    signals_after_primary_dedupe,
    signals_after_near_dedupe,
    signals_sent,
    signals_truncated,
    dedupeApplied,
  };
}

/**
 * Reusable digest query: last N hours of user's signals, filtered by preferences.
 * Future: can be extended to include global ingested signals.
 */
export async function getDigestSignals(
  supabase: SupabaseClient,
  options: {
    userId: string;
    windowHours: number;
    prefs: DigestPreferences;
  }
): Promise<DigestSignal[]> {
  const { userId, windowHours, prefs } = options;
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowHours * 60 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from("signals")
    .select("id, idx, signal_type, action, confidence, what_changed, why_it_matters, who_this_affects, created_at")
    .eq("user_id", userId)
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;

  const signals = (rows || []) as DigestSignal[];
  const typesSet = new Set((prefs.signal_types || []).map((s) => s.trim()));
  const actionsSet = new Set((prefs.actions || []).map((s) => s.trim()));
  const minRank = getConfidenceRank(prefs.min_confidence);

  return signals.filter((s) => {
    if (!typesSet.has((s.signal_type || "").trim())) return false;
    if (!actionsSet.has((s.action || "").trim())) return false;
    if (getConfidenceRank(s.confidence) < minRank) return false;
    return true;
  });
}

/** Group signals for display/email: by signal_type -> action -> items */
export function groupSignalsForDigest(signals: DigestSignal[]): Map<string, Map<string, DigestSignal[]>> {
  const byType = new Map<string, Map<string, DigestSignal[]>>();
  for (const s of signals) {
    const typeKey = s.signal_type || "Other";
    const actionKey = s.action || "Monitor";
    if (!byType.has(typeKey)) byType.set(typeKey, new Map());
    const byAction = byType.get(typeKey)!;
    if (!byAction.has(actionKey)) byAction.set(actionKey, []);
    byAction.get(actionKey)!.push(s);
  }
  return byType;
}
