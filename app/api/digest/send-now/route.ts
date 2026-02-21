import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getDigestSignals, getDefaultPreferences, prepareDigestSignals } from "@/lib/digest";
import {
  buildDigestSubject,
  buildDigestHtmlBody,
  buildNoSignalsSubject,
  buildNoSignalsHtmlBody,
  sendDigestEmail,
} from "@/lib/email";

const WINDOW_HOURS = 24;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: prefsRow } = await supabase
    .from("user_preferences")
    .select("signal_types, actions, min_confidence")
    .eq("user_id", user.id)
    .maybeSingle();

  const defaults = getDefaultPreferences();
  const prefs = prefsRow
    ? {
        signal_types: prefsRow.signal_types ?? defaults.signal_types,
        actions: prefsRow.actions ?? defaults.actions,
        min_confidence: prefsRow.min_confidence ?? defaults.min_confidence,
      }
    : defaults;

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  let rawSignals;
  try {
    rawSignals = await getDigestSignals(supabase, {
      userId: user.id,
      windowHours: WINDOW_HOURS,
      prefs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const prepared = prepareDigestSignals(rawSignals);
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
  const localDateStr = periodEnd.toISOString().slice(0, 10);
  const scheduledForDate = localDateStr;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (signals.length === 0) {
    const subject = buildNoSignalsSubject(localDateStr);
    const html = buildNoSignalsHtmlBody(periodStart, periodEnd, baseUrl);
    const sendResult = await sendDigestEmail({ to: user.email, subject, html });
    const { error: insertErr } = await supabase.from("digest_sends").insert({
      user_id: user.id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      scheduled_for_date: scheduledForDate,
      sent_at: sendResult.success ? new Date().toISOString() : null,
      num_signals: 0,
      status: sendResult.success ? "sent" : "error",
      error_message: sendResult.error ?? null,
    });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    if (!sendResult.success) {
      return NextResponse.json(
        { error: "No-signal email failed: " + (sendResult.error ?? "unknown") },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: "No new actionable signals in the past 24 hours. Digest email sent.",
      num_signals: 0,
      debug: {
        signals_before_filter,
        signals_after_primary_dedupe,
        signals_after_near_dedupe,
        signals_sent: 0,
        signals_truncated: 0,
      },
    });
  }

  const subject = buildDigestSubject(localDateStr, signals.length);
  const html = buildDigestHtmlBody(signals, periodStart, periodEnd, baseUrl, additionalCount, dedupeApplied);
  const sendResult = await sendDigestEmail({ to: user.email, subject, html });

  const { error: insertErr } = await supabase.from("digest_sends").insert({
    user_id: user.id,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    scheduled_for_date: scheduledForDate,
    sent_at: sendResult.success ? new Date().toISOString() : null,
    num_signals: signals.length,
    status: sendResult.success ? "sent" : "error",
    error_message: sendResult.error ?? null,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (!sendResult.success) {
    return NextResponse.json(
      { error: "Digest logged but email failed: " + (sendResult.error ?? "unknown") },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Digest sent to ${user.email}`,
    num_signals: signals.length,
    additional_count: additionalCount,
    debug: {
      signals_before_filter,
      signals_after_primary_dedupe,
      signals_after_near_dedupe,
      signals_sent,
      signals_truncated,
    },
  });
}
