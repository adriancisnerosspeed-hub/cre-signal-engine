import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnerSession = { user: User; supabase: SupabaseClient };

/**
 * Server-only: authenticated user whose email matches OWNER_EMAIL.
 */
export async function requireOwner(): Promise<OwnerSession | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwner(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user, supabase };
}
