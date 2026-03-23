import { createClient } from "@/lib/supabase/server";
import ChangelogBanner from "@/app/components/ChangelogBanner";

export default async function AppSectionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("changelog_entries")
    .select("id, title, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const entry = latest as { id: string; title: string; published_at: string } | null;

  return (
    <>
      {children}
      <ChangelogBanner entry={entry} />
    </>
  );
}
