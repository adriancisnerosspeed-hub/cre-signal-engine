"use client";

import { useEffect, useState } from "react";
import PaywallModal from "@/app/components/PaywallModal";

export default function PercentileBlock({
  scanId,
  plan,
}: {
  scanId: string;
  plan: "free" | "pro" | "owner";
}) {
  const [data, setData] = useState<{
    percentile: number | null;
    sample_size: number;
    asset_type: string | null;
  } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (plan === "free") {
      setCode("PRO_REQUIRED_FOR_PERCENTILE");
      setLoading(false);
      return;
    }
    fetch(`/api/deals/scans/${scanId}/percentile`)
      .then((res) => res.json().then((body) => ({ status: res.status, body })))
      .then(({ status, body }) => {
        if (status === 403 && body.code === "PRO_REQUIRED_FOR_PERCENTILE") {
          setCode(body.code);
        } else if (status === 200) {
          setData(body);
        }
      })
      .finally(() => setLoading(false));
  }, [scanId, plan]);

  const [paywallOpen, setPaywallOpen] = useState(false);

  if (loading) {
    return (
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Risk Benchmarking
        </h2>
        <p style={{ color: "#a1a1aa", fontSize: 14 }}>Loading…</p>
      </section>
    );
  }

  if (code === "PRO_REQUIRED_FOR_PERCENTILE") {
    return (
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
          Risk Benchmarking
        </h2>
        <div
          style={{
            padding: 20,
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            filter: "blur(4px)",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>
            Compared to X scanned deals, this ranks in the Yth percentile for risk.
          </p>
        </div>
        <p style={{ marginTop: 12, fontSize: 14, color: "#a1a1aa" }}>
          Upgrade to Pro for risk benchmarking.
        </p>
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            fontSize: 14,
            backgroundColor: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Upgrade to Pro
        </button>
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
          title="Pro access required"
          subtitle="Risk percentile benchmarking is a Pro feature."
        />
      </section>
    );
  }

  if (!data) return null;

  const { percentile, sample_size, asset_type } = data;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", marginBottom: 12 }}>
        Risk Benchmarking
      </h2>
      {sample_size < 5 ? (
        <p style={{ color: "#a1a1aa", fontSize: 14 }}>
          Limited benchmark data available.
        </p>
      ) : (
        <p style={{ color: "#e4e4e7", fontSize: 14 }}>
          Compared to {sample_size} scanned {asset_type || "deal"} deals, this ranks in the{" "}
          {percentile ?? "—"}th percentile for risk.
        </p>
      )}
    </section>
  );
}
