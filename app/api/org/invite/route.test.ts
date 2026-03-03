/**
 * Workspace invite: token hashed, outbox row created, no inline email send, ENTERPRISE gating.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInviteInsert = vi.fn();
const mockOutboxInsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-1", email: "owner@test.com" } },
        }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "org-1", name: "Test Org" },
            }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "organization_invites") {
        return {
          insert: (payload: Record<string, unknown>) => {
            mockInviteInsert(payload);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "invite-1" },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === "email_outbox") {
        return {
          insert: (payload: Record<string, unknown>) => {
            mockOutboxInsert(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { full_name: "Test Inviter" } }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/auth", () => ({
  ensureProfile: () => Promise.resolve(),
}));

vi.mock("@/lib/org", () => ({
  getCurrentOrgId: () => Promise.resolve("org-1"),
}));

vi.mock("@/lib/entitlements/errors", () => ({
  ENTITLEMENT_ERROR_CODES: {
    ENTERPRISE_REQUIRED: "ENTERPRISE_REQUIRED",
    FEATURE_NOT_AVAILABLE: "FEATURE_NOT_AVAILABLE",
  },
}));

vi.mock("@/lib/entitlements/workspace", () => ({
  getWorkspacePlanAndEntitlementsForUser: vi.fn(() =>
    Promise.resolve({
      plan: "ENTERPRISE",
      entitlements: { canInviteMembers: true },
    })
  ),
}));

describe("POST /api/org/invite", () => {
  it("returns 403 ENTERPRISE_REQUIRED when canInviteMembers is false", async () => {
    const workspace = await import("@/lib/entitlements/workspace");
    vi.mocked(workspace.getWorkspacePlanAndEntitlementsForUser).mockImplementationOnce(() =>
      Promise.resolve({
        plan: "PRO",
        entitlements: {
          maxLifetimeScans: null,
          maxPortfolios: 3,
          canUseBenchmark: true,
          canBuildSnapshot: false,
          canCreateCohort: false,
          canUsePolicy: true,
          canUseSupportBundle: true,
          canInviteMembers: false,
          maxActivePoliciesPerOrg: 1,
        },
      })
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invited@test.com", role: "member" }),
      })
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("FEATURE_NOT_AVAILABLE");
    expect(data.required_plan).toBe("PRO");
    expect(mockInviteInsert).not.toHaveBeenCalled();
    expect(mockOutboxInsert).not.toHaveBeenCalled();
  });

  it("stores token_hash and does not store raw token in insert payload", async () => {
    mockInviteInsert.mockClear();
    mockOutboxInsert.mockClear();

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invited@test.com", role: "member" }),
      })
    );

    expect(res.status).toBe(200);
    const payload = mockInviteInsert.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty("token_hash");
    expect(typeof payload.token_hash).toBe("string");
    expect(payload.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload).not.toHaveProperty("token");
  });

  it("inserts email_outbox row with ORG_INVITE, dedupe_key and QUEUED status", async () => {
    mockInviteInsert.mockClear();
    mockOutboxInsert.mockClear();

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invited@test.com", role: "member" }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockOutboxInsert).toHaveBeenCalledTimes(1);
    const outboxPayload = mockOutboxInsert.mock.calls[0]?.[0];
    expect(outboxPayload).toMatchObject({
      type: "ORG_INVITE",
      recipient: "invited@test.com",
      dedupe_key: "org_invite:invite-1:v1",
      status: "QUEUED",
    });
    expect(outboxPayload.payload_json).toMatchObject({
      invite_id: "invite-1",
      organization_id: "org-1",
      org_name: "Test Org",
      inviter_name: "Test Inviter",
    });
    expect(outboxPayload.payload_json).not.toHaveProperty("raw_token");

    const data = await res.json();
    expect(data.invite_id).toBe("invite-1");
    expect(data.email_queued).toBe(true);
  });
});
