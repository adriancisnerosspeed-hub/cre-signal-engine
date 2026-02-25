import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AcceptInviteClient from "./AcceptInviteClient";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!token?.trim()) {
    return (
      <main style={{ maxWidth: 400, margin: "0 auto", padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: "#fafafa" }}>Invalid invite link</h1>
        <p style={{ color: "#a1a1aa", marginTop: 8 }}>
          <Link href="/app" style={{ color: "#3b82f6" }}>Go to app</Link>
        </p>
      </main>
    );
  }

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`
    );
  }

  return (
    <main style={{ maxWidth: 400, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, color: "#fafafa", marginBottom: 16 }}>
        Accept workspace invite
      </h1>
      <AcceptInviteClient token={token} userEmail={user.email ?? ""} />
    </main>
  );
}
