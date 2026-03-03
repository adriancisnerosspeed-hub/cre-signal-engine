/**
 * Token-based auth for API v1 (read-only). Resolve Bearer token to organization_id.
 * Used by /api/v1/* routes only; no session.
 */

import { createHash } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";

export interface ApiTokenContext {
  organizationId: string;
  tokenId: string;
}

/**
 * Hash a raw API token for storage or lookup. Use same algorithm when creating and validating.
 */
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw.trim(), "utf8").digest("hex");
}

/**
 * Extract Bearer token from Authorization header. Returns null if missing or not Bearer.
 */
export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve request to organization_id using API token. Uses service role to look up by token_hash.
 * Updates last_used_at when a token is found. Returns null if token missing or invalid (caller returns 401).
 */
export async function getOrgFromToken(request: Request): Promise<ApiTokenContext | null> {
  const raw = getBearerToken(request);
  if (!raw) return null;

  const tokenHash = hashApiToken(raw);
  const service = createServiceRoleClient();

  const { data: row, error } = await service
    .from("api_tokens")
    .select("id, organization_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row) return null;

  const orgId = (row as { organization_id: string }).organization_id;
  const tokenId = (row as { id: string }).id;

  // Best-effort update last_used_at (do not fail request if update fails)
  service
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .then(
      () => {},
      (err) => console.warn("[apiAuth] last_used_at update failed:", err)
    );

  return { organizationId: orgId, tokenId };
}
