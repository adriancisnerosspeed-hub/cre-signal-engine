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
    <main className="max-w-[480px] mx-auto py-16 px-6 bg-background text-foreground min-h-[60vh]">
      <Link href="/" className="text-[13px] text-muted-foreground font-semibold no-underline">
        CRE Signal Engine
      </Link>
      <h1 className="text-[22px] font-bold text-foreground mt-6 mb-2">Password required</h1>
      <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
        This shared memo is protected. Enter the password you were given to view the IC memo.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/50 text-foreground text-sm"
          placeholder="Password"
          autoComplete="off"
          required
        />
        {error && <p className="text-sm text-destructive m-0">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="py-2.5 px-4 rounded-lg text-white text-sm font-semibold border-0 cursor-pointer disabled:opacity-60 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          {loading ? "Unlocking…" : "View memo"}
        </button>
      </form>
    </main>
  );
}
