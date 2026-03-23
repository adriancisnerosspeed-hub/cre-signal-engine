import { ImageResponse } from "next/og";

export const alt = "CRE Signal Engine — Institutional CRE risk governance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(145deg, #0a0a0a 0%, #18181b 45%, #27272a 100%)",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#fafafa",
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          CRE Signal Engine
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 28,
            fontWeight: 500,
            color: "#a1a1aa",
            maxWidth: 820,
            lineHeight: 1.35,
          }}
        >
          Deterministic risk governance for commercial real estate underwriting.
        </div>
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {["Audit-ready", "Versioned", "Deterministic"].map((label) => (
            <span
              key={label}
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#d4d4d8",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 999,
                padding: "8px 18px",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
