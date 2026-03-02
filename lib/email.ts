import { Resend } from "resend";
import type { DigestSignal } from "@/lib/digest";
import { groupSignalsForDigest } from "@/lib/digest";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const DEFAULT_FROM = "CRE Signals <onboarding@resend.dev>";

function oneLine(s: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "—";
}

export function buildDigestSubject(localDateStr: string, count: number): string {
  return `CRE Signals Digest — ${localDateStr} — ${count} actionable signal${count !== 1 ? "s" : ""}`;
}

export function buildNoSignalsSubject(localDateStr: string): string {
  return `CRE Signals Digest — ${localDateStr} — No new signals`;
}

export function buildNoSignalsHtmlBody(periodStart: Date, periodEnd: Date, baseUrl: string): string {
  const rangeStr = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;
  const appUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/app` : "/app";
  const previewUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/digest/preview` : "/digest/preview";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>CRE Signals Digest</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 18px; margin-bottom: 4px;">CRE Signals Digest</h1>
  <p style="color: #666; font-size: 13px; margin-bottom: 20px;">${rangeStr} (last 24 hours)</p>
  <p style="font-size: 15px; color: #333;">No new actionable signals in the past 24 hours.</p>
  <p style="margin-top: 24px; font-size: 12px; color: #666;">
    <a href="${escapeHtml(appUrl)}" style="color: #2563eb;">Dashboard</a> · <a href="${escapeHtml(previewUrl)}" style="color: #2563eb;">Digest preview</a>
  </p>
</body>
</html>`;
}

export function buildDigestHtmlBody(
  signals: DigestSignal[],
  periodStart: Date,
  periodEnd: Date,
  baseUrl: string,
  additionalCount = 0,
  dedupeApplied = false
): string {
  const grouped = groupSignalsForDigest(signals);
  const rangeStr = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;

  let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>CRE Signals Digest</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 18px; margin-bottom: 4px;">CRE Signals Digest</h1>
  <p style="color: #666; font-size: 13px; margin-bottom: 20px;">${rangeStr} (last 24 hours)</p>
`;
  if (dedupeApplied) {
    html += `  <p style="font-size: 12px; color: #666; margin-bottom: 16px;">Deduped similar signals for readability.</p>\n`;
  }

  for (const [signalType, byAction] of grouped) {
    html += `  <h2 style="font-size: 14px; font-weight: 600; margin-top: 20px; margin-bottom: 8px;">${escapeHtml(signalType)}</h2>\n`;
    for (const [action, items] of byAction) {
      html += `  <h3 style="font-size: 12px; font-weight: 600; color: #444; margin-top: 12px;">${escapeHtml(action)}</h3>\n  <ul style="margin: 4px 0 12px 0; padding-left: 20px;">\n`;
      for (const s of items) {
        html += `    <li style="margin-bottom: 8px;">
      <strong>What changed:</strong> ${escapeHtml(oneLine(s.what_changed))}<br/>
      <strong>Why it matters:</strong> ${escapeHtml(oneLine(s.why_it_matters))}<br/>
      <strong>Who this affects:</strong> ${escapeHtml(oneLine(s.who_this_affects))}<br/>
      <em>Confidence: ${escapeHtml(s.confidence || "—")}</em>
    </li>\n`;
      }
      html += `  </ul>\n`;
    }
  }

  if (additionalCount > 0) {
    html += `  <p style="margin-top: 16px; font-size: 13px; color: #555;">+${additionalCount} additional signal${additionalCount !== 1 ? "s" : ""} available in your dashboard.</p>\n`;
  }

  const appUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/app` : "/app";
  const previewUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/digest/preview` : "/digest/preview";
  html += `
  <p style="margin-top: 24px; font-size: 12px; color: #666;">
    <a href="${escapeHtml(appUrl)}" style="color: #2563eb;">Dashboard</a> · <a href="${escapeHtml(previewUrl)}" style="color: #2563eb;">Digest preview</a>
  </p>
</body>
</html>`;
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendDigestEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

const WORKSPACE_INVITE_SUBJECT = "You've been invited to CRE Signal Workspace";

export async function sendWorkspaceInviteEmail(options: {
  to: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Workspace invite</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 18px;">${WORKSPACE_INVITE_SUBJECT}</h1>
  <p style="color: #444;">${escapeHtml(options.inviterName)} invited you to join <strong>${escapeHtml(options.orgName)}</strong> on CRE Signal.</p>
  <p style="margin: 24px 0;"><a href="${escapeHtml(options.inviteLink)}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept invite</a></p>
  <p style="font-size: 12px; color: #666;">If you didn’t expect this invite, you can ignore this email.</p>
</body>
</html>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: options.to,
      subject: WORKSPACE_INVITE_SUBJECT,
      html,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
