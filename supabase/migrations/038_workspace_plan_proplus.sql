-- Phase 1: Add PRO+ to organizations.plan. Existing PRO/ENTERPRISE unchanged until Stripe sends PRO+.

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('FREE', 'PRO', 'PRO+', 'ENTERPRISE'));

COMMENT ON COLUMN organizations.plan IS 'Workspace plan: FREE, PRO, PRO+, ENTERPRISE. Drives entitlements (scans, members, policies, export, etc.).';
