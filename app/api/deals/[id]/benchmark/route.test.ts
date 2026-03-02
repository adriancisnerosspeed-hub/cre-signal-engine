/**
 * Deal benchmark API: snapshot_id required; deterministic error codes.
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

vi.mock("@/lib/org", () => ({
  getCurrentOrgId: () => Promise.resolve("org-1"),
}));

vi.mock("@/lib/entitlements/errors", () => ({
  ENTITLEMENT_ERROR_CODES: {
    PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
    FEATURE_NOT_AVAILABLE: "FEATURE_NOT_AVAILABLE",
    ENTERPRISE_REQUIRED: "ENTERPRISE_REQUIRED",
    PORTFOLIO_LIMIT_REACHED: "PORTFOLIO_LIMIT_REACHED",
    POLICY_LIMIT_REACHED: "POLICY_LIMIT_REACHED",
    BILLING_REQUIRED: "BILLING_REQUIRED",
  },
}));

const mockEntitlements = {
  plan: "PRO" as const,
  entitlements: {
    canUseBenchmark: true,
    maxLifetimeScans: null,
    maxPortfolios: 3,
    canBuildSnapshot: false,
    canCreateCohort: false,
    canUsePolicy: true,
    canUseSupportBundle: true,
    canInviteMembers: false,
    maxActivePoliciesPerOrg: 1,
  },
};
vi.mock("@/lib/entitlements/workspace", () => ({
  getWorkspacePlanAndEntitlements: vi.fn(() => Promise.resolve(mockEntitlements)),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "deals") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "deal-1", organization_id: "org-1" },
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "benchmark_cohort_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "snap-1",
                    cohort_id: "c1",
                    as_of_timestamp: "2025-01-01T00:00:00Z",
                    method_version: "midrank_v1",
                    build_status: "FAILED",
                  },
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/benchmark/constants", () => ({
  BENCHMARK_ERROR_CODES: {
    COHORT_NOT_FOUND: "COHORT_NOT_FOUND",
    SNAPSHOT_NOT_FOUND: "SNAPSHOT_NOT_FOUND",
    SNAPSHOT_NOT_READY: "SNAPSHOT_NOT_READY",
    INSUFFICIENT_COHORT_N: "INSUFFICIENT_COHORT_N",
    METRIC_NOT_SUPPORTED: "METRIC_NOT_SUPPORTED",
    VALUE_MISSING_FOR_DEAL: "VALUE_MISSING_FOR_DEAL",
  },
}));

vi.mock("@/lib/benchmark/compute", () => ({
  getOrComputeDealBenchmark: () => Promise.resolve(null),
}));

describe("GET /api/deals/[id]/benchmark", () => {
  it("returns 400 with SNAPSHOT_REQUIRED when snapshot_id is missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/deals/deal-1/benchmark"),
      { params: Promise.resolve({ id: "deal-1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("SNAPSHOT_REQUIRED");
  });

  it("returns 400 with SNAPSHOT_NOT_READY when snapshot build_status is not SUCCESS", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/deals/deal-1/benchmark?snapshot_id=snap-1"),
      { params: Promise.resolve({ id: "deal-1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("SNAPSHOT_NOT_READY");
  });

  it("returns 403 FEATURE_NOT_AVAILABLE when workspace plan does not allow benchmark", async () => {
    const { getWorkspacePlanAndEntitlements } = await import("@/lib/entitlements/workspace");
    (getWorkspacePlanAndEntitlements as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      plan: "FREE",
      entitlements: {
        canUseBenchmark: false,
        maxLifetimeScans: 3,
        maxPortfolios: 1,
        canBuildSnapshot: false,
        canCreateCohort: false,
        canUsePolicy: false,
        canUseSupportBundle: false,
        canInviteMembers: false,
        maxActivePoliciesPerOrg: 0,
      },
    });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/deals/deal-1/benchmark?snapshot_id=snap-1"),
      { params: Promise.resolve({ id: "deal-1" }) }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FEATURE_NOT_AVAILABLE");
    expect(body.required_plan).toBe("PRO");
  });
});
