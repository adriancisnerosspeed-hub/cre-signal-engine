/**
 * Process email_outbox: claim eligible rows, send via Resend, update status and invite sent_at.
 * No raw token in DB: processor generates token per send and updates invite token_hash.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { sendWorkspaceInviteEmail } from "@/lib/email";

const RPC_NAME = "get_and_claim_outbox_rows";
const DEFAULT_MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  type: string;
  recipient: string;
  payload_json: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
};

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function nextAttemptAt(attemptCount: number): string {
  const minutes = Math.min(15 * Math.pow(2, attemptCount), 1440);
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export interface ProcessOutboxResult {
  processed: number;
  sent: number;
  failed: number;
}

export async function processOutbox(
  service: SupabaseClient,
  limit: number
): Promise<ProcessOutboxResult> {
  const { data: rows, error: rpcError } = await service.rpc(RPC_NAME, { lim: limit });
  if (rpcError) {
    throw new Error(`outbox claim failed: ${rpcError.message}`);
  }
  const list = (rows ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of list) {
    if (row.type === "ORG_INVITE") {
      const payload = row.payload_json as {
        invite_id?: string;
        organization_id?: string;
        org_name?: string;
        inviter_name?: string;
      };
      const inviteId = payload.invite_id;
      const orgName = payload.org_name ?? "";
      const inviterName = payload.inviter_name ?? "A team member";

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      if (inviteId) {
        await service
          .from("organization_invites")
          .update({ token_hash: tokenHash })
          .eq("id", inviteId);
      }
      const inviteLink = `${getBaseUrl()}/invite/accept?token=${rawToken}`;

      const result = await sendWorkspaceInviteEmail({
        to: row.recipient,
        orgName,
        inviterName,
        inviteLink,
      });

      const maxAttempts = row.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
      const newAttemptCount = row.attempt_count + 1;

      if (result.success) {
        await service.from("email_outbox").update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        if (inviteId) {
          await service
            .from("organization_invites")
            .update({ sent_at: new Date().toISOString(), status: "sent" })
            .eq("id", inviteId);
        }
        sent++;
      } else {
        await service
          .from("email_outbox")
          .update({
            status: "FAILED",
            attempt_count: newAttemptCount,
            last_error: result.error ?? "Unknown error",
            next_attempt_at: newAttemptCount < maxAttempts ? nextAttemptAt(newAttemptCount) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failed++;
      }
    } else {
      const newAttemptCount = row.attempt_count + 1;
      const maxAttempts = row.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
      await service
        .from("email_outbox")
        .update({
          status: "FAILED",
          attempt_count: newAttemptCount,
          last_error: `Unknown type: ${row.type}`,
          next_attempt_at: newAttemptCount < maxAttempts ? nextAttemptAt(newAttemptCount) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { processed: list.length, sent, failed };
}
