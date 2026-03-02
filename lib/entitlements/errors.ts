/**
 * Standardized error codes for workspace plan enforcement.
 * All API routes return these (with optional message, required_plan) for client handling.
 */
export const ENTITLEMENT_ERROR_CODES = {
  PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
  FEATURE_NOT_AVAILABLE: "FEATURE_NOT_AVAILABLE",
  ENTERPRISE_REQUIRED: "ENTERPRISE_REQUIRED",
  PORTFOLIO_LIMIT_REACHED: "PORTFOLIO_LIMIT_REACHED",
  POLICY_LIMIT_REACHED: "POLICY_LIMIT_REACHED",
  BILLING_REQUIRED: "BILLING_REQUIRED",
} as const;

export type EntitlementErrorCode =
  (typeof ENTITLEMENT_ERROR_CODES)[keyof typeof ENTITLEMENT_ERROR_CODES];

export interface EntitlementErrorPayload {
  code: EntitlementErrorCode;
  message?: string;
  required_plan?: "PRO" | "ENTERPRISE";
}
