/**
 * Generate the static sample IC memo PDF for /sample-report.
 * Run with: npm run generate:sample-pdf  OR  npx tsx scripts/generateSamplePdf.ts
 * Output: public/sample-report.pdf (exactly 2 pages)
 */
import { buildIcMemoPdf } from "../lib/export/buildIcMemoPdf";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument } from "pdf-lib";

const SAMPLE_NARRATIVE = `## Executive Summary

The Riverside Commerce Center in Austin, TX presents an investment opportunity in the office sector with a CRE Signal Risk Index™ score of 39, placing it in the Moderate risk band. The investment involves a purchase price of $12,500,000 with an anticipated Year 1 NOI of $812,500.

## Investment Thesis

The investment thesis hinges on capturing value through strategic leasing and market rent growth in Austin's office sector. The property is positioned to benefit from a projected 3% rent growth and controlled expense growth of 2.5%.

## Key Assumptions

Purchase Price: $12,500,000
NOI Year 1: $812,500
Cap Rate In: 6.5%
LTV: 65%
Vacancy: 14%
Exit Cap Rate: 7.0%
Debt Rate: 7.25%
Hold Period: 5 years

## Primary Risks

1. RefiRisk (Medium): Anchor tenant lease expiration in 18 months poses refinancing risk.
2. RentGrowthAggressive (Medium): 3% rent growth may not be sustainable.
3. VacancyUnderstated (Medium): Current vacancy at 14% with two vacant suites.

## Market Context

Austin, TX office market vacancy is running 22-26% with cap rates in the 6.5-7.5% range as of Q4 2025. The market trend is softening due to tech-driven demand slowdown and elevated sublease availability.

## Recommendation

Proceed with Conditions. Further due diligence on tenant renewal probabilities and submarket rent trends is advised before finalizing the investment.`;

async function main() {
  console.log("Generating sample-report.pdf...");
  const bytes = await buildIcMemoPdf({
    narrative: SAMPLE_NARRATIVE,
    dealName: "Riverside Commerce Center",
    scanCreatedAt: "2026-03-03T00:00:00.000Z",
    scanId: "d2485ef5",
    riskIndexScore: 39,
    riskIndexBand: "Moderate",
  });

  const outPath = join(process.cwd(), "public", "sample-report.pdf");
  writeFileSync(outPath, bytes);
  console.log(`Written: ${outPath} (${bytes.length} bytes)`);

  const pdfDoc = await PDFDocument.load(readFileSync(outPath));
  const pageCount = pdfDoc.getPageCount();
  if (pageCount !== 2) {
    console.error(`Expected 2 pages, got ${pageCount}`);
    process.exit(1);
  }
  console.log("Page count: 2");
}

main().catch((err) => {
  console.error("Failed to generate sample PDF:", err);
  process.exit(1);
});
