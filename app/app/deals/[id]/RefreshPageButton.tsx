"use client";

import { useRouter } from "next/navigation";

export default function RefreshPageButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      style={{
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
        color: "#18181b",
        backgroundColor: "#eab308",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      Refresh
    </button>
  );
}
