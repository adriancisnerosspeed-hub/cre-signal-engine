"use client";

import { useRouter } from "next/navigation";

export default function RefreshPageButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="py-1.5 px-3 text-[13px] font-semibold border-0 rounded-md cursor-pointer hover:opacity-90 transition-opacity"
      style={{ color: "#18181b", backgroundColor: "var(--band-moderate)" }}
    >
      Refresh
    </button>
  );
}
