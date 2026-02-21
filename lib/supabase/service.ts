import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only. Use only in cron or trusted server routes.
 * Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY for service role client");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
