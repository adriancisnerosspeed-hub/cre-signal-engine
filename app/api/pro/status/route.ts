import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canUseProFeature } from "@/lib/auth";

export const runtime = "nodejs";

/** Pro-only route: owner and pro can access; free returns 403. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  const role = await getCurrentUserRole();
  if (!canUseProFeature(role)) {
    return Response.json(
      { error: "Forbidden", message: "Pro subscription required" },
      { status: 403 }
    );
  }

  return Response.json({ pro: true, role });
}
