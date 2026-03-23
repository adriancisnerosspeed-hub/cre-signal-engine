import { describe, it, expect, vi } from "vitest";
import {
  ORG_SCAN_RATE_LIMIT_PER_HOUR,
  checkOrgScanRateLimit,
  getOrgScanCountInWindow,
} from "./rateLimit";

function mockSupabase(deals: { id: string }[], scanCount: number) {
  return {
    from: vi.fn((table: string) => {
      if (table === "deals") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: deals, error: null }),
          }),
        };
      }
      if (table === "deal_scans") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ count: scanCount, error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("ORG_SCAN_RATE_LIMIT_PER_HOUR", () => {
  it("defaults to 20", () => {
    expect(ORG_SCAN_RATE_LIMIT_PER_HOUR).toBe(20);
  });
});

describe("getOrgScanCountInWindow", () => {
  it("returns 0 when org has no deals", async () => {
    const supabase = mockSupabase([], 0);
    const count = await getOrgScanCountInWindow(supabase, "org-1", 3600000);
    expect(count).toBe(0);
  });

  it("returns scan count for org with deals", async () => {
    const supabase = mockSupabase([{ id: "d1" }, { id: "d2" }], 15);
    const count = await getOrgScanCountInWindow(supabase, "org-1", 3600000);
    expect(count).toBe(15);
  });
});

describe("checkOrgScanRateLimit", () => {
  it("allows when count is under limit", async () => {
    const supabase = mockSupabase([{ id: "d1" }], 5);
    const result = await checkOrgScanRateLimit(supabase, "org-1");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(5);
    expect(result.limit).toBe(20);
    expect(result.retryAfterSec).toBeNull();
  });

  it("blocks when count reaches limit", async () => {
    const supabase = mockSupabase([{ id: "d1" }], 20);
    const result = await checkOrgScanRateLimit(supabase, "org-1");
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(20);
    expect(result.retryAfterSec).toBe(3600);
  });

  it("blocks when count exceeds limit", async () => {
    const supabase = mockSupabase([{ id: "d1" }], 25);
    const result = await checkOrgScanRateLimit(supabase, "org-1");
    expect(result.allowed).toBe(false);
  });

  it("respects custom maxPerHour option", async () => {
    const supabase = mockSupabase([{ id: "d1" }], 3);
    const result = await checkOrgScanRateLimit(supabase, "org-1", {
      maxPerHour: 3,
    });
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(3);
  });

  it("respects custom windowMs option", async () => {
    const supabase = mockSupabase([{ id: "d1" }], 20);
    const windowMs = 30 * 60 * 1000; // 30 minutes
    const result = await checkOrgScanRateLimit(supabase, "org-1", {
      windowMs,
    });
    expect(result.retryAfterSec).toBe(1800);
  });

  it("allows when org has no deals", async () => {
    const supabase = mockSupabase([], 0);
    const result = await checkOrgScanRateLimit(supabase, "org-1");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });
});
