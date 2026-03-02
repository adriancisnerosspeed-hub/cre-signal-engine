/**
 * Accept invite: validate token via token_hash, add member, mark invite accepted.
 */
import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

const rawToken = "a".repeat(64);
const tokenHash = hashToken(rawToken);
const mockInvite = {
  id: "invite-1",
  org_id: "org-1",
  email: "invited@test.com",
  role: "member",
};

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: { id: "user-1", email: "invited@test.com" },
          },
        }),
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "organization_invites") {
        return {
          select: (...args: unknown[]) => {
            selectMock(...args);
            return {
              eq: (col: string, val: unknown) => ({
                eq: (col2: string, val2: unknown) => ({
                  gt: () => ({
                    maybeSingle: () => {
                      if (col === "token_hash" && val === tokenHash) {
                        return Promise.resolve({ data: mockInvite, error: null });
                      }
                      return Promise.resolve({ data: null, error: null });
                    },
                  }),
                }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            updateMock(payload);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
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
  }),
}));

describe("POST /api/invite/accept", () => {
  it("finds invite by token_hash and returns success with org_id", async () => {
    selectMock.mockClear();
    updateMock.mockClear();
    insertMock.mockClear();

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
        role: "member",
      })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
      })
    );
  });

  it("returns 404 for invalid or expired token", async () => {
    selectMock.mockClear();
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "unknown-token" }),
      })
    );
    expect(res.status).toBe(404);
  });
});
