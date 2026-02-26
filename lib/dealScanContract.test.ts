import { describe, it, expect } from "vitest";
import {
  repairDealScanJson,
  parseDealScanOutput,
  normalizeDealScanOutput,
  parseAndNormalizeDealScan,
  type DealScanRaw,
} from "./dealScanContract";

describe("repairDealScanJson", () => {
  it("strips markdown code fence", () => {
    expect(repairDealScanJson("```json\n{}\n```")).toBe("{}");
    expect(repairDealScanJson("```\n{}\n```")).toBe("{}");
  });

  it("returns trimmed string when no fence", () => {
    expect(repairDealScanJson('  {"assumptions":{}}  ')).toBe('{"assumptions":{}}');
  });
});

describe("parseDealScanOutput", () => {
  it("parses valid JSON with assumptions and risks", () => {
    const raw = '{"assumptions":{"cap_rate_in":{"value":5.5,"unit":"percent","confidence":"High"}},"risks":[]}';
    const out = parseDealScanOutput(raw);
    expect(out).not.toBeNull();
    expect((out as DealScanRaw).assumptions?.cap_rate_in).toEqual({
      value: 5.5,
      unit: "percent",
      confidence: "High",
    });
    expect((out as DealScanRaw).risks).toEqual([]);
  });

  it("returns null for invalid JSON", () => {
    expect(parseDealScanOutput("not json")).toBeNull();
    expect(parseDealScanOutput("")).toBeNull();
  });

  it("parses after repair when wrapped in fences", () => {
    const raw = '```json\n{"assumptions":{},"risks":[{"risk_type":"DataMissing","severity":"Low"}]}\n```';
    const out = parseDealScanOutput(raw);
    expect(out).not.toBeNull();
    expect((out as DealScanRaw).risks).toHaveLength(1);
  });
});

describe("normalizeDealScanOutput", () => {
  it("normalizes assumption value with comma and percent", () => {
    const parsed: DealScanRaw = {
      assumptions: {
        cap_rate_in: { value: "5.5%", unit: "percent", confidence: "Medium" },
      },
      risks: [],
    };
    const out = normalizeDealScanOutput(parsed);
    expect(out.assumptions.cap_rate_in?.value).toBe(5.5);
    expect(out.assumptions.cap_rate_in?.confidence).toBe("Medium");
  });

  it("maps unknown risk_type to DataMissing", () => {
    const parsed: DealScanRaw = {
      assumptions: {},
      risks: [{ risk_type: "CustomRisk", severity: "High", what_changed_or_trigger: "x", why_it_matters: "", who_this_affects: "", recommended_action: "Act", confidence: "Low", evidence_snippets: [] }],
    };
    const out = normalizeDealScanOutput(parsed);
    expect(out.risks).toHaveLength(1);
    expect(out.risks[0].risk_type).toBe("DataMissing");
    expect(out.risks[0].severity).toBe("High");
  });

  it("dedupes risks by risk_type + trigger", () => {
    const parsed: DealScanRaw = {
      assumptions: {},
      risks: [
        { risk_type: "RefiRisk", severity: "Medium", what_changed_or_trigger: "Same text", why_it_matters: "", who_this_affects: "", recommended_action: "Monitor", confidence: "Low", evidence_snippets: [] },
        { risk_type: "RefiRisk", severity: "Low", what_changed_or_trigger: "Same text", why_it_matters: "", who_this_affects: "", recommended_action: "Act", confidence: "High", evidence_snippets: [] },
      ],
    };
    const out = normalizeDealScanOutput(parsed);
    expect(out.risks).toHaveLength(1);
  });

  it("keeps distinct risks", () => {
    const parsed: DealScanRaw = {
      assumptions: {},
      risks: [
        { risk_type: "RefiRisk", severity: "Medium", what_changed_or_trigger: "A", why_it_matters: "", who_this_affects: "", recommended_action: "Monitor", confidence: "Low", evidence_snippets: [] },
        { risk_type: "RefiRisk", severity: "Low", what_changed_or_trigger: "B", why_it_matters: "", who_this_affects: "", recommended_action: "Act", confidence: "High", evidence_snippets: [] },
      ],
    };
    const out = normalizeDealScanOutput(parsed);
    expect(out.risks).toHaveLength(2);
  });

  it("collapses multiple DataMissing into one", () => {
    const parsed: DealScanRaw = {
      assumptions: {},
      risks: [
        { risk_type: "DataMissing", severity: "Low", what_changed_or_trigger: "Missing cap rate", why_it_matters: "", who_this_affects: "", recommended_action: "Monitor", confidence: "Low", evidence_snippets: [] },
        { risk_type: "DataMissing", severity: "Medium", what_changed_or_trigger: "Missing vacancy", why_it_matters: "", who_this_affects: "", recommended_action: "Act", confidence: "High", evidence_snippets: [] },
      ],
    };
    const out = normalizeDealScanOutput(parsed);
    expect(out.risks.filter((r) => r.risk_type === "DataMissing")).toHaveLength(1);
    expect(out.risks.some((r) => r.risk_type === "DataMissing")).toBe(true);
  });
});

describe("parseAndNormalizeDealScan", () => {
  it("returns null when JSON invalid", () => {
    expect(parseAndNormalizeDealScan("not json")).toBeNull();
  });

  it("returns normalized output for valid golden case", () => {
    const golden = `
{
  "assumptions": {
    "cap_rate_in": { "value": 5.2, "unit": "percent", "confidence": "High" },
    "exit_cap": { "value": 6, "unit": "percent", "confidence": "Medium" }
  },
  "risks": [
    {
      "risk_type": "ExitCapCompression",
      "severity": "High",
      "what_changed_or_trigger": "Cap rates expanding",
      "why_it_matters": "Exit value at risk",
      "who_this_affects": "Investor",
      "recommended_action": "Monitor",
      "confidence": "Medium",
      "evidence_snippets": ["snippet 1"]
    }
  ]
}
`;
    const out = parseAndNormalizeDealScan(golden);
    expect(out).not.toBeNull();
    expect(out!.assumptions.cap_rate_in?.value).toBe(5.2);
    expect(out!.assumptions.exit_cap?.value).toBe(6);
    expect(out!.risks).toHaveLength(1);
    expect(out!.risks[0].risk_type).toBe("ExitCapCompression");
    expect(out!.risks[0].severity).toBe("High");
  });
});
