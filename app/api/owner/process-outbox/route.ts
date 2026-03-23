import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/ownerAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processOutbox } from "@/lib/email/processOutbox";

export const runtime = "nodejs";

/**
 * Manually triggers email outbox processing from the owner dev tools.
 * This is the same logic as the cron job but invokable on demand.
 */
export async function POST() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const service = createServiceRoleClient();
  const result = await processOutbox(service, 10);
  return NextResponse.json({ ok: true, ...result });
}
