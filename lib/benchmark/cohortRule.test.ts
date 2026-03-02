import { describe, it, expect } from "vitest";
import { validateRule, evaluateRule, computeRuleHash, ALLOWED_FIELDS } from "./cohortRule";
import type { CohortEvalContext } from "./types";

describe("cohortRule", () => {
  describe("validateRule", () => {
    it("accepts valid eq rule", () => {
      const r = validateRule({ eq: ["asset_type", "industrial"] });
      expect(r).toEqual({ eq: ["asset_type", "industrial"] });
    });

    it("accepts valid and rule", () => {
      const r = validateRule({
        and: [
          { eq: ["asset_type", "industrial"] },
          { gte: ["risk_index_score", 0] },
        ],
      });
      expect(r).not.toBeNull();
    });

    it("rejects unknown operator", () => {
      expect(validateRule({ foo: ["asset_type", "x"] })).toBeNull();
    });

    it("rejects unknown field", () => {
      expect(validateRule({ eq: ["unknown_field", "x"] })).toBeNull();
    });

    it("rejects invalid gte (non-number threshold)", () => {
      expect(validateRule({ gte: ["risk_index_score", "x"] })).toBeNull();
    });
  });

  describe("evaluateRule", () => {
    const ctx: CohortEvalContext = {
      asset_type: "industrial",
      market_key: "dallas|TX",
      risk_index_score: 55,
      status: "completed",
    };

    it("eq matches", () => {
      expect(evaluateRule({ eq: ["asset_type", "industrial"] }, ctx)).toBe(true);
      expect(evaluateRule({ eq: ["asset_type", "office"] }, ctx)).toBe(false);
    });

    it("neq matches", () => {
      expect(evaluateRule({ neq: ["asset_type", "office"] }, ctx)).toBe(true);
      expect(evaluateRule({ neq: ["asset_type", "industrial"] }, ctx)).toBe(false);
    });

    it("in matches", () => {
      expect(evaluateRule({ in: ["asset_type", ["industrial", "office"]] }, ctx)).toBe(true);
      expect(evaluateRule({ in: ["asset_type", ["office", "retail"]] }, ctx)).toBe(false);
    });

    it("gte/lte match", () => {
      expect(evaluateRule({ gte: ["risk_index_score", 50] }, ctx)).toBe(true);
      expect(evaluateRule({ gte: ["risk_index_score", 60] }, ctx)).toBe(false);
      expect(evaluateRule({ lte: ["risk_index_score", 60] }, ctx)).toBe(true);
      expect(evaluateRule({ lte: ["risk_index_score", 40] }, ctx)).toBe(false);
    });

    it("exists checks presence", () => {
      expect(evaluateRule({ exists: ["asset_type"] }, ctx)).toBe(true);
      expect(evaluateRule({ exists: ["missing_field"] }, ctx)).toBe(false);
    });

    it("and combines", () => {
      expect(
        evaluateRule(
          {
            and: [
              { eq: ["asset_type", "industrial"] },
              { gte: ["risk_index_score", 50] },
            ],
          },
          ctx
        )
      ).toBe(true);
      expect(
        evaluateRule(
          {
            and: [
              { eq: ["asset_type", "industrial"] },
              { gte: ["risk_index_score", 100] },
            ],
          },
          ctx
        )
      ).toBe(false);
    });

    it("or combines", () => {
      expect(
        evaluateRule(
          {
            or: [
              { eq: ["asset_type", "office"] },
              { eq: ["asset_type", "industrial"] },
            ],
          },
          ctx
        )
      ).toBe(true);
    });

    it("not negates", () => {
      expect(evaluateRule({ not: { eq: ["asset_type", "office"] } }, ctx)).toBe(true);
      expect(evaluateRule({ not: { eq: ["asset_type", "industrial"] } }, ctx)).toBe(false);
    });
  });

  describe("computeRuleHash", () => {
    it("is deterministic for same rule", () => {
      const rule = { and: [{ eq: ["asset_type", "industrial"] }, { in: ["market_key", ["a", "b"]] }] };
      const h1 = computeRuleHash(rule);
      const h2 = computeRuleHash(rule);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("differs for different rules", () => {
      const h1 = computeRuleHash({ eq: ["asset_type", "industrial"] });
      const h2 = computeRuleHash({ eq: ["asset_type", "office"] });
      expect(h1).not.toBe(h2);
    });
  });

  it("ALLOWED_FIELDS includes expected fields", () => {
    expect(ALLOWED_FIELDS.has("asset_type")).toBe(true);
    expect(ALLOWED_FIELDS.has("risk_index_score")).toBe(true);
    expect(ALLOWED_FIELDS.has("vintage_year")).toBe(true);
  });
});
