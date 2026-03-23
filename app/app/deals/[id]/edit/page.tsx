import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/org";
import { notFound, redirect } from "next/navigation";
import EditDealPageClient from "./EditDealPageClient";

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  await ensureProfile(supabase, user);

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    redirect("/app/deals");
  }

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, name, asset_type, market")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (dealError || !deal) notFound();

  const { data: inputs } = await supabase
    .from("deal_inputs")
    .select("raw_text")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1);

  const rawText =
    Array.isArray(inputs) && inputs.length > 0 ? (inputs[0]?.raw_text ?? "") : "";

  return (
    <EditDealPageClient
      dealId={dealId}
      initialName={deal.name ?? ""}
      initialAssetType={deal.asset_type ?? ""}
      initialMarket={deal.market ?? ""}
      initialRawText={rawText}
    />
  );
}
