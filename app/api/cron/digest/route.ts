import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getDigestSignals, getDefaultPreferences, prepareDigestSignals } from "@/lib/digest";
import { getEntitlementsForUser } from "@/lib/entitlements";
import {
  buildDigestSubject,
  buildDigestHtmlBody,
  buildNoSignalsSubject,
  buildNoSignalsHtmlBody,
  sendDigestEmail,
} from "@/lib/email";

const WINDOW_HOURS = 24;
const BATCH_SIZE = 10;
const SEND_WINDOW_MINUTES = 5;

function getLocalTimeInTimezone(timezone: string): { dateStr: string; timeStr: string } {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }); // HH:mm
  return { dateStr, timeStr };
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function isInSendWindow(digestTimeLocal: string, localTimeStr: string): boolean {
  const end = addMinutesToHHMM(digestTimeLocal, SEND_WINDOW_MINUTES);
  return localTimeStr >= digestTimeLocal && localTimeStr < end;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const provided = bearerSecret || querySecret;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const { data: prefsRows, error: prefsError } = await supabase
    .from("user_preferences")
    .select("user_id, timezone, digest_time_local, signal_types, actions, min_confidence")
    .eq("digest_enabled", true);

  if (prefsError) {
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  const now = new Date();
  const inWindow: typeof prefsRows = [];
  for (const row of prefsRows || []) {
    const { timeStr } = getLocalTimeInTimezone(row.timezone || "America/Chicago");
    const digestTime = (row.digest_time_local || "07:00").trim();
    if (isInSendWindow(digestTime, timeStr)) {
      inWindow.push(row);
    }
  }

  const userIds = [...new Set((inWindow || []).map((r) => r.user_id))];
  const { data: proProfiles } = await supabase
    .from("profiles")
    .select("id")
    .in("id", userIds)
    .in("role", ["pro", "owner"]);
  const proOrOwnerIds = new Set(proProfiles?.map((p) => p.id) ?? []);
  const toProcess = inWindow.filter((r) => proOrOwnerIds.has(r.user_id));
  if (inWindow.length > toProcess.length && process.env.NODE_ENV !== "test") {
    console.log(JSON.stringify({
      digest_cron: true,
      scheduled_skipped_non_pro: inWindow.length - toProcess.length,
      reason: "scheduled digest is Pro only",
    }));
  }

  const defaults = getDefaultPreferences();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (prefsRow) => {
        const userId = prefsRow.user_id;
        const timezone = prefsRow.timezone || defaults.timezone;
        const { dateStr: scheduledForDate } = getLocalTimeInTimezone(timezone);
        const prefs = {
          signal_types: prefsRow.signal_types ?? defaults.signal_types,
          actions: prefsRow.actions ?? defaults.actions,
          min_confidence: prefsRow.min_confidence ?? defaults.min_confidence,
        };

        try {
          const { data: existing } = await supabase
            .from("digest_sends")
            .select("id")
            .eq("user_id", userId)
            .eq("scheduled_for_date", scheduledForDate)
            .in("status", ["sent", "skipped"])
            .limit(1)
            .maybeSingle();

          if (existing) {
            skipped++;
            return;
          }

          const periodEnd = new Date();
          const periodStart = new Date(periodEnd.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
          const rawSignals = await getDigestSignals(supabase, {
            userId,
            windowHours: WINDOW_HOURS,
            prefs,
          });

          const entitlements = await getEntitlementsForUser(supabase, userId);
          const prepared = prepareDigestSignals(rawSignals, entitlements.email_digest_max_signals);
          const {
            signals,
            additionalCount,
            signals_before_filter,
            signals_after_primary_dedupe,
            signals_after_near_dedupe,
            signals_sent,
            signals_truncated,
            dedupeApplied,
          } = prepared;
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

          if (process.env.NODE_ENV !== "test") {
            console.log(JSON.stringify({
              digest_cron: true,
              user_id: userId,
              signals_before_filter,
              signals_after_primary_dedupe,
              signals_after_near_dedupe,
              signals_sent,
              signals_truncated,
            }));
          }

          const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId);
          if (authErr || !authUser?.user?.email) {
            await supabase.from("digest_sends").insert({
              user_id: userId,
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString(),
              scheduled_for_date: scheduledForDate,
              sent_at: null,
              num_signals: signals.length,
              status: "error",
              error_message: "No email for user",
            });
            errors++;
            return;
          }

          if (signals.length === 0) {
            const subject = buildNoSignalsSubject(scheduledForDate);
            const html = buildNoSignalsHtmlBody(periodStart, periodEnd, baseUrl);
            const sendResult = await sendDigestEmail({
              to: authUser.user.email,
              subject,
              html,
            });
            await supabase.from("digest_sends").insert({
              user_id: userId,
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString(),
              scheduled_for_date: scheduledForDate,
              sent_at: sendResult.success ? new Date().toISOString() : null,
              num_signals: 0,
              status: sendResult.success ? "sent" : "error",
              error_message: sendResult.error ?? null,
            });
            if (sendResult.success) sent++;
            else errors++;
            return;
          }

          const subject = buildDigestSubject(scheduledForDate, signals.length);
          const html = buildDigestHtmlBody(signals, periodStart, periodEnd, baseUrl, additionalCount, dedupeApplied);
          const sendResult = await sendDigestEmail({
            to: authUser.user.email,
            subject,
            html,
          });

          await supabase.from("digest_sends").insert({
            user_id: userId,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
            scheduled_for_date: scheduledForDate,
            sent_at: sendResult.success ? new Date().toISOString() : null,
            num_signals: signals.length,
            status: sendResult.success ? "sent" : "error",
            error_message: sendResult.error ?? null,
          });

          if (sendResult.success) sent++;
          else errors++;
        } catch (e) {
          errors++;
          try {
            await supabase.from("digest_sends").insert({
              user_id: userId,
              period_start: now.toISOString(),
              period_end: now.toISOString(),
              scheduled_for_date: scheduledForDate,
              sent_at: null,
              num_signals: 0,
              status: "error",
              error_message: e instanceof Error ? e.message : String(e),
            });
          } catch {
            // ignore insert failure
          }
        }
      })
    );
  }

  return NextResponse.json({
    ok: true,
    checked: toProcess.length,
    sent,
    skipped,
    errors,
  });
}
