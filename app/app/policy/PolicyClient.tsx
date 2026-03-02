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
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ minWidth: 220, flex: "0 0 220px" }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/app/portfolio" style={{ color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
            ← Portfolio
          </Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fafafa", marginBottom: 16 }}>Governance</h1>
        <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 16 }}>
          Define rules and run evaluations against your portfolio.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          style={{ marginBottom: 16, padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.5)", background: "rgba(167,139,250,0.15)", color: "#c4b5fd", fontWeight: 500, cursor: creating ? "wait" : "pointer", fontSize: 14 }}
        >
          {creating ? "Creating..." : "New policy"}
        </button>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {policies.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => loadDraft(p)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: selectedId === p.id ? "1px solid rgba(167,139,250,0.6)" : "1px solid rgba(255,255,255,0.1)",
                  background: selectedId === p.id ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.03)",
                  color: "#fafafa",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>
                  {p.is_enabled ? "Enabled" : "Disabled"} · {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: "1 1 400px", minWidth: 0 }}>
        {selected ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <input
                type="text"
                value={draft.name ?? selected.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Policy name"
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 14, minWidth: 200 }}
              />
              <textarea
                value={draft.description ?? selected.description ?? ""}
                onChange={(e) => updateDraft({ description: e.target.value })}
                placeholder="Description (optional)"
                rows={1}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 14, minWidth: 240, resize: "vertical" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#e4e4e7" }}>
                <input
                  type="checkbox"
                  checked={draft.is_enabled ?? selected.is_enabled}
                  onChange={(e) => updateDraft({ is_enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>Rules</h2>
            <div style={{ marginBottom: 16 }}>
              <select
                onChange={(e) => { const v = e.target.value as PolicyRule["type"]; if (v) addRule(v); e.target.value = ""; }}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 14 }}
              >
                <option value="">Add rule...</option>
                {RULE_TYPE_OPTIONS.map((o) => (
                  <option key={o.type} value={o.type}>{o.label}</option>
                ))}
              </select>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0" }}>
              {rules.map((rule, index) => (
                <li key={rule.id} style={{ marginBottom: 12, padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => updateRule(index, { name: e.target.value })}
                      placeholder="Rule name"
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 13, width: 180 }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a1a1aa" }}>
                      <input type="checkbox" checked={rule.enabled} onChange={(e) => updateRule(index, { enabled: e.target.checked })} />
                      Enabled
                    </label>
                    <select
                      value={rule.severity}
                      onChange={(e) => updateRule(index, { severity: e.target.value as "warn" | "block" })}
                      style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 12 }}
                    >
                      <option value="warn">Warn</option>
                      <option value="block">Block</option>
                    </select>
                    <button type="button" onClick={() => removeRule(index)} style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 12, color: "#f87171", background: "transparent", border: "none", cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
                    {"threshold_pct" in rule && (
                      <>
                        <label style={{ color: "#a1a1aa" }}>
                          Threshold %: <input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.threshold_pct}
                            onChange={(e) => updateRule(index, { threshold_pct: Number(e.target.value) })}
                            style={{ width: 64, padding: "4px 8px", marginLeft: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa" }}
                          />
                        </label>
                        {"scope" in rule && (
                          <select
                            value={rule.scope}
                            onChange={(e) => updateRule(index, { scope: e.target.value as "scanned_only" | "all_deals" })}
                            style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 12 }}
                          >
                            <option value="scanned_only">Scanned only</option>
                            <option value="all_deals">All deals</option>
                          </select>
                        )}
                        {"stale_days" in rule && rule.stale_days != null && (
                          <label style={{ color: "#a1a1aa" }}>
                            Stale days: <input
                              type="number"
                              min={1}
                              value={rule.stale_days}
                              onChange={(e) => updateRule(index, { stale_days: Number(e.target.value) })}
                              style={{ width: 56, padding: "4px 8px", marginLeft: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa" }}
                            />
                          </label>
                        )}
                        {"applies_to" in rule && rule.applies_to != null && (
                          <select
                            value={rule.applies_to}
                            onChange={(e) => updateRule(index, { applies_to: e.target.value as "scanned_deals_only" | "all_scanned" })}
                            style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa", fontSize: 12 }}
                          >
                            <option value="all_scanned">All scanned</option>
                            <option value="scanned_deals_only">Scanned deals only</option>
                          </select>
                        )}
                        {"delta_points" in rule && rule.delta_points != null && (
                          <label style={{ color: "#a1a1aa" }}>
                            Delta pts: <input
                              type="number"
                              min={1}
                              value={rule.delta_points}
                              onChange={(e) => updateRule(index, { delta_points: Number(e.target.value) })}
                              style={{ width: 56, padding: "4px 8px", marginLeft: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa" }}
                            />
                          </label>
                        )}
                      </>
                    )}
                    {"threshold" in rule && rule.type === "MAX_PRPI" && (
                      <label style={{ color: "#a1a1aa" }}>
                        Max PRPI: <input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.threshold}
                          onChange={(e) => updateRule(index, { threshold: Number(e.target.value) })}
                          style={{ width: 64, padding: "4px 8px", marginLeft: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fafafa" }}
                        />
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{ padding: "10px 20px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.5)", background: "rgba(167,139,250,0.2)", color: "#c4b5fd", fontWeight: 600, cursor: hasChanges && !saving ? "pointer" : "not-allowed", fontSize: 14 }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handleEvaluate}
                disabled={evaluating}
                style={{ padding: "10px 20px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.08)", color: "#fafafa", fontWeight: 500, cursor: evaluating ? "wait" : "pointer", fontSize: 14 }}
              >
                {evaluating ? "Evaluating..." : "Evaluate Now"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                style={{ padding: "10px 20px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "transparent", color: "#f87171", fontSize: 14, cursor: "pointer", marginLeft: "auto" }}
              >
                Delete policy
              </button>
              {deleteConfirm && (
                <div style={{ width: "100%", marginTop: 8, padding: 12, background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)" }}>
                  <p style={{ color: "#fca5a5", marginBottom: 8 }}>Delete this policy? This cannot be undone.</p>
                  <button type="button" onClick={handleDelete} style={{ padding: "8px 16px", marginRight: 8, background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Yes, delete</button>
                  <button type="button" onClick={() => setDeleteConfirm(false)} style={{ padding: "8px 16px", background: "transparent", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
                </div>
              )}
            </div>

            {evaluationResult && (
              <section style={{ marginTop: 24, padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>Evaluation result</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      background: evaluationResult.overall_status === "PASS" ? "rgba(34,197,94,0.2)" : evaluationResult.overall_status === "BLOCK" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.2)",
                      color: evaluationResult.overall_status === "PASS" ? "#22c55e" : evaluationResult.overall_status === "BLOCK" ? "#f87171" : "#fbbf24",
                    }}
                  >
                    {evaluationResult.overall_status}
                  </span>
                  <span style={{ fontSize: 13, color: "#a1a1aa" }}>{evaluationResult.violation_count} violation(s)</span>
                </div>
                {evaluationResult.violations.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
                    {evaluationResult.violations.map((v, i) => (
                      <li key={i} style={{ marginBottom: 10, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
                        <div style={{ fontWeight: 500, color: "#e4e4e7", marginBottom: 4 }}>{v.rule_name}</div>
                        <div style={{ fontSize: 13, color: "#d4d4d8", marginBottom: 4 }}>{v.message}</div>
                        <div style={{ fontSize: 12, color: "#a1a1aa" }}>Actual: {v.actual_value} · Threshold: {v.threshold_value}</div>
                        {v.affected_deal_ids && v.affected_deal_ids.length > 0 && (
                          <Link
                            href={`/app/portfolio?dealIds=${v.affected_deal_ids.join(",")}`}
                            style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "#a78bfa", textDecoration: "none" }}
                          >
                            Filter portfolio to affected deals →
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {evaluationResult.recommended_actions.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>Recommended actions</div>
                    <ul style={{ listStyle: "disc", paddingLeft: 20, margin: 0, fontSize: 13, color: "#d4d4d8" }}>
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
          <div style={{ padding: 24, color: "#71717a", fontSize: 14 }}>
            {policies.length === 0 ? "No policies yet. Create one via the API or add a “Create policy” flow here." : "Select a policy to edit."}
          </div>
        )}
      </div>
    </div>
  );
}
