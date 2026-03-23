"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "cre_changelog_seen_id";

export default function ChangelogBanner({
  entry,
}: {
  entry: { id: string; title: string; published_at: string } | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!entry) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== entry.id) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [entry]);

  if (!entry || !visible) return null;

  function dismiss() {
    if (!entry) return;
    try {
      localStorage.setItem(STORAGE_KEY, entry.id);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[150] mx-auto flex max-w-lg flex-col gap-2 rounded-lg border border-white/15 bg-zinc-950/95 p-3 text-sm text-zinc-100 shadow-lg backdrop-blur sm:left-auto sm:right-6 sm:flex-row sm:items-center sm:gap-4"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Update</span>
        <p className="m-0 mt-0.5 font-medium text-zinc-100">
          <Link href="/changelog" className="text-blue-400 underline-offset-2 hover:underline">
            {entry.title}
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          href="/changelog"
          className={cn(buttonVariants({ variant: "outline", size: "xs" }), "border-white/20 text-center")}
        >
          Read
        </Link>
        <Button type="button" variant="ghost" size="xs" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
