import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireOwner } from "@/lib/ownerAuth";
import { OWNER_EMAIL } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const to = session.user.email ?? OWNER_EMAIL;
  if (!to) {
    return NextResponse.json({ error: "No recipient email" }, { status: 400 });
  }

  const resend = new Resend(key);
  const from = process.env.RESEND_FROM ?? "CRE Signals <onboarding@resend.dev>";

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "[CRE Signal] Owner dev test email",
      html: `<p>This is a test message from the <code>/owner/dev</code> dashboard.</p><p>Sent at ${new Date().toISOString()}</p>`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
