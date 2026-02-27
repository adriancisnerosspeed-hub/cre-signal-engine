import { RISK_INDEX_VERSION } from "../riskIndex";

/** Publication date of this methodology document (credibility). */
export const publishedAt = "2026-02-27";

export const title = "CRE Signal Risk Index™ — Methodology";

export const version = RISK_INDEX_VERSION;

export type MethodologySection = {
  heading: string;
  body?: string;
  bullets?: string[];
};

export const sections: MethodologySection[] = [
  {
    heading: "Purpose",
    body:
      "CRE Signal Risk Index™ is an underwriting support score designed to summarize risk drivers and data quality in a consistent, audit-friendly format. It is intended to accelerate review workflows and highlight areas that require diligence.",
  },
  {
    heading: "Score Bands",
    body: `Score bands are defined as follows:
- Low: 0–34
- Moderate: 35–54
- Elevated: 55–69
- High: 70+`,
  },
  {
    heading: "Inputs and Data Coverage",
    body:
      "The score is computed from two sources: 1) Deal assumptions (e.g., LTV, vacancy, entry/exit cap rates, NOI, debt rate). 2) Risk observations extracted from the deal context and scan output (risk_type, severity, confidence), plus linked macro signals when available. Data Coverage summarizes presence of required assumption fields. Missing inputs increase uncertainty and may trigger review flags.",
  },
  {
    heading: "Normalization Rules",
    body:
      "Percent-like fields are normalized using unit-aware logic. If the unit is percent (%), fractional values between 0 and 1 are interpreted as percentages (e.g., 0.05 → 5%). When units are missing and a percent-like field is between 0 and 1, the value may be inferred as a fraction and converted to percent. When this occurs, the scan is flagged for review and the output records EDGE_UNIT_INFERRED.",
  },
  {
    heading: "Core Score Construction",
    body:
      "The Risk Index score is derived from: Base Score + Risk Penalties + Macro Penalty − Stabilizers. Penalties are influenced by severity and confidence. Stabilizers reduce score when conservative assumptions materially reduce leverage or exit risk.",
  },
  {
    heading: "Confidence and Review Flags",
    body:
      "Confidence is reflected in both scoring and signaling. Low confidence increases uncertainty and may apply a small uncertainty premium. A scan may be flagged for review when: Critical inputs are missing, Units were inferred, Values are out of expected bounds, Extreme edge cases are detected.",
  },
  {
    heading: "Tier Overrides and Reason Codes",
    body:
      "In certain extreme configurations, the score band may be overridden to prevent under-signaling. When applied, the output records tier driver reason codes (tier_drivers), such as:",
    bullets: [
      "FORCED_HIGH_LTV_VACANCY",
      "FORCED_ELEVATED_EXIT_CAP_COMPRESSION",
      "FORCED_ELEVATED_DSCR",
      "MISSING_DATA_CAP_APPLIED",
      "FORCED_HIGH_LTV_90",
    ],
  },
  {
    heading: "Macro Signals (Overlay)",
    body:
      "Macro signals provide contextual market risk. Signals are: Deduplicated using stable normalization keys, Time-decayed to reduce influence of stale signals, Capped to prevent macro context from dominating structural risk. When macro timestamps are missing, the scan records EDGE_MACRO_TIMESTAMP_MISSING.",
  },
  {
    heading: "Attribution and Explainability",
    body:
      "Each score includes attribution: major driver categories, top risk contributors, stabilizers applied, and review indicators. When a single driver would dominate explainability, driver shares may be capped for readability. When applied, the output records EDGE_DRIVER_SHARE_CAP_APPLIED and includes a note that the score itself is unchanged.",
  },
  {
    heading: "Delta Comparability (Scan-to-Scan)",
    body:
      "Score deltas are only comparable when the prior scan was scored under the same methodology version. When version drift exists, the output records delta_comparable = false and the UI indicates 'Version drift — delta not comparable.'",
  },
  {
    heading: "Stability Guarantees (Tested)",
    body: "The implementation includes automated tests for:",
    bullets: [
      "Score invariance to input ordering and formatting,",
      "Decimal-vs-percent normalization consistency,",
      "Monotonic behavior for key risk drivers (increasing leverage or vacancy should not reduce risk),",
      "Smooth penalty ramps near thresholds where applicable.",
    ],
  },
  {
    heading: "Limitations",
    body:
      "Risk Index™ is not a substitute for underwriting, sponsor diligence, third-party reports, or investment committee judgment. It summarizes risk signals present in the provided context and should be interpreted alongside primary documents.",
  },
];

export const disclaimerLines = [
  "CRE Signal Engine is an underwriting support tool. Final decisions should incorporate sponsor diligence and third-party validation.",
];
