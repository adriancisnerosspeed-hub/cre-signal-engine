"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { PolicyRow } from "./page";
import type { PolicyRule, PolicyEvaluationResult } from "@/lib/policy/types";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";
import { toast } from "@/lib/toast";

const RULE_TYPE_OPTIONS: { type: PolicyRule["type"]; label: string }[] = [
  { type: "MAX_ELEVATED_PLUS_PCT", label: "Max Elevated+ %" },
  { type: "MAX_HIGH_PCT", label: "Max High %" },
  { type: "MAX_TOP_MARKET_PCT", label: "Max Top Market %" },
  { type: "MAX_TOP_ASSET_TYPE_PCT", label: "Max Top Asset Type %" },
  { type: "MAX_LTV_PCT", label: "Max LTV %" },
  { type: "MAX_STALE_SCANS_PCT", label: "Max Stale Scans %" },
  { type: "MAX_PRPI", label: "Max PRPI" },
  { type: "MAX_DETERIORATING_PCT", label: "Max Deteriorating %" },
];

function defaultRule(type: PolicyRule["type"], id: string): PolicyRule {
  const base = { id, name: type.replace(/_/g, " "), enabled: true, severity: "warn" as const };
  switch (type) {
    case "MAX_ELEVATED_PLUS_PCT":
      return { ...base, type, threshold_pct: 25, scope: "scanned_only" };
    case "MAX_HIGH_PCT":
      return { ...base, type, threshold_pct: 15, scope: "scanned_only" };
    case "MAX_TOP_MARKET_PCT":
      return { ...base, type, threshold_pct: 40, scope: "all_deals" };
    case "MAX_TOP_ASSET_TYPE_PCT":
      return { ...base, type, threshold_pct: 40, scope: "all_deals" };
    case "MAX_LTV_PCT":
      return { ...base, type, threshold_pct: 80, scope: "scanned_only", applies_to: "all_scanned" };
    case "MAX_STALE_SCANS_PCT":
      return { ...base, type, threshold_pct: 20, stale_days: 30 };
    case "MAX_PRPI":
      return { ...base, type, threshold: 55 };
    case "MAX_DETERIORATING_PCT":
      return { ...base, type, threshold_pct: 15, delta_points: 8 };
    default:
      return { ...base, type: "MAX_ELEVATED_PLUS_PCT", threshold_pct: 25, scope: "scanned_only" };
  }
}

type Props = { initialPolicies: PolicyRow[] };

