"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        padding: "8px 16px",
        fontSize: 14,
        backgroundColor: "#fff",
        color: "#000",
        border: "1px solid #ddd",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      Sign Out
    </button>
  );
}
