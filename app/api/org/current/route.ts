import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getCurrentOrg(supabase, user);
  return NextResponse.json(org ?? { id: null, name: null });
}
