import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsageBanner from "../UsageBanner";
import DealsListClient from "./DealsListClient";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  created_at: string;
};

export default async function DealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return (
      <main className="max-w-[800px] mx-auto p-6 bg-background text-foreground">
        <h1 className="text-[28px] font-bold text-foreground">Deals</h1>
        <p className="text-muted-foreground mt-2">
          No workspace selected. Please sign in again or contact support.
        </p>
      </main>
    );
  }

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, name, asset_type, market, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    const errMsg = error?.message ?? String(error);
    const errCode = (error as { code?: string })?.code;
    console.error("Error fetching deals:", errMsg, errCode ? { code: errCode } : "");
  }

  const list = (deals ?? []) as Deal[];

  return (
    <main className="max-w-[800px] mx-auto p-6 bg-background text-foreground">
      <UsageBanner />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[28px] font-bold text-foreground">Deals</h1>
        <Link
          href="/app/deals/new"
          className="py-2.5 px-5 bg-gray-900 dark:bg-white text-white dark:text-black no-underline rounded-md font-semibold text-sm"
        >
          New deal
        </Link>
      </div>

      <DealsListClient deals={list} />
    </main>
  );
}
