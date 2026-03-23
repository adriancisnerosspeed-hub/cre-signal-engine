import { describe, it, expect, vi } from "vitest";
import {
  getUsageToday,
  getDealScansToday,
  getTotalFullScansUsed,
  incrementAnalyzeUsage,
  incrementDealScanUsage,
  incrementTotalFullScans,
} from "./usage";

function mockSupabaseSelect(returnData: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
        }),
      }),
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function mockSupabaseRpc(returnData: unknown, error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: returnData, error }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getUsageToday", () => {
  it("returns zeros when no usage row exists", async () => {
    const supabase = mockSupabaseSelect(null);
    const result = await getUsageToday(supabase, "user-1");
    expect(result).toEqual({
      analyze_calls: 0,
      tokens_estimated: 0,
      deal_scans: 0,
    });
  });

  it("returns values from existing row", async () => {
    const supabase = mockSupabaseSelect({
      analyze_calls: 5,
      tokens_estimated: 12000,
      deal_scans: 3,
    });
    const result = await getUsageToday(supabase, "user-1");
    expect(result).toEqual({
      analyze_calls: 5,
      tokens_estimated: 12000,
      deal_scans: 3,
    });
  });

  it("defaults missing fields to zero", async () => {
    const supabase = mockSupabaseSelect({ analyze_calls: 2 });
    const result = await getUsageToday(supabase, "user-1");
    expect(result.analyze_calls).toBe(2);
    expect(result.tokens_estimated).toBe(0);
    expect(result.deal_scans).toBe(0);
  });
});

describe("getDealScansToday", () => {
  it("returns 0 when no row exists", async () => {
    const supabase = mockSupabaseSelect(null);
    const count = await getDealScansToday(supabase, "user-1");
    expect(count).toBe(0);
  });

  it("returns deal_scans count from existing row", async () => {
    const supabase = mockSupabaseSelect({ deal_scans: 7 });
    const count = await getDealScansToday(supabase, "user-1");
    expect(count).toBe(7);
  });
});

describe("getTotalFullScansUsed", () => {
  it("returns 0 when no profile exists", async () => {
    const supabase = mockSupabaseSelect(null);
    const count = await getTotalFullScansUsed(supabase, "user-1");
    expect(count).toBe(0);
  });

  it("returns count from profile", async () => {
    const supabase = mockSupabaseSelect({ total_full_scans_used: 3 });
    const count = await getTotalFullScansUsed(supabase, "user-1");
    expect(count).toBe(3);
  });
});

describe("incrementAnalyzeUsage", () => {
  it("calls RPC with correct parameters", async () => {
    const supabase = mockSupabaseRpc(null);
    await incrementAnalyzeUsage(supabase, "user-1", 1500);
    expect(supabase.rpc).toHaveBeenCalledWith("increment_usage_daily", {
      p_user_id: "user-1",
      p_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_tokens_estimated: 1500,
    });
  });

  it("rounds token estimate", async () => {
    const supabase = mockSupabaseRpc(null);
    await incrementAnalyzeUsage(supabase, "user-1", 1500.7);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "increment_usage_daily",
      expect.objectContaining({ p_tokens_estimated: 1501 })
    );
  });

  it("defaults NaN tokens to 0", async () => {
    const supabase = mockSupabaseRpc(null);
    await incrementAnalyzeUsage(supabase, "user-1", NaN);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "increment_usage_daily",
      expect.objectContaining({ p_tokens_estimated: 0 })
    );
  });

  it("throws on RPC error", async () => {
    const supabase = mockSupabaseRpc(null, { message: "DB error" });
    await expect(incrementAnalyzeUsage(supabase, "user-1", 100)).rejects.toEqual({
      message: "DB error",
    });
  });
});

describe("incrementDealScanUsage", () => {
  it("calls v2 RPC with org_id", async () => {
    const supabase = mockSupabaseRpc(null);
    await incrementDealScanUsage(supabase, "user-1", "org-1");
    expect(supabase.rpc).toHaveBeenCalledWith("increment_usage_daily_deal_scans_v2", {
      p_user_id: "user-1",
      p_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_org_id: "org-1",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockSupabaseRpc(null, { message: "RPC failed" });
    await expect(incrementDealScanUsage(supabase, "user-1", "org-1")).rejects.toEqual({
      message: "RPC failed",
    });
  });
});

describe("incrementTotalFullScans", () => {
  it("returns new count from RPC", async () => {
    const supabase = mockSupabaseRpc(4);
    const result = await incrementTotalFullScans(supabase, "user-1");
    expect(result).toBe(4);
  });

  it("throws on RPC error", async () => {
    const supabase = mockSupabaseRpc(null, { message: "increment failed" });
    await expect(incrementTotalFullScans(supabase, "user-1")).rejects.toEqual({
      message: "increment failed",
    });
  });
});
