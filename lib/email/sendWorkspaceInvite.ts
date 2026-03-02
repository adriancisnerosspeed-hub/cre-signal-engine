/**
 * Workspace invite email: sends "You've been invited to CRE Signal Workspace"
 * with workspace name, inviter name, and accept link. Uses Resend.
 */
import { sendWorkspaceInviteEmail } from "../email";

export type SendWorkspaceInviteParams = {
  to: string;
  orgName: string;
  inviterName: string;
  inviteLink: string;
};

export async function sendWorkspaceInvite(
  params: SendWorkspaceInviteParams
): Promise<{ success: boolean; error?: string }> {
  return sendWorkspaceInviteEmail(params);
}
