/**
 * Legacy percentile route: must return 410 GONE with LEGACY_ROUTE_DEPRECATED.
 * No percentile may be returned without snapshot_id (governance).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-1" } },
        }),
    },
  }),
}));

describe("GET /api/deals/scans/[scanId]/percentile (legacy)", () => {
  it("returns 410 GONE with LEGACY_ROUTE_DEPRECATED", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/deals/scans/scan-1/percentile"),
      { params: Promise.resolve({ scanId: "scan-1" }) }
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe("LEGACY_ROUTE_DEPRECATED");
    expect(body.migration).toContain("snapshot_id");
  });
});
