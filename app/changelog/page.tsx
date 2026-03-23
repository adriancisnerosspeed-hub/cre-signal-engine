import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Product updates and release notes for CRE Signal Engine.",
  openGraph: {
    title: "Changelog — CRE Signal Engine",
    description: "Release notes and product updates.",
    url: `${getSiteUrl()}/changelog`,
  },
  alternates: {
    canonical: `${getSiteUrl()}/changelog`,
  },
};

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("changelog_entries")
    .select("id, title, body, published_at, version")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[changelog]", error);
  }

  const entries = (rows ?? []) as {
    id: string;
    title: string;
    body: string;
    published_at: string;
    version: string | null;
  }[];

  return (
    <main className="max-w-[720px] mx-auto py-10 px-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <Link href="/" className="text-[13px] text-gray-500 dark:text-zinc-500 no-underline font-semibold">
        CRE Signal Engine
      </Link>
      <h1 className="text-[28px] font-bold mt-4 mb-2">Changelog</h1>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-10 m-0">
        Notable updates to the product. Dates reflect publication time (UTC).
      </p>

      {entries.length === 0 ? (
        <p className="text-gray-500 dark:text-zinc-500 text-sm">No entries yet.</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-10">
          {entries.map((e) => {
            const d = new Date(e.published_at);
            const dateLabel = d.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            return (
              <li key={e.id} className="border-b border-gray-200 dark:border-white/10 pb-10 last:border-0 last:pb-0">
                <div className="flex flex-wrap gap-2 items-baseline mb-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 m-0">{e.title}</h2>
                  {e.version && (
                    <span className="text-xs font-mono text-gray-500 dark:text-zinc-500">v{e.version}</span>
                  )}
                </div>
                <time className="text-xs text-gray-500 dark:text-zinc-500 block mb-3" dateTime={e.published_at}>
                  {dateLabel}
                </time>
                <div className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {e.body}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
