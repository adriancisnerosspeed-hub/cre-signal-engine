/**
 * Workspace-level roles (organization_members.role). Do not mix with platform roles (profiles.role).
 * Enforcement: use these constants and types everywhere we check or set workspace role.
 */

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(s: string): s is WorkspaceRole {
  return WORKSPACE_ROLES.includes(s as WorkspaceRole);
}

/** True if role can manage members, invites, and org settings (OWNER or ADMIN). */
export function canManageWorkspace(role: string | undefined | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}