export function PolicyClient({ initialPolicies }: Props) {
  const [policies, setPolicies] = useState<PolicyRow[]>(initialPolicies);
  const [selectedId, setSelectedId] = useState<string | null>(initialPolicies[0]?.id ?? null);
  const [draft, setDraft] = useState<Partial<PolicyRow> & { rules_json?: PolicyRule[] }>({});
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<PolicyEvaluationResult | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  const selected = policies.find((p) => p.id === selectedId);
  const rules: PolicyRule[] = Array.isArray(draft.rules_json) ? draft.rules_json : Array.isArray(selected?.rules_json) ? (selected.rules_json as PolicyRule[]) : [];

  const loadDraft = useCallback((p: PolicyRow) => {
    setSelectedId(p.id);
    setDraft({
      name: p.name,
      description: p.description ?? "",
      is_enabled: p.is_enabled,
      is_shared: p.is_shared,
      rules_json: (p.rules_json as PolicyRule[]) ?? [],
    });
    setEvaluationResult(null);
    setDeleteConfirm(false);
  }, []);

  const updateDraft = useCallback((updates: Partial<typeof draft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  const addRule = useCallback((type: PolicyRule["type"]) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newRule = defaultRule(type, id);
    setDraft((prev) => ({
      ...prev,
      rules_json: [...(Array.isArray(prev.rules_json) ? prev.rules_json : []), newRule],
    }));
  }, []);

  const updateRule = useCallback((index: number, updates: Partial<PolicyRule>) => {
    setDraft((prev) => {
      const list = [...(Array.isArray(prev.rules_json) ? prev.rules_json : [])];
      list[index] = { ...list[index], ...updates } as PolicyRule;
      return { ...prev, rules_json: list };
    });
  }, []);

  const removeRule = useCallback((index: number) => {
    setDraft((prev) => {
      const list = [...(Array.isArray(prev.rules_json) ? prev.rules_json : [])];
      list.splice(index, 1);
      return { ...prev, rules_json: list };
    });
  }, []);

  const hasChanges = selected && Object.keys(draft).length > 0 && (
    (draft.name !== undefined && draft.name !== selected.name) ||
    (draft.description !== undefined && (draft.description ?? null) !== (selected.description ?? null)) ||
    (draft.is_enabled !== undefined && draft.is_enabled !== selected.is_enabled) ||
    (draft.is_shared !== undefined && draft.is_shared !== selected.is_shared) ||
    (Array.isArray(draft.rules_json) && JSON.stringify(draft.rules_json) !== JSON.stringify(selected.rules_json ?? []))
  );

  const handleSave = async () => {
    if (!selectedId || !hasChanges) return;
    setSaving(true);
    try {
      const r = await fetchJsonWithTimeout(`/api/risk-policies/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name ?? selected?.name,
          description: draft.description ?? selected?.description ?? null,
          is_enabled: draft.is_enabled ?? selected?.is_enabled,
          is_shared: draft.is_shared ?? selected?.is_shared,
          rules_json: draft.rules_json ?? selected?.rules_json ?? [],
        }),
      }, 15000);
      if (!r.ok) {
        const msg = (r.json?.message as string | undefined) ?? (r.json?.error as string | undefined) ?? `Failed to save policy (HTTP ${r.status})`;
        toast(msg, "error");
        return;
      }
      const updated = r.json;
      setPolicies((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
      setDraft({});
      setEvaluationResult(null);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to save policy", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedId) return;
    setEvaluating(true);
    setEvaluationResult(null);
    try {
      const r = await fetchJsonWithTimeout(`/api/risk-policies/${selectedId}/evaluate`, { method: "POST" }, 15000);
      if (!r.ok) {
        const msg = (r.json?.message as string | undefined) ?? (r.json?.error as string | undefined) ?? `Failed to run evaluation (HTTP ${r.status})`;
        toast(msg, "error");
        return;
      }
      const result: PolicyEvaluationResult = r.json as PolicyEvaluationResult;
      setEvaluationResult(result);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to run evaluation", "error");
    } finally {
      setEvaluating(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await fetchJsonWithTimeout("/api/risk-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New policy", description: null, is_enabled: true, is_shared: true, rules_json: [] }),
      }, 25000);
      if (!r.ok) {
        const msg = (r.json?.message as string | undefined) ?? (r.json?.error as string | undefined) ?? "Failed to create policy";
        toast(msg, "error");
        return;
      }
      const created = r.json as PolicyRow;
      setPolicies((prev) => [created, ...prev]);
      loadDraft(created);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Check your connection and try again." : "Failed to create policy", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !deleteConfirm) return;
    try {
      const r = await fetchJsonWithTimeout(`/api/risk-policies/${selectedId}`, { method: "DELETE" }, 15000);
      if (!r.ok) {
        const msg = (r.json?.message as string | undefined) ?? (r.json?.error as string | undefined) ?? `Failed to delete policy (HTTP ${r.status})`;
        toast(msg, "error");
        return;
      }
      setPolicies((prev) => prev.filter((p) => p.id !== selectedId));
      const next = policies.find((p) => p.id !== selectedId);
      setSelectedId(next?.id ?? null);
      setDraft(next ? { name: next.name, description: next.description, is_enabled: next.is_enabled, is_shared: next.is_shared, rules_json: (next.rules_json as PolicyRule[]) ?? [] } : {});
      setEvaluationResult(null);
      setDeleteConfirm(false);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : "Failed to delete policy", "error");
    }
  };

  return (
    <div className="flex gap-6 flex-wrap">
      <div className="min-w-[220px] flex-[0_0_220px]">
        <div className="mb-4">
          <Link href="/app/portfolio" className="text-muted-foreground text-sm no-underline hover:underline">
            &larr; Portfolio
          </Link>
        </div>
        <h1 className="text-[22px] font-semibold text-foreground mb-4">Governance</h1>
        <p className="text-[13px] text-muted-foreground mb-4">
          Define rules and run evaluations against your portfolio.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mb-4 px-4 py-2 rounded-md border border-purple-400/50 bg-purple-400/15 text-[#c4b5fd] font-medium text-sm"
          style={{ cursor: creating ? "wait" : "pointer" }}
        >
          {creating ? "Creating..." : "New policy"}
        </button>
        <ul className="list-none p-0 m-0">
          {policies.map((p) => (
            <li key={p.id} className="mb-2">
              <button
                type="button"
                onClick={() => loadDraft(p)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-foreground cursor-pointer text-sm ${
                  selectedId === p.id
                    ? "border-purple-400/60 bg-purple-400/10"
                    : "border-border bg-muted/50"
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {p.is_enabled ? "Enabled" : "Disabled"} &middot; {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-[1_1_400px] min-w-0">
        {selected ? (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <input
                type="text"
                value={draft.name ?? selected.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Policy name"
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[200px]"
              />
              <textarea
                value={draft.description ?? selected.description ?? ""}
                onChange={(e) => updateDraft({ description: e.target.value })}
                placeholder="Description (optional)"
                rows={1}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[240px] resize-y"
              />
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.is_enabled ?? selected.is_enabled}
                  onChange={(e) => updateDraft({ is_enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <h2 className="text-base font-semibold text-foreground mb-3">Rules</h2>
            <div className="mb-4">
              <select
                onChange={(e) => { const v = e.target.value as PolicyRule["type"]; if (v) addRule(v); e.target.value = ""; }}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              >
                <option value="">Add rule...</option>
                {RULE_TYPE_OPTIONS.map((o) => (
                  <option key={o.type} value={o.type}>{o.label}</option>
                ))}
              </select>
            </div>
            <ul className="list-none p-0 mb-6">
              {rules.map((rule, index) => (
                <li key={rule.id} className="mb-3 p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => updateRule(index, { name: e.target.value })}
                      placeholder="Rule name"
                      className="px-2.5 py-1.5 rounded border border-border bg-background text-foreground text-[13px] w-[180px]"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={rule.enabled} onChange={(e) => updateRule(index, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                    <select
                      value={rule.severity}
                      onChange={(e) => updateRule(index, { severity: e.target.value as "warn" | "block" })}
                      className="px-2.5 py-1.5 rounded border border-border bg-background text-foreground text-xs"
                    >
                      <option value="warn">Warn</option>
                      <option value="block">Block</option>
                    </select>
                    <button type="button" onClick={() => removeRule(index)} className="ml-auto px-2 py-1 text-xs text-[#f87171] bg-transparent border-none cursor-pointer">
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 items-center text-[13px]">
                    {"threshold_pct" in rule && (
                      <>
                        <label className="text-muted-foreground">
                          Threshold %: <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.threshold_pct}
                            onChange={(e) => updateRule(index, { threshold_pct: Number(e.target.value) })}
                            className="w-16 px-2 py-1 ml-1 rounded border border-border bg-background text-foreground"
                          />
                        </label>
                        {"scope" in rule && (
                          <select
                            value={rule.scope}
                            onChange={(e) => updateRule(index, { scope: e.target.value as "scanned_only" | "all_deals" })}
                            className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs"
                          >
                            <option value="scanned_only">Scanned only</option>
                            <option value="all_deals">All deals</option>
                          </select>
                        )}
                        {"stale_days" in rule && rule.stale_days != null && (
                          <label className="text-muted-foreground">
                            Stale days: <input
                              type="number"
                              min={1}
                              value={rule.stale_days}
                              onChange={(e) => updateRule(index, { stale_days: Number(e.target.value) })}
                              className="w-14 px-2 py-1 ml-1 rounded border border-border bg-background text-foreground"
                            />
                          </label>
                        )}
                        {"applies_to" in rule && rule.applies_to != null && (
                          <select
                            value={rule.applies_to}
                            onChange={(e) => updateRule(index, { applies_to: e.target.value as "scanned_deals_only" | "all_scanned" })}
                            className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs"
                          >
                            <option value="all_scanned">All scanned</option>
                            <option value="scanned_deals_only">Scanned deals only</option>
                          </select>
                        )}
                        {"delta_points" in rule && rule.delta_points != null && (
                          <label className="text-muted-foreground">
                            Delta pts: <input
                              type="number"
                              min={1}
                              value={rule.delta_points}
                              onChange={(e) => updateRule(index, { delta_points: Number(e.target.value) })}
                              className="w-14 px-2 py-1 ml-1 rounded border border-border bg-background text-foreground"
                            />
                          </label>
                        )}
                      </>
                    )}
                    {"threshold" in rule && rule.type === "MAX_PRPI" && (
                      <label className="text-muted-foreground">
                        Max PRPI: <input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.threshold}
                          onChange={(e) => updateRule(index, { threshold: Number(e.target.value) })}
                          className="w-16 px-2 py-1 ml-1 rounded border border-border bg-background text-foreground"
                        />
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3 mb-6">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-5 py-2.5 rounded-md border border-purple-400/50 bg-purple-400/20 text-[#c4b5fd] font-semibold text-sm"
                style={{ cursor: hasChanges && !saving ? "pointer" : "not-allowed" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handleEvaluate}
                disabled={evaluating}
                className="px-5 py-2.5 rounded-md border border-border bg-muted/50 text-foreground font-medium text-sm"
                style={{ cursor: evaluating ? "wait" : "pointer" }}
              >
                {evaluating ? "Evaluating..." : "Evaluate Now"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="px-5 py-2.5 rounded-md border border-red-500/40 bg-transparent text-[#f87171] text-sm cursor-pointer ml-auto"
              >
                Delete policy
              </button>
              {deleteConfirm && (
                <div className="w-full mt-2 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <p className="text-[#fca5a5] mb-2">Delete this policy? This cannot be undone.</p>
                  <button type="button" onClick={handleDelete} className="px-4 py-2 mr-2 bg-[#dc2626] text-white border-none rounded-md cursor-pointer">Yes, delete</button>
                  <button type="button" onClick={() => setDeleteConfirm(false)} className="px-4 py-2 bg-transparent text-muted-foreground border border-border rounded-md cursor-pointer">Cancel</button>
                </div>
              )}
            </div>

            {evaluationResult && (
              <section className="mt-6 p-4 bg-card border border-border rounded-lg">
                <h3 className="text-base font-semibold text-foreground mb-3">Evaluation result</h3>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 rounded text-[13px] font-semibold"
                    style={{
                      background: evaluationResult.overall_status === "PASS" ? "rgba(34,197,94,0.2)" : evaluationResult.overall_status === "BLOCK" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.2)",
                      color: evaluationResult.overall_status === "PASS" ? "#22c55e" : evaluationResult.overall_status === "BLOCK" ? "#f87171" : "#fbbf24",
                    }}
                  >
                    {evaluationResult.overall_status}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{evaluationResult.violation_count} violation(s)</span>
                </div>
                {evaluationResult.violations.length > 0 && (
                  <ul className="list-none p-0 mb-4">
                    {evaluationResult.violations.map((v, i) => (
                      <li key={i} className="mb-2.5 p-2.5 bg-background rounded-md">
                        <div className="font-medium text-foreground mb-1">{v.rule_name}</div>
                        <div className="text-[13px] text-foreground/80 mb-1">{v.message}</div>
                        <div className="text-xs text-muted-foreground">Actual: {v.actual_value} &middot; Threshold: {v.threshold_value}</div>
                        {v.affected_deal_ids && v.affected_deal_ids.length > 0 && (
                          <Link
                            href={`/app/portfolio?dealIds=${v.affected_deal_ids.join(",")}`}
                            className="inline-block mt-2 text-xs text-[#a78bfa] no-underline hover:underline"
                          >
                            Filter portfolio to affected deals &rarr;
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {evaluationResult.recommended_actions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Recommended actions</div>
                    <ul className="list-disc pl-5 m-0 text-[13px] text-foreground/80">
                      {evaluationResult.recommended_actions.map((a, i) => (
                        <li key={i}>{a.title}: {a.detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="p-6 text-muted-foreground text-sm">
            {policies.length === 0 ? "No policies yet. Create one via the API or add a \u201cCreate policy\u201d flow here." : "Select a policy to edit."}
          </div>
        )}
      </div>
    </div>
  );
}
