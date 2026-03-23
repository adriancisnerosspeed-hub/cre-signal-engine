-- Testimonials: public read (active rows); platform_admin full write.

CREATE TABLE testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_type TEXT,
  persona TEXT,
  quote TEXT NOT NULL,
  attribution TEXT,
  deal_context TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_testimonials_active_sort ON testimonials(active, sort_order);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "testimonials_public_read_active"
  ON testimonials FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "testimonials_platform_admin_select_all"
  ON testimonials FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "testimonials_insert_platform_admin"
  ON testimonials FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "testimonials_update_platform_admin"
  ON testimonials FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "testimonials_delete_platform_admin"
  ON testimonials FOR DELETE TO authenticated
  USING (public.is_platform_admin());

COMMENT ON TABLE testimonials IS 'Marketing testimonials; public reads active rows only.';
