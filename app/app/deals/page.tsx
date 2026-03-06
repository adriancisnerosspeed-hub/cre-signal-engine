import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import UsageBanner from "../UsageBanner";

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
      <main className="max-w-[800px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
        <h1 className="text-[28px] font-bold text-gray-900 dark:text-white">Deals</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
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
    <main className="max-w-[800px] mx-auto p-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <UsageBanner />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 dark:text-white">Deals</h1>
        <Link
          href="/app/deals/new"
          className="py-2.5 px-5 bg-gray-900 dark:bg-white text-white dark:text-black no-underline rounded-md font-semibold text-sm"
        >
          New deal
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No deals yet.{" "}
          <Link href="/app/deals/new" style={{ color: "#3b82f6" }}>
            Create your first deal
          </Link>
        </p>
      ) : (
        <ul className="list-none p-0 m-0">
          {list.map((deal) => (
            <li
              key={deal.id}
              className="py-4 px-5 border border-gray-200 dark:border-white/10 rounded-lg mb-3 bg-gray-50 dark:bg-white/[0.03]"
            >
              <Link
                href={`/app/deals/${deal.id}`}
                className="text-gray-900 dark:text-white no-underline font-semibold text-base"
              >
                {deal.name}
              </Link>
              {(deal.asset_type || deal.market) && (
                <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
                  {[deal.asset_type, deal.market].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                {new Date(deal.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
