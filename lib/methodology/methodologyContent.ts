import { RISK_INDEX_VERSION } from "../riskIndex";

/** Publication date of this methodology document (credibility). */
export const publishedAt = "2026-03-04";

export const title = "CRE Signal Risk Index™ — Methodology";

export const version = RISK_INDEX_VERSION;

export type MethodologySection = {
  heading: string;
  body?: string;
  bullets?: string[];
};

export const sections: MethodologySection[] = [
  {
    heading: "How the CRE Signal Risk Index Works",
    body:
      "The CRE Signal Risk Index™ is a deterministic, rules-based scoring system that quantifies deal-level risk into a single 0–100 score. Unlike probabilistic models, every score is fully reproducible: given the same inputs and methodology version, the output is identical. The index is computed from four components: (1) Structural Risk — leverage, debt coverage, exit assumptions; (2) Operational Risk — vacancy, NOI stability, management complexity; (3) Macro Overlay — cross-referenced market signals tied to the deal's geography and asset class; and (4) Data Confidence — a penalty applied when critical inputs are missing, inferred, or flagged as outliers. Each component contributes a weighted penalty or stabilizer to a base score. The final score reflects cumulative risk exposure after all adjustments.",
  },
  {
    heading: "Risk Bands",
    body: "Scores are mapped to four named risk bands, each reflecting a distinct underwriting posture:",
    bullets: [
      "Low (0–34): Deal exhibits conservative leverage, stable cash flow, and no material macro headwinds. Standard diligence applies.",
      "Moderate (35–54): One or more risk factors present, but within manageable range. Enhanced review recommended for identified drivers.",
      "Elevated (55–69): Multiple risk factors with meaningful exposure. IC-level scrutiny required; mitigation conditions likely.",
      "High (70–100): Structural or market conditions indicate significant loss potential. Full committee review required before any advancement.",
    ],
  },
  {
    heading: "Confidence Scores",
    body:
      "Each extracted assumption carries a confidence rating that reflects data completeness and extraction certainty. Confidence affects both the score and the review flags surfaced in the IC memo.",
    bullets: [
      "High: Value was explicitly stated in the source document with a matching unit. No inference required.",
      "Medium: Value was present but required unit normalization, contextual interpretation, or light inference.",
      "Low: Value was absent or ambiguous; the system applied a default or estimated from comparable context.",
      "DataMissing: A critical field (e.g., LTV, cap rate) was entirely absent. A fixed penalty is applied to the score and a review flag is set.",
    ],
  },
  {
    heading: "Macro Signal Overlay",
    body:
      "The Macro Overlay cross-references live and historical macro signals — including rate environment, cap rate compression trends, vacancy absorption, and submarket supply pressure — against the deal's asset type and geography. Signals are deduplicated using stable normalization keys and time-decayed to reduce the influence of stale data. The overlay contribution is capped to prevent macro context from dominating structural risk: no single macro signal can contribute more than 15 points to the final score, and the total macro penalty is capped at 20 points. When macro timestamps are unavailable, the scan records EDGE_MACRO_TIMESTAMP_MISSING and applies a conservative default.",
  },
  {
    heading: "What This Is Not",
    body:
      "The CRE Signal Risk Index™ is an underwriting support layer, not a replacement for institutional judgment. It does not perform sponsor diligence, legal review, property condition assessment, or appraisal. It does not predict default probability or model scenario-specific return distributions. The score reflects risk signals present in the provided deal context — its accuracy depends on the completeness and quality of the input data. Risk Index outputs should be interpreted alongside primary documents, third-party reports, and IC member expertise. All scores should be reviewed by a qualified professional before informing a capital decision.",
  },
  {
    heading: "Version History",
    body: "The methodology is versioned to ensure scan-to-scan comparability. Score deltas are only meaningful within the same version; cross-version comparisons are flagged in the UI.",
    bullets: [
      "v1.0 — Initial release. Base scoring framework with structural and operational components. No macro overlay.",
      "v2.0 Institutional Stable — Added macro signal overlay, data confidence penalties, tier override logic, and benchmark percentile layer. All v2.0 scans are deterministic and audit-ready.",
    ],
  },
];

export const disclaimerLines = [
  "CRE Signal Engine is an underwriting support tool. Final decisions should incorporate sponsor diligence and third-party validation.",
];
