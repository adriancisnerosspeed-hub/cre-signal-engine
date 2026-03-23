import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/ownerAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type DebugAction =
  | "stripe_webhook_status"
  | "reset_total_full_scans"
  | "clear_usage_daily_for_user";

export async function POST(request: Request) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: { action?: string; user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as DebugAction | undefined;
  const service = createServiceRoleClient();

  switch (action) {
    case "stripe_webhook_status": {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      return NextResponse.json({
        stripe_webhook_secret_configured: Boolean(secret && secret.length > 0),
        stripe_secret_key_configured: Boolean(process.env.STRIPE_SECRET_KEY),
      });
    }

    case "reset_total_full_scans": {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!userId) {
        return NextResponse.json({ error: "user_id required" }, { status: 400 });
      }
      const { error } = await service.from("profiles").update({ total_full_scans_used: 0 }).eq("id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, total_full_scans_used: 0 });
    }

    case "clear_usage_daily_for_user": {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!userId) {
        return NextResponse.json({ error: "user_id required" }, { status: 400 });
      }
      const { error } = await service.from("usage_daily").delete().eq("user_id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, cleared_usage_daily_for_user: userId });
    }

    default:
      return NextResponse.json(
        {
          error: "Unknown action",
          allowed: ["stripe_webhook_status", "reset_total_full_scans", "clear_usage_daily_for_user"] as const,
        },
        { status: 400 }
      );
  }
}
