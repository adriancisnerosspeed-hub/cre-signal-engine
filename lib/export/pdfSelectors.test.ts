import { describe, it, expect } from "vitest";
import {
  selectTopAssumptions,
  selectTopRisks,
  dedupeSignals,
  oneSentence,
  diligenceAction,
} from "./pdfSelectors";
import type { DealScanAssumptions } from "@/lib/dealScanContract";

describe("selectTopAssumptions", () => {
  it("returns top 6 by confidence desc then key whitelist order", () => {
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
    expect(top[0].key).toBe("ltv");
    expect(top[1].key).toBe("vacancy");
    expect(top[2].key).toBe("rent_growth");
    expect(top[3].key).toBe("cap_rate_in");
    expect(top[4].key).toBe("exit_cap");
    expect(top[5].key).toBe("debt_rate");
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

describe("dedupeSignals", () => {
  it("eliminates duplicate signal_id so each signal appears once", () => {
    const sameSignalId = "sig-123";
    const links = [
      { signal_id: sameSignalId, link_reason: "reason A", signal_type: "Rates" },
      { signal_id: sameSignalId, link_reason: "reason B", signal_type: "Rates" },
      { signal_id: "sig-456", link_reason: "other", signal_type: "Supply" },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.signal_id)).toEqual([sameSignalId, "sig-456"]);
    expect(result[0].display_text).toContain("Rates");
    expect(result[0].display_text).toContain("reason A");
  });

  it("respects max limit", () => {
    const links = [1, 2, 3, 4, 5, 6].map((i) => ({
      signal_id: `sig-${i}`,
      link_reason: `r${i}`,
      signal_type: null,
    }));
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(5);
  });

  it("first occurrence wins for display text", () => {
    const links = [
      { signal_id: "s1", link_reason: "first", signal_type: "Type" },
      { signal_id: "s1", link_reason: "second", signal_type: "Type" },
    ];
    const result = dedupeSignals(links, 5);
    expect(result).toHaveLength(1);
    expect(result[0].display_text).toContain("first");
    expect(result[0].display_text).not.toContain("second");
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
