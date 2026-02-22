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
    .select("analyze_calls, tokens_estimated")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return {
    analyze_calls: data?.analyze_calls ?? 0,
    tokens_estimated: data?.tokens_estimated ?? 0,
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
