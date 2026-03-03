/**
 * Server-side display plan for pricing UI. Single source of truth for mapping
 * profile + workspace plan to UI state (which section is active, which CTAs show).
 */

import type { PricingDisplayPlan } from "@/app/pricing/types";

export function getDisplayPlan(
  profilePlan: string,
  workspacePlan: string | null
): PricingDisplayPlan {
  if (profilePlan === "platform_admin") return "platform_admin";
  if (workspacePlan === "ENTERPRISE") return "enterprise";
  if (workspacePlan === "PRO+") return "pro_plus";
  if (workspacePlan === "PRO") return "pro";
  return "free";
}
