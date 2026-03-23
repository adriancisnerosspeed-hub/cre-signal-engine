import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const DEFAULT_FROM = "CRE Signals <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendDemoSnapshotEmail(options: {
  to: string;
  recipientName: string;
  calendlyUrl: string;
  pdfBase64: string;
  pdfFilename?: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const bookUrl = options.calendlyUrl || "https://calendly.com";
  const filename = options.pdfFilename ?? "CRE-Signal-Sample-IC-Memo.pdf";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your sample IC memo</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.55; color: #0a0a0a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 18px; margin-bottom: 8px;">Your sample IC memorandum PDF</h1>
  <p style="color: #444; font-size: 15px;">Hi ${escapeHtml(options.recipientName)},</p>
  <p style="color: #444; font-size: 15px;">Attached is a personalized <strong>sample</strong> CRE Signal Engine IC memo PDF based on what you submitted. It illustrates deterministic scoring, banding, and export formatting — not investment advice.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(bookUrl)}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Book a 15-minute walkthrough</a>
  </p>
  <p style="font-size: 12px; color: #666;">CRE Signal Risk Index™ is an underwriting support tool. Final investment decisions remain with you and your advisors.</p>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: "Your CRE Signal sample IC memo + booking link",
      html,
      attachments: [{ filename, content: options.pdfBase64 }],
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
