"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Deal = {
  id: string;
  name: string;
  asset_type: string | null;
  market: string | null;
  created_at: string;
};

type Props = {
  deals: Deal[];
};

export default function DealsListClient({ deals }: Props) {
  const router = useRouter();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingDeal = useMemo(
    () => deals.find((deal) => deal.id === pendingDeleteId) ?? null,
    [deals, pendingDeleteId]
  );

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setDeletingId(pendingDeleteId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/deals/${pendingDeleteId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to delete deal.");
        return;
      }
      setPendingDeleteId(null);
      router.refresh();
    } catch {
      setErrorMessage("Network error while deleting deal.");
    } finally {
      setDeletingId(null);
    }
  }

  if (deals.length === 0) {
    return (
      <p className="text-muted-foreground">
        No deals yet.{" "}
        <Link href="/app/deals/new" className="text-blue-500 hover:text-blue-600">
          Create your first deal
        </Link>
      </p>
    );
  }

  return (
    <>
      <ul className="list-none p-0 m-0">
        {deals.map((deal) => (
          <li key={deal.id} className="py-4 px-5 border border-border rounded-lg mb-3 bg-muted/50">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link
                  href={`/app/deals/${deal.id}`}
                  className="text-foreground no-underline font-semibold text-base"
                >
                  {deal.name}
                </Link>
                {(deal.asset_type || deal.market) && (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {[deal.asset_type, deal.market].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(deal.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${deal.name}`}
                title="Delete deal"
                onClick={() => setPendingDeleteId(deal.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(pendingDeal)} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete deal?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{pendingDeal ? ` "${pendingDeal.name}"` : ""}? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingId)}
              onClick={() => setPendingDeleteId(null)}
            >
              No
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(deletingId)}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? "Deleting..." : "Yes, delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
