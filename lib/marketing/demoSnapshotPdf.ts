import { randomUUID } from "node:crypto";

import { buildIcMemoPdf } from "@/lib/export/buildIcMemoPdf";

const DEMO_SCORE = 58;
const DEMO_BAND = "Elevated";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Markdown narrative + PDF bytes for the public demo / lead magnet.
 * Personalized with name, firm, and deal type; optional raw assumptions excerpt.
 */
export function buildDemoSnapshotNarrative(params: {
  name: string;
  firm: string;
  dealType: string;
  rawAssumptions?: string;
}): string {
  const { name, firm, dealType, rawAssumptions } = params;
  const assumptionsBlock =
    rawAssumptions && rawAssumptions.trim().length > 0
      ? `

## Assumptions you shared

${truncate(rawAssumptions, 3500)}`
      : "";

  return `# IC memorandum snapshot

Prepared for **${name}** at **${firm}**.

## Deal context

This sample narrative illustrates how CRE Signal Engine structures **${dealType}** exposure into a deterministic CRE Signal Risk Index™ and governance-ready documentation. Figures below are **representative** for demonstration — not a valuation or investment recommendation.

## Underwriting summary

- **Asset class:** ${dealType}
- **Governance posture:** Snapshot uses cohort-frozen benchmark context and versioned methodology metadata on export.

## Risk narrative (illustrative)

The illustrative scan highlights refinancing sensitivity and tenant concentration as primary drivers in the current band. Policy checks would surface WARN states when assumptions breach workspace thresholds — visible to IC, not buried in a model tab.

## Next steps

Use this sample to align credit, asset management, and capital partners on **one** risk language before you commit internal resources to a full underwriting build.${assumptionsBlock}`;
}

export async function buildDemoSnapshotPdfBytes(params: {
  name: string;
  firm: string;
  dealType: string;
  rawAssumptions?: string;
}): Promise<Uint8Array> {
  const narrative = buildDemoSnapshotNarrative(params);
  const dealName = `${params.firm} — ${params.dealType} (sample)`;
  const scanId = `demo-${randomUUID()}`;
  const scanCreatedAt = new Date().toISOString();

  return buildIcMemoPdf({
    narrative,
    dealName,
    scanCreatedAt,
    scanId,
    riskIndexScore: DEMO_SCORE,
    riskIndexBand: DEMO_BAND,
  });
}
