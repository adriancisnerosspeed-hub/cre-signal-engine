import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processOutbox } from "@/lib/email/processOutbox";

const BATCH_SIZE = 10;

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return Boolean(expected && bearerSecret === expected);
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  try {
    const result = await processOutbox(service, BATCH_SIZE);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
