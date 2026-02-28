import { createClient } from "@/lib/supabase/server";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { RISK_INDEX_VERSION } from "@/lib/riskIndex";
import { buildMethodologyPdf } from "@/lib/methodology/buildMethodologyPdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const entitlements = await getEntitlementsForUser(supabase, user.id);
    if (!entitlements.scan_export_enabled) {
      return NextResponse.json(
        { code: "PRO_REQUIRED_FOR_EXPORT" },
        { status: 403 }
      );
    }

    const generatedAt = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    const pdfBytes = await buildMethodologyPdf({
      version: RISK_INDEX_VERSION,
      generatedAt,
    });

    const filename = `cre-signal-risk-index-methodology-v${RISK_INDEX_VERSION}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[methodology/export-pdf] error", { error: message });
    return NextResponse.json(
      { error: "Export failed", detail: message },
      { status: 500 }
    );
  }
}
