-- Feature flags: platform_admin + service_role (RLS bypass) only for writes; admin-only reads for authenticated.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'platform_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_platform_admin() IS 'True when the current user is a platform_admin (for RLS policies).';

CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_flags_name ON feature_flags(name);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS feature_flags_updated_at ON feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE POLICY "feature_flags_select_platform_admin"
  ON feature_flags FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "feature_flags_insert_platform_admin"
  ON feature_flags FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "feature_flags_update_platform_admin"
  ON feature_flags FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "feature_flags_delete_platform_admin"
  ON feature_flags FOR DELETE TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE feature_flags IS 'Product feature toggles; managed by platform_admin or service_role.';
