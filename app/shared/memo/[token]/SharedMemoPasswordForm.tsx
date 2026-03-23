"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SharedMemoPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/shared/memo/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not unlock");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-[480px] mx-auto py-16 px-6 bg-white dark:bg-black text-gray-900 dark:text-white min-h-[60vh]">
      <Link href="/" className="text-[13px] text-gray-500 dark:text-zinc-500 font-semibold no-underline">
        CRE Signal Engine
      </Link>
      <h1 className="text-[22px] font-bold text-gray-900 dark:text-white mt-6 mb-2">Password required</h1>
      <p className="text-sm text-gray-500 dark:text-zinc-400 mb-8 leading-relaxed">
        This shared memo is protected. Enter the password you were given to view the IC memo.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/15 bg-zinc-50 dark:bg-zinc-900 text-gray-900 dark:text-white text-sm"
          placeholder="Password"
          autoComplete="off"
          required
        />
        {error && <p className="text-sm text-red-500 m-0">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="py-2.5 px-4 rounded-lg bg-[#3b82f6] text-white text-sm font-semibold border-0 cursor-pointer disabled:opacity-60"
        >
          {loading ? "Unlocking…" : "View memo"}
        </button>
      </form>
    </main>
  );
}
