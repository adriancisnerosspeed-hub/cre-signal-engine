/**
 * Email process cron: requires CRON_SECRET; calls processOutbox and returns counts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockProcessOutbox = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/processOutbox", () => ({
  processOutbox: (...args: unknown[]) => mockProcessOutbox(...args),
}));

describe("GET /api/cron/email/process", () => {
  const CRON_SECRET = "test-cron-secret";
  const orig = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    mockProcessOutbox.mockResolvedValue({ processed: 0, sent: 0, failed: 0 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = orig;
  });

  it("returns 401 without CRON_SECRET", async () => {
    process.env.CRON_SECRET = "";
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/cron/email/process"));
    expect(res.status).toBe(401);
    expect(mockProcessOutbox).not.toHaveBeenCalled();
  });

  it("returns 200 with counts when authorized", async () => {
    mockProcessOutbox.mockResolvedValueOnce({ processed: 2, sent: 2, failed: 0 });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/cron/email/process", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processed: 2, sent: 2, failed: 0 });
    expect(mockProcessOutbox).toHaveBeenCalledTimes(1);
  });
});
