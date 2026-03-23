import { describe, it, expect } from "vitest";
import { parseSignals } from "./parseSignals";

describe("parseSignals", () => {
  it("returns empty array for empty input", () => {
    expect(parseSignals("")).toEqual([]);
    expect(parseSignals("   ")).toEqual([]);
  });

  it("returns empty array for null-ish input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseSignals(null as any)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseSignals(undefined as any)).toEqual([]);
  });

  it("parses a single actionable signal", () => {
    const input = `1)
Signal Type: Credit Tightening
What Changed: Fed raised rates by 25bps
Why It Matters: Increases borrowing costs for CRE
Who This Affects: Leveraged buyers and refinancers
Action: Act
Confidence: High`;

    const result = parseSignals(input);
    expect(result).toHaveLength(1);
    expect(result[0].idx).toBe(1);
    expect(result[0].is_actionable).toBe(true);
    expect(result[0].signal_type).toBe("Credit Tightening");
    expect(result[0].what_changed).toBe("Fed raised rates by 25bps");
    expect(result[0].why_it_matters).toBe("Increases borrowing costs for CRE");
    expect(result[0].who_this_affects).toBe("Leveraged buyers and refinancers");
    expect(result[0].action).toBe("Act");
    expect(result[0].confidence).toBe("High");
  });

  it("parses multiple signals", () => {
    const input = `1)
Signal Type: Credit Tightening
What Changed: Rate hike
Why It Matters: Higher costs
Who This Affects: Buyers
Action: Act
Confidence: High
2)
Signal Type: Supply Surge
What Changed: New permits up 30%
Why It Matters: Downward rent pressure
Who This Affects: Landlords
Action: Monitor
Confidence: Medium`;

    const result = parseSignals(input);
    expect(result).toHaveLength(2);
    expect(result[0].idx).toBe(1);
    expect(result[0].signal_type).toBe("Credit Tightening");
    expect(result[1].idx).toBe(2);
    expect(result[1].signal_type).toBe("Supply Surge");
    expect(result[1].action).toBe("Monitor");
  });

  it("handles non-actionable signal marker", () => {
    const input = `1)
No actionable signal.`;

    const result = parseSignals(input);
    expect(result).toHaveLength(1);
    expect(result[0].is_actionable).toBe(false);
    expect(result[0].signal_type).toBeNull();
    expect(result[0].action).toBeNull();
  });

  it("marks signal as non-actionable when action is invalid", () => {
    const input = `1)
Signal Type: Noise
What Changed: Nothing significant
Why It Matters: Unclear
Who This Affects: Unknown
Action: Maybe
Confidence: Low`;

    const result = parseSignals(input);
    expect(result).toHaveLength(1);
    expect(result[0].is_actionable).toBe(false);
    expect(result[0].action).toBe("Maybe");
  });

  it("marks signal as non-actionable when signal_type is missing", () => {
    const input = `1)
What Changed: Something happened
Action: Act
Confidence: High`;

    const result = parseSignals(input);
    expect(result).toHaveLength(1);
    expect(result[0].is_actionable).toBe(false);
  });

  it("accepts all valid action values", () => {
    for (const action of ["Act", "Monitor", "Ignore"]) {
      const input = `1)
Signal Type: Test
What Changed: Test
Why It Matters: Test
Who This Affects: Test
Action: ${action}
Confidence: High`;
      const result = parseSignals(input);
      expect(result[0].is_actionable).toBe(true);
      expect(result[0].action).toBe(action);
    }
  });

  it("sorts results by idx", () => {
    const input = `3)
Signal Type: Third
What Changed: C
Action: Act
Confidence: High
1)
Signal Type: First
What Changed: A
Action: Monitor
Confidence: Low`;

    const result = parseSignals(input);
    expect(result).toHaveLength(2);
    expect(result[0].idx).toBe(1);
    expect(result[1].idx).toBe(3);
  });

  it("preserves raw_text for audit", () => {
    const input = `1)
Signal Type: Test Signal
What Changed: Something`;

    const result = parseSignals(input);
    expect(result[0].raw_text).toContain("1)");
    expect(result[0].raw_text).toContain("Test Signal");
  });

  it("handles mixed actionable and non-actionable signals", () => {
    const input = `1)
No actionable signal.
2)
Signal Type: Credit Tightening
What Changed: Rate hike
Action: Act
Confidence: High
3)
No actionable signal.`;

    const result = parseSignals(input);
    expect(result).toHaveLength(3);
    expect(result[0].is_actionable).toBe(false);
    expect(result[1].is_actionable).toBe(true);
    expect(result[2].is_actionable).toBe(false);
  });
});
