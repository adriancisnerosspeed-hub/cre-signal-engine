-- Changelog: public read; platform_admin write.

CREATE TABLE changelog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_changelog_entries_published_at ON changelog_entries(published_at DESC NULLS LAST);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelog_entries_public_read"
  ON changelog_entries FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "changelog_entries_insert_platform_admin"
  ON changelog_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "changelog_entries_update_platform_admin"
  ON changelog_entries FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "changelog_entries_delete_platform_admin"
  ON changelog_entries FOR DELETE TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE changelog_entries IS 'Product changelog; public read, platform_admin writes.';
