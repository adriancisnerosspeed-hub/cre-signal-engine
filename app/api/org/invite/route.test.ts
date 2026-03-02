/**
 * Workspace invite: assert token is stored hashed and email send is called with correct params.
 */
import { describe, it, expect, vi } from "vitest";

const mockInsert = vi.fn();
const mockSendWorkspaceInvite = vi.fn();

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
            mockInsert(payload);
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

vi.mock("@/lib/entitlements", () => ({
  getEntitlementsForUser: () =>
    Promise.resolve({
      workspace_invites_enabled: true,
    }),
}));

vi.mock("@/lib/email/sendWorkspaceInvite", () => ({
  sendWorkspaceInvite: (params: { to: string; orgName: string; inviterName: string; inviteLink: string }) => {
    mockSendWorkspaceInvite(params);
    return Promise.resolve({ success: true });
  },
}));

describe("POST /api/org/invite", () => {
  it("stores token_hash and does not store raw token in insert payload", async () => {
    mockInsert.mockClear();
    mockSendWorkspaceInvite.mockClear();

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invited@test.com", role: "member" }),
      })
    );

    expect(res.status).toBe(200);
    const payload = mockInsert.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty("token_hash");
    expect(typeof payload.token_hash).toBe("string");
    expect(payload.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload).not.toHaveProperty("token");
  });

  it("calls sendWorkspaceInvite with orgName, inviterName, and inviteLink containing raw token", async () => {
    mockInsert.mockClear();
    mockSendWorkspaceInvite.mockClear();

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invited@test.com", role: "member" }),
      })
    );

    expect(mockSendWorkspaceInvite).toHaveBeenCalledTimes(1);
    const params = mockSendWorkspaceInvite.mock.calls[0]?.[0];
    expect(params?.to).toBe("invited@test.com");
    expect(params?.orgName).toBe("Test Org");
    expect(params?.inviterName).toBe("Test Inviter");
    expect(params?.inviteLink).toMatch(/\/invite\/accept\?token=[a-f0-9]{64}$/);
  });
});
