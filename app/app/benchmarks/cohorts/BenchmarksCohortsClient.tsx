"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type Cohort = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: string;
  status: string;
  version: number;
  rule_hash: string | null;
};

export default function BenchmarksCohortsClient({
  cohorts,
  canCreateCohort,
  canBuildSnapshot,
}: {
  cohorts: Cohort[];
  canCreateCohort: boolean;
  canBuildSnapshot: boolean;
}) {
  const router = useRouter();
  const [createKey, setCreateKey] = useState("");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createRuleJson, setCreateRuleJson] = useState("{}");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [buildCohortId, setBuildCohortId] = useState("");
  const [buildAsOf, setBuildAsOf] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildResult, setBuildResult] = useState<{ snapshot_id?: string; build_status?: string; build_error?: string; n_eligible?: number } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const key = createKey.trim();
    const name = createName.trim();
    if (!key || !name) {
      setCreateError("Key and name are required.");
      return;
    }
    let ruleJson: unknown;
    try {
      ruleJson = JSON.parse(createRuleJson || "{}");
    } catch {
      setCreateError("rule_json must be valid JSON (e.g. {} or {\"and\": [...]}).");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetchJsonWithTimeout("/api/benchmarks/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          name,
          description: createDescription.trim() || null,
          scope: "WORKSPACE",
          rule_json: ruleJson,
        }),
      }, 15000);
      const data = res.json ?? {};
      if (!res.ok) {
        setCreateError((data as { error?: string }).error || `Error ${res.status}`);
        return;
      }
      setCreateKey("");
      setCreateName("");
      setCreateDescription("");
      setCreateRuleJson("{}");
      router.refresh();
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleBuild(e: React.FormEvent) {
    e.preventDefault();
    setBuildError(null);
    setBuildResult(null);
    if (!buildCohortId || !buildAsOf) {
      setBuildError("Select a cohort and set As-of date/time.");
      return;
    }
    setBuildLoading(true);
    try {
      const asOfTimestamp = new Date(buildAsOf).toISOString();
      const res = await fetchJsonWithTimeout("/api/benchmarks/snapshots/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: buildCohortId, as_of_timestamp: asOfTimestamp }),
      }, 60000);
      const data = (res.json ?? {}) as { snapshot_id?: string; build_status?: string; build_error?: string; n_eligible?: number; error?: string };
      if (!res.ok) {
        setBuildError(data.error || data.build_error || `Error ${res.status}`);
        setBuildResult(data.build_status ? { build_status: data.build_status, build_error: data.build_error, n_eligible: data.n_eligible } : null);
        return;
      }
      setBuildResult({ snapshot_id: data.snapshot_id, build_status: data.build_status, n_eligible: data.n_eligible });
      router.refresh();
    } finally {
      setBuildLoading(false);
    }
  }

  const scopeOrder = (s: string) => (s === "SYSTEM" ? 0 : s === "GLOBAL" ? 1 : 2);
  const sortedCohorts = [...cohorts].sort(
    (a, b) => scopeOrder(a.scope) - scopeOrder(b.scope) || a.key.localeCompare(b.key, "en")
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {canBuildSnapshot && (
        <section style={{ padding: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fafafa", marginBottom: 16 }}>Build snapshot</h2>
          <form onSubmit={handleBuild} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Cohort</span>
              <select
                value={buildCohortId}
                onChange={(e) => setBuildCohortId(e.target.value)}
                style={{ padding: "8px 12px", minWidth: 200, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
              >
                <option value="">Select cohort</option>
                {sortedCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.key} ({c.scope})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>As-of date/time</span>
              <input
                type="datetime-local"
                value={buildAsOf}
                onChange={(e) => setBuildAsOf(e.target.value)}
                style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
              />
            </label>
            <button
              type="submit"
              disabled={buildLoading || !buildCohortId}
              style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: buildLoading ? "not-allowed" : "pointer", fontWeight: 500 }}
            >
              {buildLoading ? "Building…" : "Build snapshot"}
            </button>
          </form>
          {buildError && <p style={{ color: "#f87171", fontSize: 14, marginTop: 12 }}>{buildError}</p>}
          {buildResult && (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: 14 }}>
              <strong style={{ color: "#a1a1aa" }}>Result:</strong>{" "}
              {buildResult.build_status === "SUCCESS" ? (
                <>Snapshot {buildResult.snapshot_id?.slice(0, 8)}… created. n_eligible: {buildResult.n_eligible ?? "—"}</>
              ) : (
                <>Status: {buildResult.build_status}. {buildResult.build_error ?? ""}</>
              )}
            </div>
          )}
        </section>
      )}

      {canCreateCohort && (
        <section style={{ padding: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fafafa", marginBottom: 16 }}>Create cohort (Enterprise)</h2>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Key (unique)</span>
              <input
                type="text"
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value)}
                placeholder="e.g. my-workspace-cohort"
                style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Name</span>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Display name"
                style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Description (optional)</span>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#71717a" }}>Rule JSON (e.g. {"{}"} or {"{\"and\": [...]}"})</span>
              <textarea
                value={createRuleJson}
                onChange={(e) => setCreateRuleJson(e.target.value)}
                rows={4}
                style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, color: "#fafafa", fontFamily: "monospace", fontSize: 13 }}
              />
            </label>
            {createError && <p style={{ color: "#f87171", fontSize: 14 }}>{createError}</p>}
            <button
              type="submit"
              disabled={createLoading}
              style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: createLoading ? "not-allowed" : "pointer", fontWeight: 500, alignSelf: "flex-start" }}
            >
              {createLoading ? "Creating…" : "Create cohort"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fafafa", marginBottom: 12 }}>Cohorts</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Key</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Scope</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>Version</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#71717a", fontWeight: 600 }}>rule_hash</th>
              </tr>
            </thead>
            <tbody>
              {sortedCohorts.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "10px 12px", color: "#e4e4e7" }}>{c.key}</td>
                  <td style={{ padding: "10px 12px", color: "#e4e4e7" }}>{c.name}</td>
                  <td style={{ padding: "10px 12px", color: "#a1a1aa" }}>{c.scope}</td>
                  <td style={{ padding: "10px 12px", color: "#a1a1aa" }}>{c.version}</td>
                  <td style={{ padding: "10px 12px", color: "#71717a", fontFamily: "monospace", fontSize: 12 }}>
                    {c.rule_hash ? `${c.rule_hash.slice(0, 12)}…` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cohorts.length === 0 && <p style={{ color: "#71717a", padding: 12 }}>No cohorts yet.</p>}
      </section>
    </div>
  );
}
