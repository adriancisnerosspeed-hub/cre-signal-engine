import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildDemoSnapshotPdfBytes } from "@/lib/marketing/demoSnapshotPdf";
import { sendDemoSnapshotEmail } from "@/lib/email/sendDemoSnapshotEmail";

export const runtime = "nodejs";

const DEMO_RATE_LIMIT = 5;
const DEMO_RATE_WINDOW_MS = 15 * 60 * 1000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isDemoRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + DEMO_RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > DEMO_RATE_LIMIT;
}

const DEAL_TYPES = [
  "Multifamily",
  "Office",
  "Industrial",
  "Retail",
  "Hospitality",
  "Mixed-use",
  "Other",
] as const;

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Valid email required"),
  firm: z.string().trim().min(1, "Firm is required").max(200),
  dealType: z.enum(DEAL_TYPES),
  rawAssumptions: z.string().max(12000).optional(),
});

function getCalendlyUrl(): string {
  return (
    process.env.DEMO_CALENDLY_URL ||
    process.env.NEXT_PUBLIC_CALENDLY_URL ||
    "https://calendly.com"
  );
}

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  if (isDemoRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    const first =
      Object.values(msg).flat()[0] || parsed.error.errors[0]?.message || "Invalid input";
    return NextResponse.json({ error: first, fields: msg }, { status: 400 });
  }

  const { name, email, firm, dealType, rawAssumptions } = parsed.data;

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "Lead capture is temporarily unavailable." },
      { status: 503 }
    );
  }

  const deal_assumptions: Record<string, unknown> = {
    dealType,
    ...(rawAssumptions && rawAssumptions.trim().length > 0
      ? { rawAssumptions: rawAssumptions.trim() }
      : {}),
  };

  const { error: insertError } = await service.from("leads").insert({
    email: email.toLowerCase(),
    name,
    firm,
    deal_assumptions,
    source: "demo_snapshot",
  });

  if (insertError) {
    console.error("[demo-snapshot] lead insert:", insertError.message);
    return NextResponse.json({ error: "Could not save your request." }, { status: 500 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildDemoSnapshotPdfBytes({
      name,
      firm,
      dealType,
      rawAssumptions: rawAssumptions?.trim() || undefined,
    });
  } catch (e) {
    console.error("[demo-snapshot] pdf:", e);
    return NextResponse.json({ error: "Could not generate sample PDF." }, { status: 500 });
  }

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
  const send = await sendDemoSnapshotEmail({
    to: email.toLowerCase(),
    recipientName: name,
    calendlyUrl: getCalendlyUrl(),
    pdfBase64,
  });

  if (!send.success) {
    console.error("[demo-snapshot] email:", send.error);
    return NextResponse.json(
      {
        error: "Your request was saved, but we could not send email. Try again or contact support.",
        emailFailed: true,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
