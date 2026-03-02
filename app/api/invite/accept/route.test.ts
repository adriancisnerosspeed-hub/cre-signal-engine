/**
 * Accept invite: token_hash lookup, idempotent when already accepted, expired returns EXPIRED_INVITE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

const rawToken = "a".repeat(64);
const tokenHash = hashToken(rawToken);
const futureExpiry = new Date(Date.now() + 86400000).toISOString();
const pastExpiry = new Date(Date.now() - 86400000).toISOString();

const mockInvitePending = {
  id: "invite-1",
  org_id: "org-1",
  email: "invited@test.com",
  role: "member",
  status: "pending",
  expires_at: futureExpiry,
};

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();

function makeServiceMock(overrides: { invite?: Record<string, unknown> } = {}) {
  const invite = (overrides.invite ?? mockInvitePending) as {
    id: string;
    org_id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
  };
  return {
    from: (table: string) => {
      if (table === "organization_invites") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => ({
              in: (col2: string, vals: unknown[]) => ({
                gt: (col3: string, val3: unknown) => ({
                  maybeSingle: () => {
                    selectMock(col, val, "acceptable");
                    const ok =
                      (col === "token_hash" && val === tokenHash) || (col === "token" && val === rawToken);
                    if (
                      ok &&
                      col2 === "status" &&
                      col3 === "expires_at" &&
                      (invite.status === "pending" || invite.status === "sent") &&
                      invite.expires_at > (val3 as string)
                    ) {
                      return Promise.resolve({ data: invite, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                }),
              }),
              maybeSingle: () => {
                selectMock(col, val, "any");
                if (col === "token_hash" && val === tokenHash) {
                  return Promise.resolve({ data: invite, error: null });
                }
                if (col === "token" && val === rawToken) {
                  return Promise.resolve({ data: invite, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updateMock(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === "organization_members") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertMock(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "user-1", email: "invited@test.com" } },
        }),
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: vi.fn(),
}));

describe("POST /api/invite/accept", () => {
  beforeEach(async () => {
    const service = await import("@/lib/supabase/service");
    vi.mocked(service.createServiceRoleClient).mockImplementation(() => makeServiceMock() as never);
    selectMock.mockClear();
    updateMock.mockClear();
    insertMock.mockClear();
  });

  it("finds invite by token_hash and returns success with org_id", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.org_id).toBe("org-1");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-1",
        user_id: "user-1",
        role: "MEMBER",
      })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
      })
    );
  });

  it("returns 404 for invalid token", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "unknown-token" }),
      })
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("INVALID_INVITE");
  });

  it("returns 410 EXPIRED_INVITE and sets status expired when invite is expired", async () => {
    const service = await import("@/lib/supabase/service");
    vi.mocked(service.createServiceRoleClient).mockImplementation(() =>
      makeServiceMock({
        invite: { ...mockInvitePending, status: "pending", expires_at: pastExpiry },
      }) as never
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      })
    );

    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.code).toBe("EXPIRED_INVITE");
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 200 without re-inserting membership when invite already accepted (idempotent)", async () => {
    const service = await import("@/lib/supabase/service");
    vi.mocked(service.createServiceRoleClient).mockImplementation(() =>
      makeServiceMock({
        invite: { ...mockInvitePending, status: "accepted" },
      }) as never
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.org_id).toBe("org-1");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 404 for revoked invite (rejected at query level, no acceptable row)", async () => {
    const service = await import("@/lib/supabase/service");
    vi.mocked(service.createServiceRoleClient).mockImplementation(() =>
      makeServiceMock({
        invite: { ...mockInvitePending, status: "revoked", expires_at: futureExpiry },
      }) as never
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      })
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("INVALID_INVITE");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
