import { describe, it, expect } from "vitest";
import {
  normalizeState,
  normalizeCity,
  normalizeMarket,
  exposureMarketKey,
  exposureMarketLabel,
} from "./normalizeMarket";

describe("normalizeState", () => {
  it("returns 2-letter USPS uppercase for abbrev and full name", () => {
    expect(normalizeState("tx")).toBe("TX");
    expect(normalizeState("TX")).toBe("TX");
    expect(normalizeState("Texas")).toBe("TX");
    expect(normalizeState("texas")).toBe("TX");
    expect(normalizeState("Tx.")).toBe("TX");
    expect(normalizeState("TEXAS")).toBe("TX");
    expect(normalizeState("fl")).toBe("FL");
    expect(normalizeState("florida")).toBe("FL");
    expect(normalizeState("NC")).toBe("NC");
    expect(normalizeState("North Carolina")).toBe("NC");
    expect(normalizeState("TN")).toBe("TN");
    expect(normalizeState("AZ")).toBe("AZ");
    expect(normalizeState("CA")).toBe("CA");
    expect(normalizeState("NY")).toBe("NY");
    expect(normalizeState("IL")).toBe("IL");
    expect(normalizeState("GA")).toBe("GA");
    expect(normalizeState("CO")).toBe("CO");
    expect(normalizeState("WA")).toBe("WA");
    expect(normalizeState("MA")).toBe("MA");
    expect(normalizeState("PA")).toBe("PA");
    expect(normalizeState("NJ")).toBe("NJ");
    expect(normalizeState("DC")).toBe("DC");
  });
  it("returns null for empty", () => {
    expect(normalizeState("")).toBeNull();
    expect(normalizeState(null)).toBeNull();
  });
});

describe("normalizeCity", () => {
  it("title-cases and trims", () => {
    expect(normalizeCity("dallas")).toBe("Dallas");
    expect(normalizeCity("Dallas")).toBe("Dallas");
    expect(normalizeCity(" Dallas  ")).toBe("Dallas");
  });
  it("preserves multi-word and St./Ft.", () => {
    expect(normalizeCity("fort worth")).toBe("Fort Worth");
    expect(normalizeCity("st. petersburg")).toBe("St. Petersburg");
    expect(normalizeCity("st louis")).toBe("St. Louis");
  });
  it("returns null for empty", () => {
    expect(normalizeCity("")).toBeNull();
    expect(normalizeCity(null)).toBeNull();
  });
});

describe("normalizeMarket", () => {
  it("(Dallas, tx) -> dallas|TX, Dallas, TX", () => {
    const r = normalizeMarket({ city: "Dallas", state: "tx" });
    expect(r.market_key).toBe("dallas|TX");
    expect(r.market_label).toBe("Dallas, TX");
    expect(r.city).toBe("Dallas");
    expect(r.state).toBe("TX");
  });

  it("(dallas, Texas) -> dallas|TX, Dallas, TX", () => {
    const r = normalizeMarket({ city: "dallas", state: "Texas" });
    expect(r.market_key).toBe("dallas|TX");
    expect(r.market_label).toBe("Dallas, TX");
  });

  it("( Fort   Worth , Tx.) -> fort worth|TX, Fort Worth, TX", () => {
    const r = normalizeMarket({ city: " Fort   Worth ", state: "Tx." });
    expect(r.market_key).toBe("fort worth|TX");
    expect(r.market_label).toBe("Fort Worth, TX");
  });

  it("(Tampa, florida) -> tampa|FL, Tampa, FL", () => {
    const r = normalizeMarket({ city: "Tampa", state: "florida" });
    expect(r.market_key).toBe("tampa|FL");
    expect(r.market_label).toBe("Tampa, FL");
  });

  it("(Charlotte, NC) -> charlotte|NC, Charlotte, NC", () => {
    const r = normalizeMarket({ city: "Charlotte", state: "NC" });
    expect(r.market_key).toBe("charlotte|NC");
    expect(r.market_label).toBe("Charlotte, NC");
  });

  it("single market string Dallas, Texas -> same key as Dallas, TX", () => {
    const r1 = normalizeMarket({ market: "Dallas, Texas" });
    const r2 = normalizeMarket({ market: "Dallas, TX" });
    expect(r1.market_key).toBe("dallas|TX");
    expect(r2.market_key).toBe("dallas|TX");
    expect(r1.market_label).toBe("Dallas, TX");
    expect(r2.market_label).toBe("Dallas, TX");
  });

  it("single market string dallas TX (no comma) -> dallas|TX", () => {
    const r = normalizeMarket({ market: "dallas TX" });
    expect(r.market_key).toBe("dallas|TX");
    expect(r.market_label).toBe("Dallas, TX");
  });

  it("Dallas Texas (no comma) -> same canonical as Dallas, TX", () => {
    const r = normalizeMarket({ market: "Dallas Texas" });
    expect(r.market_key).toBe("dallas|TX");
    expect(r.market_label).toBe("Dallas, TX");
  });

  it("Dallas ,TX (comma with space before state) -> Dallas, TX", () => {
    const r = normalizeMarket({ market: "Dallas ,TX" });
    expect(r.market_key).toBe("dallas|TX");
    expect(r.market_label).toBe("Dallas, TX");
  });

  it("empty input -> nulls", () => {
    const r = normalizeMarket({});
    expect(r.market_key).toBeNull();
    expect(r.market_label).toBeNull();
  });
});

describe("exposure grouping", () => {
  it("same market_key for Dallas,Tx and dallas TX and Dallas, Texas", () => {
    const rows = [
      { market_key: null, market: "Dallas, Tx" },
      { market_key: null, market: "dallas TX" },
      { market_key: null, market: "Dallas, Texas" },
      { market_key: "dallas|TX", market_label: "Dallas, TX" },
    ];
    const keys = rows.map(exposureMarketKey);
    expect(keys[0]).toBe("dallas|TX");
    expect(keys[1]).toBe("dallas|TX");
    expect(keys[2]).toBe("dallas|TX");
    expect(keys[3]).toBe("dallas|TX");
    const labels = rows.map(exposureMarketLabel);
    expect(labels.every((l) => l === "Dallas, TX")).toBe(true);
  });

  it("exposure grouping does not duplicate Dallas", () => {
    const withScore = [
      { market_key: null, market: "Dallas, Tx", risk_index_score: 40 },
      { market_key: null, market: "dallas TX", risk_index_score: 42 },
    ];
    const byMarket: Record<string, number> = {};
    const marketLabelByKey: Record<string, string> = {};
    for (const d of withScore) {
      const key = exposureMarketKey(d);
      byMarket[key] = (byMarket[key] ?? 0) + 1;
      if (!marketLabelByKey[key]) marketLabelByKey[key] = exposureMarketLabel(d);
    }
    expect(Object.keys(byMarket)).toHaveLength(1);
    expect(Object.keys(byMarket)[0]).toBe("dallas|TX");
    expect(byMarket["dallas|TX"]).toBe(2);
    expect(marketLabelByKey["dallas|TX"]).toBe("Dallas, TX");
  });
});
