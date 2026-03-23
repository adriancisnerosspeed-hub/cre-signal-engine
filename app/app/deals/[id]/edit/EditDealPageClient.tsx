"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizeMarket } from "@/lib/normalizeMarket";
import { fetchJsonWithTimeout } from "@/lib/fetchJsonWithTimeout";

type Props = {
  dealId: string;
  initialName: string;
  initialAssetType: string;
  initialMarket: string;
  initialRawText: string;
};

export default function EditDealPageClient({
  dealId,
  initialName,
  initialAssetType,
  initialMarket,
  initialRawText,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [assetType, setAssetType] = useState(initialAssetType);
  const [market, setMarket] = useState(initialMarket);
  const [rawText, setRawText] = useState(initialRawText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excerptWarning, setExcerptWarning] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExcerptWarning(rawText.trim().length > 0 && rawText.trim().length < 50);
    setSubmitting(true);
    try {
      const res = await fetchJsonWithTimeout(
        `/api/deals/${dealId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || "Untitled deal",
            asset_type: assetType.trim() || null,
            market: market.trim() || null,
            raw_text: rawText.trim() || null,
          }),
        },
        15000
      );
      const data = (res.json ?? {}) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      router.push(`/app/deals/${dealId}?updated=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update deal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-[640px] mx-auto p-6">
      <div className="mb-6">
        <Link href={`/app/deals/${dealId}`} className="text-muted-foreground text-sm no-underline">
          ← Back to deal
        </Link>
      </div>
      <h1 className="text-[28px] font-bold text-foreground mb-2">Reset / Edit deal inputs</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Update your deal setup fields. Your existing values are prefilled so you can edit without
        re-entering everything.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="name" className="block mb-1.5 text-sm text-foreground">
            Deal name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 123 Main St"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label htmlFor="asset_type" className="block mb-1.5 text-sm text-foreground">
            Asset type
          </label>
          <input
            id="asset_type"
            type="text"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            placeholder="e.g. Multifamily, Office"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label htmlFor="market" className="block mb-1.5 text-sm text-foreground">
            Market
          </label>
          <input
            id="market"
            type="text"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            onBlur={() => {
              const v = market.trim();
              if (v) {
                const r = normalizeMarket({ market: v });
                if (r.market_label) setMarket(r.market_label);
              }
            }}
            placeholder="e.g. Austin, TX or Dallas, Texas"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label htmlFor="raw_text" className="block mb-1.5 text-sm text-foreground">
            Underwriting excerpt (paste text)
          </label>
          <textarea
            id="raw_text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste your deal underwriting text here. Include:\n- Purchase price (e.g. $12,500,000)\n- Cap rate / NOI (e.g. 5.8% cap, $725,000 NOI)\n- LTV and debt rate (e.g. 65% LTV, 7.25% debt)\n- Vacancy rate (e.g. 8% vacancy)\n- Hold period (e.g. 5 year hold)\n- Rent and expense growth assumptions\n\nThe more detail you provide, the higher the confidence scores on your assumptions.`}
            rows={8}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm resize-y"
          />
          {excerptWarning && (
            <p className="mt-1.5 text-[13px] text-amber-500 dark:text-amber-400">
              Your underwriting excerpt looks too short. Add more detail for accurate assumption
              extraction and higher confidence scores.
            </p>
          )}
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="py-2.5 px-6 bg-gray-900 dark:bg-white text-white dark:text-black border-none rounded-md font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
          <Link
            href={`/app/deals/${dealId}`}
            className="py-2.5 px-6 border border-border rounded-md text-foreground no-underline inline-flex items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
