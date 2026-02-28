import { describe, it, expect } from "vitest";
import { bandChange, buildAuditRows, type ScanRowForAudit } from "./backfillRiskAuditLog";

describe("bandChange", () => {
  it("returns null when from or to is null", () => {
    expect(bandChange(null, "High")).toBeNull();
    expect(bandChange("Low", null)).toBeNull();
    expect(bandChange(null, null)).toBeNull();
  });

  it("returns null when bands are the same", () => {
    expect(bandChange("Moderate", "Moderate")).toBeNull();
    expect(bandChange("High", "High")).toBeNull();
  });

  it("returns formatted string when bands differ", () => {
    expect(bandChange("Low", "Moderate")).toBe("Low → Moderate");
    expect(bandChange("Elevated", "High")).toBe("Elevated → High");
    expect(bandChange("Moderate", "Low")).toBe("Moderate → Low");
  });

  it("trims whitespace", () => {
    expect(bandChange(" Low ", " Moderate ")).toBe("Low → Moderate");
  });
});

describe("buildAuditRows", () => {
  it("skips scan_ids already in existingScanIds", () => {
    const byDeal = new Map<string, ScanRowForAudit[]>([
      [
        "deal-1",
        [
          {
            id: "scan-1",
            deal_id: "deal-1",
            risk_index_score: 50,
            risk_index_band: "Moderate",
            risk_index_version: "2.0",
            created_at: "2025-01-02T00:00:00Z",
          },
        ],
      ],
    ]);
    const existing = new Set(["scan-1"]);
    const rows = buildAuditRows(byDeal, existing, "2.0");
    expect(rows).toHaveLength(0);
  });

  it("computes previous_score from next scan in list (created_at DESC order)", () => {
    const byDeal = new Map<string, ScanRowForAudit[]>([
      [
        "deal-1",
        [
          {
            id: "scan-new",
            deal_id: "deal-1",
            risk_index_score: 60,
            risk_index_band: "Elevated",
            risk_index_version: "2.0",
            created_at: "2025-01-02T00:00:00Z",
          },
          {
            id: "scan-old",
            deal_id: "deal-1",
            risk_index_score: 45,
            risk_index_band: "Moderate",
            risk_index_version: "2.0",
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
      ],
    ]);
    const rows = buildAuditRows(byDeal, new Set(), "2.0");
    expect(rows).toHaveLength(2);
    const newer = rows.find((r) => r.scan_id === "scan-new");
    const older = rows.find((r) => r.scan_id === "scan-old");
    expect(newer?.previous_score).toBe(45);
    expect(newer?.new_score).toBe(60);
    expect(newer?.delta).toBe(15);
    expect(newer?.band_change).toBe("Moderate → Elevated");
    expect(older?.previous_score).toBeNull();
    expect(older?.new_score).toBe(45);
    expect(older?.delta).toBeNull();
  });

  it("uses defaultVersion when scan has no version", () => {
    const byDeal = new Map<string, ScanRowForAudit[]>([
      [
        "deal-1",
        [
          {
            id: "scan-1",
            deal_id: "deal-1",
            risk_index_score: 40,
            risk_index_band: "Moderate",
            risk_index_version: null,
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
      ],
    ]);
    const rows = buildAuditRows(byDeal, new Set(), "2.0 (Institutional)");
    expect(rows).toHaveLength(1);
    expect(rows[0].model_version).toBe("2.0 (Institutional)");
  });
});
