/**
 * Stress harness for CRE Signal Risk Index v2.0 — institutional hardening.
 * Runs 8 scenarios, prints score/band, top 3 drivers, tier drivers, validation errors,
 * distribution, and asserts invariants.
 *
 * Run: npx tsx scripts/stressRiskIndexV2.ts
 */

import { computeRiskIndex, type RiskIndexResult } from "../lib/riskIndex";
import { getRiskModelMetadata } from "../lib/modelGovernance";
import { normalizeAssumptionsForScoring } from "../lib/assumptionNormalization";
import type { DealScanAssumptions } from "../lib/dealScanContract";

type RiskRow = { severity_current: string; confidence: string; risk_type: string };

function run(
  name: string,
  risks: RiskRow[],
  assumptions: DealScanAssumptions,
  macroLinkedCount = 0
): RiskIndexResult {
  const norm = normalizeAssumptionsForScoring(assumptions);
  return computeRiskIndex({ risks, assumptions: norm, macroLinkedCount });
}

function printResult(name: string, r: RiskIndexResult) {
  console.log(`\n--- ${name} ---`);
  console.log(`Score: ${r.score}  Band: ${r.band}`);
  if (r.breakdown.top_drivers?.length) {
    console.log(`Top 3 drivers: ${r.breakdown.top_drivers.join(", ")}`);
  }
  if (r.breakdown.tier_drivers?.length) {
    console.log(`Tier drivers: [${r.breakdown.tier_drivers.join(", ")}]`);
  }
  if (r.breakdown.validation_errors?.length) {
    console.log(`Validation errors: ${r.breakdown.validation_errors.join("; ")}`);
  }
  if (r.breakdown.edge_flags?.length) {
    console.log(`Edge flags: [${r.breakdown.edge_flags.join(", ")}]`);
  }
  return r;
}

