import Link from "next/link";
import { renderMarkdown } from "@/lib/ui/renderMarkdown";

const BAND_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  Elevated: "#f97316",
  High: "#ef4444",
};

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
  const bandColor = BAND_COLORS[riskIndexBand ?? ""] ?? "#71717a";

  return (
    <main className="max-w-[800px] mx-auto py-10 px-6 bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="mb-6 flex justify-between items-center">
        <Link href="/" className="no-underline">
          <span className="text-[13px] text-gray-500 dark:text-zinc-500 font-semibold">CRE Signal Engine</span>
        </Link>
        <span className="text-xs text-gray-500 dark:text-zinc-500">Shared IC Memo</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">{dealName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
          {[assetType, market].filter(Boolean).join(" · ")} · Scanned {scanDateLabel}
        </p>
      </div>

      {riskIndexScore != null && (
        <div
          className="flex items-center gap-4 py-4 px-5 rounded-lg mb-7 bg-gray-100 dark:bg-zinc-900 border"
          style={{ borderColor: `${bandColor}40` }}
        >
          <div className="text-[42px] font-extrabold tabular-nums leading-none" style={{ color: bandColor }}>
            {riskIndexScore}
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: bandColor }}>
              {riskIndexBand}
            </div>
            <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">CRE Signal Risk Index™</div>
          </div>
        </div>
      )}

      {narrativeContent ? (
        <section className="mb-10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-200 mb-3.5">
            IC Memorandum Narrative
          </h2>
          <div className="py-5 px-6 border border-gray-200 dark:border-white/10 rounded-lg bg-gray-50 dark:bg-white/[0.02] text-sm text-gray-900 dark:text-zinc-200">
            {renderMarkdown(narrativeContent)}
          </div>
        </section>
      ) : (
        <div className="py-5 px-6 border border-gray-200 dark:border-white/8 rounded-lg mb-10">
          <p className="text-gray-500 dark:text-zinc-400 text-sm m-0">
            IC memo narrative has not been generated for this scan.
          </p>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-white/8 pt-6 flex justify-between items-center flex-wrap gap-3">
        <p className="text-[13px] text-gray-500 dark:text-zinc-500 m-0">
          Powered by{" "}
          <Link href="/" className="text-gray-500 dark:text-zinc-400 no-underline">
            CRE Signal Engine
          </Link>{" "}
          · Institutional risk governance for CRE deals
        </p>
        <Link href="/login" className="text-[13px] text-[#3b82f6] no-underline font-semibold">
          Analyze your own deals →
        </Link>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-zinc-500 mt-4 leading-relaxed">
        CRE Signal Engine is an underwriting support tool. This memo does not constitute investment advice.
        Financial assumptions are not displayed in shared memos.
      </p>
    </main>
  );
}
