import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";

const isDev = process.env.NODE_ENV === "development";

function logOrgDebug(
  message: string,
  ctx: { userId: string; current_org_id: string | null; membershipCount?: number; error?: unknown }
) {
  if (!isDev) return;
  console.log("[org]", message, {
    userId: ctx.userId,
    current_org_id: ctx.current_org_id,
    ...(ctx.membershipCount !== undefined && { membershipCount: ctx.membershipCount }),
    ...(ctx.error !== undefined && { error: ctx.error }),
  });
}

/**
 * Server-only. Returns the current org id for the user, with self-healing:
 * 1. Read profiles.current_org_id → if set, return it.
 * 2. If null → query organization_members for user (first org).
 * 3. If membership exists → set profiles.current_org_id to that org and return it.
 * 4. If no membership → ensureDefaultOrganization() then re-read and return.
 * Pass the full User so we can call ensureDefaultOrganization when needed.
 */
export async function getCurrentOrgId(
  supabase: SupabaseClient,
  user: User
): Promise<string | null> {
  const userId = user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    logOrgDebug("getCurrentOrgId: profile read failed", {
      userId,
      current_org_id: null,
      error: profileError,
    });
    return null;
  }

  const currentOrgId = profile?.current_org_id ?? null;
  if (currentOrgId) {
    logOrgDebug("getCurrentOrgId: using profile.current_org_id", {
      userId,
      current_org_id: currentOrgId,
    });
    return currentOrgId;
  }

  const { data: memberships, error: membersError } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("org_id", { ascending: true })
    .limit(1);

  const membershipCount = memberships?.length ?? 0;
  if (membersError) {
    logOrgDebug("getCurrentOrgId: memberships query failed", {
      userId,
      current_org_id: null,
      membershipCount: 0,
      error: membersError,
    });
    return null;
  }

  if (memberships && memberships.length > 0) {
    const firstOrgId = memberships[0].org_id;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ current_org_id: firstOrgId })
      .eq("id", userId);

    if (updateError) {
      logOrgDebug("getCurrentOrgId: failed to set profile.current_org_id from membership", {
        userId,
        current_org_id: null,
        membershipCount,
        error: updateError,
      });
      return firstOrgId;
    }
    logOrgDebug("getCurrentOrgId: self-healed from first membership", {
      userId,
      current_org_id: firstOrgId,
      membershipCount,
    });
    return firstOrgId;
  }

  try {
    const service = createServiceRoleClient();
    await ensureDefaultOrganization(service, user);
  } catch (err) {
    logOrgDebug("getCurrentOrgId: ensureDefaultOrganization failed", {
      userId,
      current_org_id: null,
      membershipCount: 0,
      error: err,
    });
    return null;
  }

  const { data: profileAfter } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", userId)
    .maybeSingle();

  const resolved = profileAfter?.current_org_id ?? null;
  logOrgDebug("getCurrentOrgId: after ensureDefaultOrganization", {
    userId,
    current_org_id: resolved,
  });
  return resolved;
}

/**
 * Server-only. Returns the current org { id, name } for the user (with self-heal via getCurrentOrgId).
 */
export async function getCurrentOrg(
  supabase: SupabaseClient,
  user: User
): Promise<{ id: string; name: string } | null> {
  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) return null;
  const { data } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name };
}

/**
 * Server-only. Ensures the user has at least one organization and profile.current_org_id is set.
 * Case A: zero memberships → create org, add member, set profile.current_org_id.
 * Case B: has memberships but profile.current_org_id is null → set profile to first org.
 * Use with service role client so RLS does not block.
 */
export async function ensureDefaultOrganization(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("org_id", { ascending: true });

  const hasMemberships = memberships && memberships.length > 0;
  const firstOrgId = hasMemberships ? memberships[0].org_id : null;

  if (firstOrgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.current_org_id) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ current_org_id: firstOrgId })
        .eq("id", user.id);

      if (profileError) {
        console.error("ensureDefaultOrganization: failed to set current_org_id (Case B):", profileError);
        throw profileError;
      }
    }
    return;
  }

  const orgName =
    (user.user_metadata?.full_name as string) ||
    user.email ||
    "My workspace";

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: orgName.slice(0, 255),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    console.error("Failed to create default organization:", orgError);
    throw orgError ?? new Error("Failed to create default organization");
  }

  const { error: memberError } = await supabase.from("organization_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    console.error("Failed to add user as org owner:", memberError);
    throw memberError;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ current_org_id: org.id })
    .eq("id", user.id);

  if (profileError) {
    console.error("Failed to set profiles.current_org_id:", profileError);
    throw profileError;
  }
}