function main() {
  console.log("CRE Signal Risk Index v2.0 — Stress Harness\n");

  const distribution: Record<string, number> = { Low: 0, Moderate: 0, Elevated: 0, High: 0 };
  let extremeScore = 0;
  let missingOnlyScore = 0;
  let missingPlusStructuralScore = 0;

  // 1. Percent normalization (decimal vs percent — same score)
  const r1a = run(
    "1a decimal",
    [{ severity_current: "Medium", confidence: "High", risk_type: "VacancyUnderstated" }],
    { vacancy: { value: 0.05, unit: "%", confidence: "High" }, ltv: { value: 65, unit: "%", confidence: "Medium" } }
  );
  const r1b = run(
    "1b percent",
    [{ severity_current: "Medium", confidence: "High", risk_type: "VacancyUnderstated" }],
    { vacancy: { value: 5, unit: "%", confidence: "High" }, ltv: { value: 65, unit: "%", confidence: "Medium" } }
  );
  printResult("1. Percent normalization (decimal)", r1a);
  printResult("1. Percent normalization (percent)", r1b);
  console.log(`  Invariant: same score? ${r1a.score === r1b.score && r1a.band === r1b.band}`);

  // 2. Missing-only (expect score ≤ 49)
  const r2 = run("2. Missing-only", [{ severity_current: "High", confidence: "High", risk_type: "DataMissing" }], {});
  printResult("2. Missing-only", r2);
  distribution[r2.band] = (distribution[r2.band] ?? 0) + 1;
  missingOnlyScore = r2.score;

  // 3. Missing + structural (score > missing-only)
  const r3 = run(
    "3. Missing + structural",
    [
      { severity_current: "High", confidence: "High", risk_type: "DataMissing" },
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" },
    ],
    { ltv: { value: 70, unit: "%", confidence: "Medium" } }
  );
  printResult("3. Missing + structural", r3);
  distribution[r3.band] = (distribution[r3.band] ?? 0) + 1;
  missingPlusStructuralScore = r3.score;

  // 4. Extreme leverage + vacancy (85% LTV, 35% vacancy → expect ≥ 70, High)
  const r4 = run(
    "4. Extreme LTV + vacancy",
    [
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" },
      { severity_current: "High", confidence: "High", risk_type: "RefiRisk" },
      { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" },
      { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" },
      { severity_current: "Medium", confidence: "High", risk_type: "DataMissing" },
    ],
    {
      ltv: { value: 85, unit: "%", confidence: "High" },
      vacancy: { value: 35, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
      exit_cap: { value: 4.5, unit: "%", confidence: "Medium" },
      purchase_price: { value: 10_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 500_000, unit: "USD", confidence: "Medium" },
    }
  );
  printResult("4. Extreme LTV + vacancy", r4);
  distribution[r4.band] = (distribution[r4.band] ?? 0) + 1;
  extremeScore = r4.score;

  // 5. Compression (exit_cap < cap_rate_in, ramp)
  const r5 = run(
    "5. Exit cap compression",
    [{ severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" }],
    {
      exit_cap: { value: 4, unit: "%", confidence: "Medium" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
    }
  );
  printResult("5. Compression", r5);
  distribution[r5.band] = (distribution[r5.band] ?? 0) + 1;

  // 6. DSCR < 1.10 (force Elevated)
  const r6 = run(
    "6. DSCR < 1.10",
    [
      { severity_current: "High", confidence: "High", risk_type: "DebtCostRisk" },
      { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" },
    ],
    {
      ltv: { value: 80, unit: "%", confidence: "High" },
      purchase_price: { value: 20_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 800_000, unit: "USD", confidence: "Medium" },
      debt_rate: { value: 6, unit: "%", confidence: "High" },
    }
  );
  printResult("6. DSCR < 1.10", r6);
  distribution[r6.band] = (distribution[r6.band] ?? 0) + 1;

  // 7. High exposure + Elevated (for HIGH_IMPACT_RISK tag — tag set in API, not in pure scoring)
  const r7 = run(
    "7. High exposure scenario (band Elevated/High)",
    [
      { severity_current: "High", confidence: "High", risk_type: "ExitCapCompression" },
      { severity_current: "High", confidence: "High", risk_type: "VacancyUnderstated" },
    ],
    {
      ltv: { value: 80, unit: "%", confidence: "High" },
      vacancy: { value: 25, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5, unit: "%", confidence: "Medium" },
      exit_cap: { value: 4, unit: "%", confidence: "Medium" },
      purchase_price: { value: 25_000_000, unit: "USD", confidence: "High" },
      noi_year1: { value: 900_000, unit: "USD", confidence: "Medium" },
      debt_rate: { value: 6, unit: "%", confidence: "High" },
    }
  );
  printResult("7. High exposure + Elevated", r7);
  distribution[r7.band] = (distribution[r7.band] ?? 0) + 1;

  // 8. Unrealistic growth (rent_growth > 8%, low confidence → edge flag)
  const r8 = run(
    "8. Aggressive rent growth + low confidence",
    [{ severity_current: "Medium", confidence: "Low", risk_type: "RentGrowthAggressive" }],
    { rent_growth: { value: 10, unit: "%", confidence: "Low" }, ltv: { value: 65, unit: "%", confidence: "Medium" } }
  );
  printResult("8. Unrealistic growth", r8);
  distribution[r8.band] = (distribution[r8.band] ?? 0) + 1;

  // Distribution summary
  console.log("\n--- Distribution (count per tier) ---");
  console.log(JSON.stringify(distribution, null, 2));

  // Calibration logging: aggregate distribution metrics
  const allScores = [r1a.score, r1b.score, r2.score, r3.score, r4.score, r5.score, r6.score, r7.score, r8.score];
  const totalCount = allScores.length;
  const meanScore = allScores.reduce((a, b) => a + b, 0) / totalCount;
  const bandOrder = ["Low", "Moderate", "Elevated", "High"] as const;
  const bandPcts = bandOrder.map((b) => ({
    band: b,
    count: distribution[b] ?? 0,
    pct: Math.round(((distribution[b] ?? 0) / totalCount) * 100),
  }));
  console.log("\n--- Calibration (aggregate distribution metrics) ---");
  console.log(JSON.stringify({
    run_at: new Date().toISOString(),
    scenario_count: totalCount,
    mean_score: Math.round(meanScore * 100) / 100,
    min_score: Math.min(...allScores),
    max_score: Math.max(...allScores),
    distribution_by_band: bandPcts,
  }, null, 2));

  const variance = allScores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / totalCount;
  const stdDev = Math.sqrt(variance);
  const pctHigh = ((distribution.High ?? 0) / totalCount) * 100;
  const pctElevated = ((distribution.Elevated ?? 0) / totalCount) * 100;
  console.log("\n--- Stress harness metadata ---");
  console.log(JSON.stringify({
    model_version: getRiskModelMetadata().version,
    distribution_by_band: bandPcts,
    mean_score: Math.round(meanScore * 100) / 100,
    std_dev: Math.round(stdDev * 100) / 100,
    pct_high: Math.round(pctHigh * 100) / 100,
    pct_elevated: Math.round(pctElevated * 100) / 100,
  }, null, 2));

  // Assertions
  console.log("\n--- Assertions ---");
  const okExtreme = extremeScore >= 70;
  const okMissingOnly = missingOnlyScore <= 49;
  const okStructural = missingPlusStructuralScore > missingOnlyScore;
  const okDeterministic = r1a.score === r1b.score && r1a.band === r1b.band;
  console.log(`Extreme (4) score >= 70: ${okExtreme ? "PASS" : "FAIL"} (${extremeScore})`);
  console.log(`Missing-only (2) score <= 49: ${okMissingOnly ? "PASS" : "FAIL"} (${missingOnlyScore})`);
  console.log(`Structural (3) > missing-only (2): ${okStructural ? "PASS" : "FAIL"}`);
  console.log(`Deterministic (decimal vs percent): ${okDeterministic ? "PASS" : "FAIL"}`);

  const allPass = okExtreme && okMissingOnly && okStructural && okDeterministic;
  console.log(allPass ? "\nAll assertions passed." : "\nSome assertions failed.");
  process.exit(allPass ? 0 : 1);
}

main();
