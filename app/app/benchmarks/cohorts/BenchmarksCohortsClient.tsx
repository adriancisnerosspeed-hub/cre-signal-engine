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
    <div className="flex flex-col gap-8">
      {canBuildSnapshot && (
        <section className="p-5 bg-muted/50 border border-border rounded-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4">Build snapshot</h2>
          <form onSubmit={handleBuild} className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Cohort</span>
              <select
                value={buildCohortId}
                onChange={(e) => setBuildCohortId(e.target.value)}
                className="px-3 py-2 min-w-[200px] rounded-md border border-border bg-background text-foreground text-sm"
              >
                <option value="">Select cohort</option>
                {sortedCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.key} ({c.scope})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">As-of date/time</span>
              <input
                type="datetime-local"
                value={buildAsOf}
                onChange={(e) => setBuildAsOf(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={buildLoading || !buildCohortId}
              className="px-4 py-2 bg-[#3b82f6] text-white border-none rounded-md font-medium disabled:cursor-not-allowed cursor-pointer"
            >
              {buildLoading ? "Building\u2026" : "Build snapshot"}
            </button>
          </form>
          {buildError && <p className="text-[#f87171] text-sm mt-3">{buildError}</p>}
          {buildResult && (
            <div className="mt-3 p-3 bg-background rounded-md text-sm">
              <strong className="text-muted-foreground">Result:</strong>{" "}
              {buildResult.build_status === "SUCCESS" ? (
                <>Snapshot {buildResult.snapshot_id?.slice(0, 8)}\u2026 created. n_eligible: {buildResult.n_eligible ?? "\u2014"}</>
              ) : (
                <>Status: {buildResult.build_status}. {buildResult.build_error ?? ""}</>
              )}
            </div>
          )}
        </section>
      )}

      {canCreateCohort && (
        <section className="p-5 bg-muted/50 border border-border rounded-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4">Create cohort (Enterprise)</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 max-w-[480px]">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Key (unique)</span>
              <input
                type="text"
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value)}
                placeholder="e.g. my-workspace-cohort"
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Name</span>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Display name"
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Description (optional)</span>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Rule JSON (e.g. {"{}"} or {"{\"and\": [...]}"})</span>
              <textarea
                value={createRuleJson}
                onChange={(e) => setCreateRuleJson(e.target.value)}
                rows={4}
                className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm font-mono"
              />
            </label>
            {createError && <p className="text-[#f87171] text-sm">{createError}</p>}
            <button
              type="submit"
              disabled={createLoading}
              className="px-4 py-2 bg-[#3b82f6] text-white border-none rounded-md font-medium disabled:cursor-not-allowed cursor-pointer self-start"
            >
              {createLoading ? "Creating\u2026" : "Create cohort"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Cohorts</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Key</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Name</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Scope</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">Version</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground/70 font-semibold">rule_hash</th>
              </tr>
            </thead>
            <tbody>
              {sortedCohorts.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="px-3 py-2.5 text-foreground">{c.key}</td>
                  <td className="px-3 py-2.5 text-foreground">{c.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.scope}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.version}</td>
                  <td className="px-3 py-2.5 text-muted-foreground/70 font-mono text-xs">
                    {c.rule_hash ? `${c.rule_hash.slice(0, 12)}\u2026` : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cohorts.length === 0 && <p className="text-muted-foreground/70 p-3">No cohorts yet.</p>}
      </section>
    </div>
  );
}
