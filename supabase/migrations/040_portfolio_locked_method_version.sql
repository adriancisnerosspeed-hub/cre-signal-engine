-- Phase 2: Snapshot version lock on portfolio view. When set, rescore with newer method is blocked unless override.

ALTER TABLE portfolio_views
  ADD COLUMN IF NOT EXISTS locked_method_version TEXT NULL;

COMMENT ON COLUMN portfolio_views.locked_method_version IS 'When set, portfolio (view context) is locked to this methodology version; rescoring with a newer model is blocked unless user overrides (audit log entry written). PRO+ and ENTERPRISE only.';
