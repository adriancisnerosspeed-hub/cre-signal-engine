import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getCurrentOrgId(supabase, user);
  if (!orgId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  let body: { name?: string; asset_type?: string | null; market?: string | null; raw_text?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "Untitled deal";
  const assetType = typeof body.asset_type === "string" ? body.asset_type.trim() || null : null;
  const market = typeof body.market === "string" ? body.market.trim() || null : null;
  const rawText = typeof body.raw_text === "string" ? body.raw_text.trim() || null : null;

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: name || "Untitled deal",
      asset_type: assetType,
      market,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    console.error("Insert deal error:", dealError);
    return NextResponse.json(
      { error: dealError?.message || "Failed to create deal" },
      { status: 500 }
    );
  }

  const { error: inputError } = await supabase.from("deal_inputs").insert({
    deal_id: deal.id,
    raw_text: rawText,
  });

  if (inputError) {
    console.error("Insert deal_input error:", inputError);
    return NextResponse.json(
      { error: inputError.message || "Failed to save underwriting text" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: deal.id });
}
