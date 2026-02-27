import { describe, it, expect } from "vitest";
import { resolveLatestScanId } from "./portfolioSummary";
import { PORTFOLIO_STALE_DAYS } from "./constants";

type ScanRow = {
  id: string;
  deal_id: string;
  created_at: string;
};

describe("resolveLatestScanId (latest-scan invariant)", () => {
  it("uses deal.latest_scan_id when set, even if a newer scan exists by created_at", () => {
    const deal = { id: "deal-1", latest_scan_id: "scan-old" };
    const scansByDealId = new Map<string, ScanRow[]>([
      [
        "deal-1",
        [
          { id: "scan-new", deal_id: "deal-1", created_at: "2025-02-01T12:00:00Z" },
          { id: "scan-old", deal_id: "deal-1", created_at: "2025-01-01T12:00:00Z" },
        ],
      ],
    ]);
    expect(resolveLatestScanId(deal, scansByDealId)).toBe("scan-old");
  });

  it("fallback: when latest_scan_id is null, returns max by (created_at DESC, id DESC)", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>([
      [
        "deal-1",
        [
          { id: "scan-a", deal_id: "deal-1", created_at: "2025-01-02T12:00:00Z" },
          { id: "scan-b", deal_id: "deal-1", created_at: "2025-01-02T12:00:00Z" },
          { id: "scan-c", deal_id: "deal-1", created_at: "2025-01-01T12:00:00Z" },
        ],
      ],
    ]);
    const result = resolveLatestScanId(deal, scansByDealId);
    expect(result).toBe("scan-b");
  });

  it("when latest_scan_id is null and no scans, returns null", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>();
    expect(resolveLatestScanId(deal, scansByDealId)).toBeNull();
  });

  it("when latest_scan_id is null and empty array for deal, returns null", () => {
    const deal = { id: "deal-1", latest_scan_id: null as string | null };
    const scansByDealId = new Map<string, ScanRow[]>([["deal-1", []]]);
    expect(resolveLatestScanId(deal, scansByDealId)).toBeNull();
  });
});

describe("PORTFOLIO_STALE_DAYS constant", () => {
  it("is 30 for stale badge and alerts", () => {
    expect(PORTFOLIO_STALE_DAYS).toBe(30);
  });
});
