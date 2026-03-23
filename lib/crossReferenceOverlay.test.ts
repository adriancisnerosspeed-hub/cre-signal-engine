import { describe, it, expect, vi } from "vitest";

/**
 * The crossReferenceOverlay module has pure helper functions (signalTypeMatchesRisk,
 * bumpedSeverity, signalAppliesToDeal, etc.) that are not exported. We test the
 * module's behavior through the exported runOverlay function with mocked Supabase,
 * and also test the macro relevance helpers it depends on.
 */

// Test the macro relevance helpers used by the overlay
import { isSignalRelevant, inferSignalContext } from "./macroRelevance";

describe("inferSignalContext", () => {
  it("infers multifamily asset type", () => {
    const ctx = inferSignalContext("Multifamily Supply Pipeline", "New permits rising");
    expect(ctx.asset_type).toBe("multifamily");
  });

  it("infers office asset type", () => {
    const ctx = inferSignalContext("Office Vacancy Trend", null);
    expect(ctx.asset_type).toBe("office");
  });

  it("infers retail asset type", () => {
    const ctx = inferSignalContext(null, "Retail demand declining in malls");
    expect(ctx.asset_type).toBe("retail");
  });

  it("infers industrial asset type", () => {
    const ctx = inferSignalContext("Industrial Logistics Boom", null);
    expect(ctx.asset_type).toBe("industrial");
  });

  it("returns null asset_type when no match", () => {
    const ctx = inferSignalContext("Credit Tightening", "Rates increased");
    expect(ctx.asset_type).toBeNull();
  });

  it("infers state from signal text", () => {
    const ctx = inferSignalContext("Insurance Policy", "Florida hurricane exposure rising");
    expect(ctx.state).toBe("florida");
  });

  it("infers market from signal text", () => {
    const ctx = inferSignalContext(null, "Phoenix metro vacancy at 12%");
    expect(ctx.state).toBe("phoenix");
  });

  it("returns null state when no match", () => {
    const ctx = inferSignalContext("Credit Spread", "Widening across markets");
    expect(ctx.state).toBeNull();
  });

  it("handles null inputs gracefully", () => {
    const ctx = inferSignalContext(null, null);
    expect(ctx.asset_type).toBeNull();
    expect(ctx.state).toBeNull();
  });
});

describe("isSignalRelevant", () => {
  it("returns true when no filters conflict", () => {
    expect(isSignalRelevant({}, {})).toBe(true);
  });

  it("returns true when signal has no context", () => {
    expect(
      isSignalRelevant({}, { asset_type: "multifamily", state: "Florida" })
    ).toBe(true);
  });

  it("filters by matching asset type", () => {
    expect(
      isSignalRelevant(
        { asset_type: "multifamily" },
        { asset_type: "multifamily" }
      )
    ).toBe(true);
  });

  it("rejects mismatched asset type", () => {
    expect(
      isSignalRelevant(
        { asset_type: "multifamily" },
        { asset_type: "office" }
      )
    ).toBe(false);
  });

  it("filters by matching state", () => {
    expect(
      isSignalRelevant(
        { state: "florida" },
        { state: "florida" }
      )
    ).toBe(true);
  });

  it("rejects mismatched state", () => {
    expect(
      isSignalRelevant(
        { state: "florida" },
        { state: "texas" }
      )
    ).toBe(false);
  });

  it("allows partial state match (market within state)", () => {
    expect(
      isSignalRelevant(
        { state: "phoenix, az" },
        { market: "phoenix" }
      )
    ).toBe(true);
  });

  it("uses market as fallback for deal state", () => {
    expect(
      isSignalRelevant(
        { state: "austin" },
        { market: "austin" }
      )
    ).toBe(true);
  });
});

describe("runOverlay (integration with mocked Supabase)", () => {
  // We import runOverlay lazily to avoid module-level Supabase issues
  it("exits early when no signals found", async () => {
    const { runOverlay } = await import("./crossReferenceOverlay");

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "signals") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Should not throw
    await runOverlay(supabase, "scan-1", "user-1");
  });

  it("exits early when no risks found", async () => {
    const { runOverlay } = await import("./crossReferenceOverlay");

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "signals") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ id: "s1", signal_type: "Credit Tightening", what_changed: "Rates up" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "deal_risks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await runOverlay(supabase, "scan-1", "user-1");
  });
});
