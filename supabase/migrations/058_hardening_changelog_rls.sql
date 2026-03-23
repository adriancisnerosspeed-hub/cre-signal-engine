-- Tighten changelog_entries public read to published rows only (drafts were previously visible).

DROP POLICY IF EXISTS "changelog_entries_public_read" ON changelog_entries;

CREATE POLICY "changelog_entries_public_read_published"
  ON changelog_entries FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL AND published_at <= now());
