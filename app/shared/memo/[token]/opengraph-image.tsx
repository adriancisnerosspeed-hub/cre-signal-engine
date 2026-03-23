import { ImageResponse } from "next/og";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const alt = "Shared IC Memo | CRE Signal Engine";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const runtime = "nodejs";

export default async function SharedMemoOpenGraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const service = createServiceRoleClient();

  const { data: link } = await service
    .from("memo_share_links")
    .select("scan_id, password_hash")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  let headline = "Shared IC Memo";
  if (link && !(link as { password_hash?: string | null }).password_hash) {
    const { data: scan } = await service
      .from("deal_scans")
      .select("deals!inner(name)")
      .eq("id", (link as { scan_id: string }).scan_id)
      .single();
    const dealName = (scan as { deals: { name: string } } | null)?.deals?.name;
    if (dealName) headline = `${dealName}`;
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#94a3b8",
            marginBottom: 16,
          }}
        >
          CRE Signal Engine
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#f8fafc",
            lineHeight: 1.15,
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 26,
            fontWeight: 500,
            color: "#cbd5e1",
          }}
        >
          Investment committee memo preview
        </div>
      </div>
    ),
    { ...size }
  );
}
