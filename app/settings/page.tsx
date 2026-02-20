import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "../app/SignOutButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Settings</h1>
        <SignOutButton />
      </div>

      <div style={{ marginBottom: 16 }}>
        <p style={{ color: "#666" }}>
          Signed in as <strong>{user.email}</strong>
        </p>
      </div>

      <div style={{ padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
        <p style={{ color: "#666" }}>Settings page coming soon.</p>
      </div>
    </main>
  );
}
