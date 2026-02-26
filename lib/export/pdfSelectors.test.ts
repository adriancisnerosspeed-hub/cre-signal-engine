import { describe, it, expect } from "vitest";
import {
  selectTopAssumptions,
  selectTopRisks,
  dedupeSignals,
  normalizeTextForDedupe,
  signalStableKey,
  selectMacroSignalsForPdf,
  MAX_SIGNALS_OVERALL,
  oneSentence,
  diligenceAction,
} from "./pdfSelectors";
import type { DealScanAssumptions } from "@/lib/dealScanContract";

describe("selectTopAssumptions", () => {
  it("returns top N by confidence desc then IC key order (purchase_price, noi_year1, ...)", () => {
    const assumptions: DealScanAssumptions = {
      purchase_price: { value: 10e6, unit: "USD", confidence: "Low" },
      ltv: { value: 65, unit: "%", confidence: "High" },
      vacancy: { value: 5, unit: "%", confidence: "High" },
      cap_rate_in: { value: 5.5, unit: "%", confidence: "Medium" },
      exit_cap: { value: 5.25, unit: "%", confidence: "Medium" },
      debt_rate: { value: 5, unit: "%", confidence: "Low" },
      rent_growth: { value: 3, unit: "%", confidence: "High" },
    };
    const top = selectTopAssumptions(assumptions, 6);
    expect(top).toHaveLength(6);
    expect(top[0].key).toBe("vacancy");
    expect(top[1].key).toBe("ltv");
    expect(top[2].key).toBe("rent_growth");
    expect(top[3].key).toBe("cap_rate_in");
    expect(top[4].key).toBe("exit_cap");
    expect(top[5].key).toBe("purchase_price");
  });

  it("returns empty for null/undefined", () => {
    expect(selectTopAssumptions(null, 6)).toEqual([]);
    expect(selectTopAssumptions(undefined, 6)).toEqual([]);
  });
});

describe("selectTopRisks", () => {
  it("returns top 3 by severity desc then confidence desc", () => {
    const risks = [
      { risk_type: "A", severity_current: "Low", confidence: "High", why_it_matters: "a", recommended_action: "Monitor" },
      { risk_type: "B", severity_current: "High", confidence: "Medium", why_it_matters: "b", recommended_action: "Act" },
      { risk_type: "C", severity_current: "Medium", confidence: "High", why_it_matters: "c", recommended_action: null },
      { risk_type: "D", severity_current: "High", confidence: "High", why_it_matters: "d", recommended_action: "Act" },
    ];
    const top = selectTopRisks(risks, 3);
    expect(top).toHaveLength(3);
    expect(top[0].risk_type).toBe("D");
    expect(top[1].risk_type).toBe("B");
    expect(top[2].risk_type).toBe("C");
  });
});

describe("normalizeTextForDedupe", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTextForDedupe("  a  b   c  ")).toBe("a b c");
  });
  it("removes trailing punctuation", () => {
    expect(normalizeTextForDedupe("hello.")).toBe("hello");
    expect(normalizeTextForDedupe("hello..")).toBe("hello");
  });
  it("returns empty for null/undefined", () => {
    expect(normalizeTextForDedupe(null)).toBe("");
    expect(normalizeTextForDedupe(undefined)).toBe("");
  });
});

describe("signalStableKey", () => {
  it("produces same key for same category and normalized body", () => {
    expect(signalStableKey("Supply-Demand", "Pipeline of 12,000 units.")).toBe(
      signalStableKey("supply-demand", "  Pipeline of 12,000 units  ")
    );
  });
  it("produces different keys for different content", () => {
    expect(signalStableKey("Rates", "Fed hold")).not.toBe(signalStableKey("Supply", "Fed hold"));
  });
});

describe("dedupeSignals", () => {
  it("dedupes by content key (category::normalizedText), not only signal_id", () => {
    const links = [
      { signal_id: "sig-1", link_reason: "3-year pipeline of 12,000 units.", signal_type: "Supply-Demand" },
      { signal_id: "sig-2", link_reason: "3-year pipeline of 12,000 units.", signal_type: "Supply-Demand" },
      { signal_id: "sig-3", link_reason: "Other signal", signal_type: "Rates" },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(2);
    expect(result[0].display_text).toContain("Supply-Demand");
    expect(result[0].display_text).toContain("3-year pipeline");
  });

  it("collapses near-duplicates (spacing and trailing punctuation)", () => {
    const links = [
      { signal_id: "a", signal_type: "Supply", what_changed: "Pipeline of 12,000 units." },
      { signal_id: "b", signal_type: "Supply", what_changed: "  Pipeline of 12,000 units  " },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(1);
  });

  it("respects max limit", () => {
    const links = [1, 2, 3, 4, 5, 6].map((i) => ({
      signal_id: `sig-${i}`,
      link_reason: `unique reason ${i}`,
      signal_type: `Type${i}`,
    }));
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(5);
  });

  it("first occurrence wins for display text", () => {
    const links = [
      { signal_id: "s1", link_reason: "first", signal_type: "Type" },
      { signal_id: "s2", link_reason: "first", signal_type: "Type" },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(1);
    expect(result[0].display_text).toContain("first");
  });
});

describe("selectMacroSignalsForPdf", () => {
  it("returns empty array when no links", () => {
    const result = selectMacroSignalsForPdf({ linksWithRisk: [], assetType: null, market: null });
    expect(result).toEqual([]);
  });

  it("respects maxSignalsOverall cap", () => {
    const linksWithRisk = Array.from({ length: 10 }, (_, i) => ({
      deal_risk_id: "r1",
      risk_type: "VacancyUnderstated",
      signal_id: `s${i}`,
      link_reason: `reason ${i}`,
      signal_type: `Supply-${i}`,
      what_changed: `content ${i}`,
    }));
    const result = selectMacroSignalsForPdf({
      linksWithRisk,
      assetType: "Multifamily",
      market: null,
      maxOverall: MAX_SIGNALS_OVERALL,
    });
    expect(result.length).toBeLessThanOrEqual(MAX_SIGNALS_OVERALL);
  });

  it("caps per-risk signals", () => {
    const linksWithRisk = [
      { deal_risk_id: "r1", risk_type: "ExitCapCompression", signal_id: "s1", link_reason: "a", signal_type: "Rates", what_changed: "a" },
      { deal_risk_id: "r1", risk_type: "ExitCapCompression", signal_id: "s2", link_reason: "b", signal_type: "Rates", what_changed: "b" },
      { deal_risk_id: "r1", risk_type: "ExitCapCompression", signal_id: "s3", link_reason: "c", signal_type: "Rates", what_changed: "c" },
    ];
    const result = selectMacroSignalsForPdf({
      linksWithRisk,
      assetType: null,
      market: null,
      maxPerRisk: 2,
      maxOverall: 5,
    });
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("oneSentence", () => {
  it("returns first sentence", () => {
    expect(oneSentence("First sentence. Second sentence.")).toBe("First sentence.");
  });
  it("returns trimmed up to ~100 chars when no period", () => {
    const long = "a".repeat(150);
    expect(oneSentence(long).length).toBeLessThanOrEqual(101);
  });
});

describe("diligenceAction", () => {
  it("returns one sentence of recommended_action", () => {
    expect(diligenceAction("Review the cap rate. Do more work.")).toBe("Review the cap rate.");
  });
  it("returns Monitor when null/empty", () => {
    expect(diligenceAction(null)).toBe("Monitor.");
    expect(diligenceAction("")).toBe("Monitor.");
  });
});
