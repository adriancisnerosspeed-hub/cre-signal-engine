import Link from "next/link";
import { renderMarkdown } from "@/lib/ui/renderMarkdown";
import { getBandCssVar } from "@/lib/brandColors";

export type SharedMemoViewProps = {
  dealName: string;
  assetType: string | null;
  market: string | null;
  scanDateLabel: string;
  riskIndexScore: number | null;
  riskIndexBand: string | null;
  narrativeContent: string | null;
};

export default function SharedMemoView({
  dealName,
  assetType,
  market,
  scanDateLabel,
  riskIndexScore,
  riskIndexBand,
  narrativeContent,
}: SharedMemoViewProps) {
  const bandColor = getBandCssVar(riskIndexBand);

  return (
    <main className="max-w-[800px] mx-auto py-10 px-6 bg-background text-foreground">
      <div className="mb-6 flex justify-between items-center">
        <Link href="/" className="no-underline">
          <span className="text-[13px] text-muted-foreground font-semibold">CRE Signal Engine</span>
        </Link>
        <span className="text-xs text-muted-foreground">Shared IC Memo</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-foreground mb-1">{dealName}</h1>
        <p className="text-sm text-muted-foreground m-0">
          {[assetType, market].filter(Boolean).join(" · ")} · Scanned {scanDateLabel}
        </p>
      </div>

      {riskIndexScore != null && (
        <div
          className="flex items-center gap-4 py-4 px-5 rounded-lg mb-7 bg-muted/50 border border-border"
          style={{ borderColor: "color-mix(in oklab, " + bandColor + " 35%, transparent)" }}
        >
          <div className="text-[42px] font-extrabold tabular-nums leading-none" style={{ color: bandColor }}>
            {riskIndexScore}
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: bandColor }}>
              {riskIndexBand}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">CRE Signal Risk Index™</div>
          </div>
        </div>
      )}

      {narrativeContent ? (
        <section className="mb-10">
          <h2 className="text-base font-semibold text-foreground mb-3.5">
            IC Memorandum Narrative
          </h2>
          <div className="py-5 px-6 border border-border rounded-lg bg-muted/30 text-sm text-foreground">
            {renderMarkdown(narrativeContent)}
          </div>
        </section>
      ) : (
        <div className="py-5 px-6 border border-border rounded-lg mb-10">
          <p className="text-muted-foreground text-sm m-0">
            IC memo narrative has not been generated for this scan.
          </p>
        </div>
      )}

      <div className="border-t border-border pt-6 flex justify-between items-center flex-wrap gap-3">
        <p className="text-[13px] text-muted-foreground m-0">
          Powered by{" "}
          <Link href="/" className="text-muted-foreground no-underline">
            CRE Signal Engine
          </Link>{" "}
          · Institutional risk governance for CRE deals
        </p>
        <Link
          href="/login"
          className="text-[13px] no-underline font-semibold"
          style={{ color: "var(--accent-blue)" }}
        >
          Analyze your own deals →
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
        CRE Signal Engine is an underwriting support tool. This memo does not constitute investment advice.
        Financial assumptions are not displayed in shared memos.
      </p>
    </main>
  );
}
