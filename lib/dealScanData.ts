import type { SupabaseClient } from "@supabase/supabase-js";

export type DealRiskRow = {
  id: string;
  risk_type: string;
  severity_original: string;
  severity_current: string;
  what_changed_or_trigger: string | null;
  why_it_matters: string | null;
  who_this_affects: string | null;
  recommended_action: string | null;
  confidence: string | null;
};

export type LinkRow = { deal_risk_id: string; signal_id: string; link_reason: string | null };
export type SignalRow = { id: string; signal_type: string | null; what_changed: string | null };

export type LinksByRisk = Record<
  string,
  { signal_id: string; link_reason: string | null; signal_type: string | null; what_changed: string | null }[]
>;

export async function loadRisksAndLinks(
  supabase: SupabaseClient,
  riskIds: string[]
): Promise<LinksByRisk> {
  if (riskIds.length === 0) return {};
  const { data: linkRows } = await supabase
    .from("deal_signal_links")
    .select("deal_risk_id, signal_id, link_reason")
    .in("deal_risk_id", riskIds);
  const links = (linkRows ?? []) as LinkRow[];
  const signalIds = [...new Set(links.map((l) => l.signal_id))];
  let signalsMap: Record<string, SignalRow> = {};
  if (signalIds.length > 0) {
    const { data: signalRows } = await supabase
      .from("signals")
      .select("id, signal_type, what_changed")
      .in("id", signalIds);
    for (const s of (signalRows ?? []) as SignalRow[]) {
      signalsMap[String(s.id)] = s;
    }
  }
  const linksByRisk: LinksByRisk = {};
  for (const link of links) {
    const sig = signalsMap[String(link.signal_id)];
    if (!linksByRisk[link.deal_risk_id]) linksByRisk[link.deal_risk_id] = [];
    const arr = linksByRisk[link.deal_risk_id];
    const seen = new Set(arr.map((x) => String(x.signal_id)));
    if (!seen.has(String(link.signal_id))) {
      arr.push({
        signal_id: String(link.signal_id),
        link_reason: link.link_reason,
        signal_type: sig?.signal_type ?? null,
        what_changed: sig?.what_changed ?? null,
      });
    }
  }
  for (const riskId of Object.keys(linksByRisk)) {
    const arr = linksByRisk[riskId];
    const bySignalId = new Map<string, (typeof arr)[0]>();
    for (const link of arr) {
      bySignalId.set(String(link.signal_id), link);
    }
    const byDisplayText = new Map<string, (typeof arr)[0]>();
    for (const link of bySignalId.values()) {
      const displayText = `${link.signal_type ?? ""}\n${link.what_changed ?? ""}`.trim();
      if (!byDisplayText.has(displayText)) byDisplayText.set(displayText, link);
    }
    linksByRisk[riskId] = [...byDisplayText.values()];
  }
  return linksByRisk;
}

/** Lightweight diff: added risks, removed risks, severity changes. Key by risk_type + truncated description. */
export function diffRisks(
  current: DealRiskRow[],
  previous: DealRiskRow[]
): {
  added: DealRiskRow[];
  removed: DealRiskRow[];
  severityChanges: { risk: DealRiskRow; previousSeverity: string }[];
} {
  const key = (r: DealRiskRow) =>
    `${r.risk_type}|${(r.what_changed_or_trigger ?? "").slice(0, 80)}`;
  const prevMap = new Map(previous.map((r) => [key(r), r]));
  const currMap = new Map(current.map((r) => [key(r), r]));

  const added: DealRiskRow[] = [];
  const removed: DealRiskRow[] = [];
  const severityChanges: { risk: DealRiskRow; previousSeverity: string }[] = [];

  for (const [k, c] of currMap) {
    const p = prevMap.get(k);
    if (!p) added.push(c);
    else if (p.severity_current !== c.severity_current)
      severityChanges.push({ risk: c, previousSeverity: p.severity_current });
  }
  for (const [k, p] of prevMap) {
    if (!currMap.has(k)) removed.push(p);
  }

  return { added, removed, severityChanges };
}
