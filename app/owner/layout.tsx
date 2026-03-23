import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwner(user.email)) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
        <h1 className="text-lg font-semibold">Developer tools</h1>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
