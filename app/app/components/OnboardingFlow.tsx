"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BAND_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  Elevated: "#f97316",
  High: "#ef4444",
};

type DemoInfo = {
  dealId: string;
  dealName: string;
  riskScore: number | null;
  riskBand: string | null;
};

export default function OnboardingFlow({ demo }: { demo: DemoInfo | null }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [completing, setCompleting] = useState(false);

  async function markComplete() {
    if (completing) return;
    setCompleting(true);
    await fetch("/api/org/onboarding", { method: "PATCH" }).catch(() => {});
    router.refresh();
  }

  async function handleSkip() {
    await markComplete();
  }

  async function handleFinish() {
    await markComplete();
  }

  const bandColor = demo?.riskBand ? (BAND_COLORS[demo.riskBand] ?? "#71717a") : "#71717a";

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#18181b",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 14,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 520,
    position: "relative",
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: "12px 24px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
  };

  const skipStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "#52525b",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
    marginTop: 16,
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: s === step ? "#3b82f6" : "rgba(255,255,255,0.2)",
                transition: "background-color 0.2s",
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fafafa", marginBottom: 12 }}>
              Welcome to CRE Signal Engine
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
              Institutional risk governance for your CRE deals. Add your deal assumptions and get a
              deterministic risk score, IC memo, and portfolio governance layer — in minutes.
            </p>
            {demo && (
              <div
                style={{
                  padding: "14px 16px",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  marginBottom: 20,
                }}
              >
                <p style={{ color: "#71717a", fontSize: 12, margin: "0 0 4px" }}>Demo deal</p>
                <p style={{ color: "#e4e4e7", fontSize: 14, fontWeight: 600, margin: 0 }}>
                  {demo.dealName}
                </p>
                {demo.riskScore != null && (
                  <p style={{ color: bandColor, fontSize: 13, margin: "4px 0 0", fontWeight: 600 }}>
                    Risk Score: {demo.riskScore} — {demo.riskBand}
                  </p>
                )}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <button type="button" onClick={() => setStep(2)} style={primaryBtnStyle}>
                Show me how it works →
              </button>
              <button type="button" onClick={handleSkip} style={skipStyle}>
                Skip onboarding
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fafafa", marginBottom: 12 }}>
              Your first deal is ready
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
              We created a demo deal and ran a full scan. Here&apos;s what you get with every scan:
            </p>
            <ul
              style={{
                color: "#a1a1aa",
                fontSize: 14,
                lineHeight: 1.8,
                paddingLeft: 20,
                marginBottom: 20,
              }}
            >
              <li>
                <span style={{ color: "#e4e4e7", fontWeight: 600 }}>Risk Score Badge</span> — deterministic 0–100 score with band (Low/Moderate/Elevated/High)
              </li>
              <li>
                <span style={{ color: "#e4e4e7", fontWeight: 600 }}>IC Memo Narrative</span> — AI-generated institutional memorandum
              </li>
              <li>
                <span style={{ color: "#e4e4e7", fontWeight: 600 }}>PDF Export</span> — IC-ready report for your committee
              </li>
            </ul>
            {demo && (
              <div style={{ marginBottom: 20 }}>
                <a
                  href={`/app/deals/${demo.dealId}`}
                  style={{ color: "#3b82f6", fontSize: 14, textDecoration: "underline" }}
                >
                  View demo deal →
                </a>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <button type="button" onClick={() => setStep(3)} style={primaryBtnStyle}>
                Analyze my own deal →
              </button>
              <button type="button" onClick={handleSkip} style={skipStyle}>
                Skip onboarding
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fafafa", marginBottom: 12 }}>
              Add your deal
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
              Paste your underwriting assumptions and CRE Signal Engine extracts and scores them automatically.
            </p>
            <div
              style={{
                padding: "14px 16px",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
                color: "#71717a",
                fontFamily: "monospace",
                lineHeight: 1.5,
              }}
            >
              Example: Purchase price: $12M. Cap rate: 5.5%. LTV: 70%. NOI Year 1: $660K.
              Hold period: 5 years. Exit cap: 6.0%. Debt rate: 6.75%...
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <a
                href="/app/deals/new"
                onClick={handleFinish}
                style={{
                  ...primaryBtnStyle,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Run my first scan →
              </a>
            </div>
            <button type="button" onClick={handleSkip} style={skipStyle}>
              Skip onboarding
            </button>
          </>
        )}
      </div>
    </div>
  );
}
