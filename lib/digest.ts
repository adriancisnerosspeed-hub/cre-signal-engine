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

/** Stable fingerprint for deduplication. */
export function signalFingerprint(s: DigestSignal): string {
  const parts = [
    (s.signal_type ?? "").trim(),
    (s.action ?? "").trim(),
    (s.confidence ?? "").trim(),
    (s.what_changed ?? "").trim().replace(/\s+/g, " "),
    (s.why_it_matters ?? "").trim().replace(/\s+/g, " "),
    (s.who_this_affects ?? "").trim().replace(/\s+/g, " "),
  ];
  return parts.join("\0");
}

/** Keep only the most recent signal per fingerprint (order by created_at desc first). */
export function dedupeSignals(signals: DigestSignal[]): DigestSignal[] {
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
const MAX_TOTAL_SIGNALS = 12;

/** Apply caps: max 3 per (signal_type, action), max 12 total. Returns capped list and count of omitted. */
export function capSignals(signals: DigestSignal[]): { capped: DigestSignal[]; additionalCount: number } {
  const typeActionCount = new Map<string, number>();
  const capped: DigestSignal[] = [];
  for (const s of signals) {
    if (capped.length >= MAX_TOTAL_SIGNALS) break;
    const key = `${(s.signal_type || "Other").trim()}\0${(s.action || "Monitor").trim()}`;
    const n = typeActionCount.get(key) ?? 0;
    if (n >= MAX_PER_TYPE_ACTION) continue;
    typeActionCount.set(key, n + 1);
    capped.push(s);
  }
  const additionalCount = Math.max(0, signals.length - capped.length);
  return { capped, additionalCount };
}

export type PrepareDigestResult = {
  signals: DigestSignal[];
  additionalCount: number;
  beforeDedupe: number;
  afterDedupe: number;
};

/**
 * Central pipeline: dedupe → prioritize → cap.
 * Use this for both manual send and cron send.
 */
export function prepareDigestSignals(signals: DigestSignal[]): PrepareDigestResult {
  const beforeDedupe = signals.length;
  const deduped = dedupeSignals(signals);
  const afterDedupe = deduped.length;
  const prioritized = prioritizeSignals(deduped);
  const { capped, additionalCount } = capSignals(prioritized);
  return {
    signals: capped,
    additionalCount,
    beforeDedupe,
    afterDedupe,
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
