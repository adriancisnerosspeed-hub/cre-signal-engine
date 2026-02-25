import type { SupabaseClient } from "@supabase/supabase-js";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get today's usage for user. Requires client with read access to usage_daily. */
export async function getUsageToday(
  supabase: SupabaseClient,
  userId: string
): Promise<{ analyze_calls: number; tokens_estimated: number }> {
  const date = todayDateStr();
  const { data } = await supabase
    .from("usage_daily")
    .select("analyze_calls, tokens_estimated, deal_scans")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  const row = data as { analyze_calls?: number; tokens_estimated?: number; deal_scans?: number } | null;
  return {
    analyze_calls: row?.analyze_calls ?? 0,
    tokens_estimated: row?.tokens_estimated ?? 0,
    deal_scans: row?.deal_scans ?? 0,
  };
}

/** Increment analyze usage for today. Call with service role client. Uses RPC for atomic upsert (no race conditions). */
export async function incrementAnalyzeUsage(
  supabase: SupabaseClient,
  userId: string,
  tokensEstimated: number
): Promise<void> {
  const date = todayDateStr();
  const { error } = await supabase.rpc("increment_usage_daily", {
    p_user_id: userId,
    p_date: date,
    p_tokens_estimated: Math.round(tokensEstimated) || 0,
  });
  if (error) throw error;
}

/** Get today's deal scan count for user. */
export async function getDealScansToday(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const date = todayDateStr();
  const { data } = await supabase
    .from("usage_daily")
    .select("deal_scans")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return (data as { deal_scans?: number } | null)?.deal_scans ?? 0;
}

/** Increment deal scan usage for today. Call with service role client. */
export async function incrementDealScanUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const date = todayDateStr();
  const { error } = await supabase.rpc("increment_usage_daily_deal_scans", {
    p_user_id: userId,
    p_date: date,
  });
  if (error) throw error;
}
