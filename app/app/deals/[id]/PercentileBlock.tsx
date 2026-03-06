"use client";

import { useEffect, useState } from "react";
import PaywallModal from "@/app/components/PaywallModal";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type BenchmarkData = {
  risk_percentile: number;
  risk_band: string;
  n: number;
  cohort_key: string | null;
  snapshot_id: string;
  as_of_timestamp: string;
  method_version: string;
  band_version: string;
};

export default function PercentileBlock({
  dealId,
  scanId,
  plan,
}: {
  dealId: string;
  scanId: string;
  plan: "free" | "pro" | "platform_admin";
}) {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (plan === "free") {
      setCode("PRO_REQUIRED_FOR_PERCENTILE");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const cohortsRes = await fetchJsonWithTimeout("/api/benchmarks/cohorts", {}, 15000);
        if (cohortsRes.status !== 200 || cancelled) return;
        const cohorts = (cohortsRes.json ?? []) as { id: string; key: string; scope: string }[];
        // Deterministic: API returns cohorts ordered by scope (SYSTEM, GLOBAL, WORKSPACE) then key asc
        const cohortId = cohorts[0]?.id;
        if (!cohortId) {
          setCode("NO_COHORT_AVAILABLE");
          return;
        }

        const snapshotsRes = await fetchJsonWithTimeout(
          `/api/benchmarks/snapshots?cohort_id=${encodeURIComponent(cohortId)}&limit=5`,
          {},
          15000
        );
        if (snapshotsRes.status !== 200 || cancelled) return;
        const snapshots = (snapshotsRes.json ?? []) as {
          snapshot_id: string;
          build_status: string;
          created_at: string;
        }[];
        // Deterministic: API returns snapshots by created_at desc; pick latest SUCCESS
        const successSnapshot = snapshots.find((s) => s.build_status === "SUCCESS");
        if (!successSnapshot) {
          setCode("SNAPSHOT_NOT_READY");
          return;
        }

        const benchmarkRes = await fetchJsonWithTimeout(
          `/api/deals/${encodeURIComponent(dealId)}/benchmark?snapshot_id=${encodeURIComponent(successSnapshot.snapshot_id)}`,
          {},
          15000
        );
        if (cancelled) return;
        if (benchmarkRes.status === 400) {
          const body = benchmarkRes.json ?? {};
          if (body.code === "VALUE_MISSING_FOR_DEAL") {
            setCode("VALUE_MISSING_FOR_DEAL");
            return;
          }
          if (body.code === "SNAPSHOT_NOT_READY") {
            setCode("SNAPSHOT_NOT_READY");
            return;
          }
        }
        if (benchmarkRes.status === 404) {
          setCode("SNAPSHOT_NOT_FOUND");
          return;
        }
        if (benchmarkRes.status !== 200) {
          setCode("BENCHMARK_UNAVAILABLE");
          return;
        }

        const benchmark = (benchmarkRes.json ?? null) as BenchmarkData | null;
        if (!cancelled && benchmark) setData(benchmark);
      } catch {
        if (!cancelled) setCode("BENCHMARK_UNAVAILABLE");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dealId, scanId, plan]);

  const [paywallOpen, setPaywallOpen] = useState(false);

  if (loading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          Risk Benchmarking
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
      </section>
    );
  }

  if (code === "PRO_REQUIRED_FOR_PERCENTILE") {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          Risk Benchmarking
        </h2>
        <div
          className="p-5 bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 rounded-lg"
          style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}
        >
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Compared to a cohort snapshot, this deal&apos;s risk index is ranked by percentile (governance).
          </p>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Upgrade to Starter for risk benchmarking.
        </p>
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          className="mt-2 py-2 px-4 text-sm bg-[#3b82f6] text-white border-0 rounded-md cursor-pointer"
        >
          Upgrade to Starter
        </button>
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          title="Starter plan required"
          subtitle="Risk percentile benchmarking is a Starter feature."
        />
      </section>
    );
  }

  if (
    code === "NO_COHORT_AVAILABLE" ||
    code === "SNAPSHOT_NOT_READY" ||
    code === "SNAPSHOT_NOT_FOUND" ||
    code === "BENCHMARK_UNAVAILABLE" ||
    code === "VALUE_MISSING_FOR_DEAL"
  ) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
          Risk Benchmarking
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {code === "NO_COHORT_AVAILABLE" || code === "SNAPSHOT_NOT_READY"
            ? "Benchmark percentile requires a cohort snapshot. Ask your admin to build one."
            : code === "VALUE_MISSING_FOR_DEAL"
              ? "This deal is not in the selected cohort snapshot."
              : "Benchmark data is unavailable for this deal."}
        </p>
      </section>
    );
  }

  if (!data) return null;

  const { risk_percentile, risk_band, n, cohort_key } = data;
  const pct = Math.round(risk_percentile);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-200 mb-3">
        Risk Benchmarking
      </h2>
      {n < 5 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Limited benchmark data (cohort size &lt; 5).
        </p>
      ) : (
        <p className="text-gray-900 dark:text-zinc-200 text-sm">
          Versus {n} deals in cohort {cohort_key ?? "—"} (snapshot), this ranks in the {pct}th
          percentile for risk — band: {risk_band}.
        </p>
      )}
    </section>
  );
}
