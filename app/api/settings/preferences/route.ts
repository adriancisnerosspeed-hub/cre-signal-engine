import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getDefaultPreferences,
  DEFAULT_SIGNAL_TYPES,
  DEFAULT_ACTIONS,
} from "@/lib/digest";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const defaults = getDefaultPreferences();
  const prefs = row
    ? {
        signal_types: row.signal_types ?? defaults.signal_types,
        actions: row.actions ?? defaults.actions,
        min_confidence: row.min_confidence ?? defaults.min_confidence,
        timezone: row.timezone ?? defaults.timezone,
        digest_time_local: row.digest_time_local ?? defaults.digest_time_local,
        digest_enabled: row.digest_enabled ?? defaults.digest_enabled,
      }
    : defaults;

  return NextResponse.json(prefs);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    signal_types?: string[];
    actions?: string[];
    min_confidence?: string;
    timezone?: string;
    digest_time_local?: string;
    digest_enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowedConf = ["Low", "Medium", "High"];
  const signal_types = Array.isArray(body.signal_types)
    ? body.signal_types.filter((s) => typeof s === "string")
    : DEFAULT_SIGNAL_TYPES;
  const actions = Array.isArray(body.actions)
    ? body.actions.filter((s) => typeof s === "string")
    : DEFAULT_ACTIONS;
  const min_confidence = allowedConf.includes(body.min_confidence ?? "")
    ? body.min_confidence!
    : "Medium";
  const timezone = typeof body.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim()
    : "America/Chicago";
  const digest_time_local = typeof body.digest_time_local === "string" && /^\d{1,2}:\d{2}$/.test(body.digest_time_local.trim())
    ? body.digest_time_local.trim()
    : "07:00";
  const digest_enabled = typeof body.digest_enabled === "boolean" ? body.digest_enabled : true;

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      signal_types,
      actions,
      min_confidence,
      timezone,
      digest_time_local,
      digest_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
