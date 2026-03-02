/**
 * processOutbox: ORG_INVITE send success updates outbox + invite; failure sets FAILED and last_error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processOutbox } from "./processOutbox";

const mockRpc = vi.fn();
const mockOutboxUpdate = vi.fn();
const mockInviteUpdate = vi.fn();
const mockSendWorkspaceInviteEmail = vi.fn();

vi.mock("@/lib/email", () => ({
  sendWorkspaceInviteEmail: (params: unknown) => mockSendWorkspaceInviteEmail(params),
}));

function makeServiceMock(rows: Array<{ id: string; type: string; recipient: string; payload_json: Record<string, unknown>; attempt_count: number }>) {
  return {
    rpc: (name: string, args: { lim: number }) => {
      mockRpc(name, args);
      return Promise.resolve({ data: rows, error: null });
    },
    from: (table: string) => {
      if (table === "email_outbox") {
        return {
          update: (payload: Record<string, unknown>) => {
            mockOutboxUpdate(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === "organization_invites") {
        return {
          update: (payload: Record<string, unknown>) => {
            mockInviteUpdate(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    },
  } as never;
}

describe("processOutbox", () => {
  beforeEach(() => {
    mockRpc.mockClear();
    mockOutboxUpdate.mockClear();
    mockInviteUpdate.mockClear();
    mockSendWorkspaceInviteEmail.mockClear();
  });

  it("sends ORG_INVITE email and updates outbox to SENT and invite sent_at/status", async () => {
    mockSendWorkspaceInviteEmail.mockResolvedValue({ success: true });

    const row = {
      id: "outbox-1",
      type: "ORG_INVITE",
      recipient: "user@example.com",
      payload_json: {
        invite_id: "invite-1",
        organization_id: "org-1",
        org_name: "Test Org",
        inviter_name: "Admin",
        raw_token: "abc123",
      },
      attempt_count: 0,
    };
    const service = makeServiceMock([row]);

    const result = await processOutbox(service, 10);

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mockRpc).toHaveBeenCalledWith("get_and_claim_outbox_rows", { lim: 10 });
    expect(mockSendWorkspaceInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        orgName: "Test Org",
        inviterName: "Admin",
        inviteLink: expect.stringContaining("token=abc123"),
      })
    );
    expect(mockOutboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SENT",
        sent_at: expect.any(String),
      })
    );
    expect(mockInviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        sent_at: expect.any(String),
      })
    );
  });

  it("on send failure marks outbox FAILED and sets last_error", async () => {
    mockSendWorkspaceInviteEmail.mockResolvedValue({ success: false, error: "Resend rate limit" });

    const row = {
      id: "outbox-2",
      type: "ORG_INVITE",
      recipient: "user@example.com",
      payload_json: {
        invite_id: "invite-2",
        organization_id: "org-1",
        org_name: "Test",
        inviter_name: "Admin",
        raw_token: "xyz",
      },
      attempt_count: 0,
    };
    const service = makeServiceMock([row]);

    const result = await processOutbox(service, 10);

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mockOutboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        attempt_count: 1,
        last_error: "Resend rate limit",
      })
    );
    expect(mockInviteUpdate).not.toHaveBeenCalled();
  });
});
