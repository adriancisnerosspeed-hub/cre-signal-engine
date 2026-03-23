"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const BAND_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  Elevated: "#f97316",
  High: "#ef4444",
};

type DemoInfo = {
  dealId: string;
  dealName: string;
  riskScore: number | null;
  riskBand: string | null;
};

const STEPS = [
  { n: 1, label: "Workspace" },
  { n: 2, label: "First scan" },
  { n: 3, label: "Invite teammate" },
] as const;

export default function OnboardingFlow({
  demo,
  canInviteMembers,
}: {
  demo: DemoInfo | null;
  canInviteMembers: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [completing, setCompleting] = useState(false);

  async function markComplete() {
    if (completing) return;
    setCompleting(true);
    await fetch("/api/org/onboarding", { method: "PATCH" }).catch(() => {});
    router.refresh();
  }

  async function handleSkip() {
    await markComplete();
  }

  async function handleFinish() {
    await markComplete();
  }

  const bandColor = demo?.riskBand ? (BAND_COLORS[demo.riskBand] ?? "#71717a") : "#71717a";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <Card className="w-full max-w-[520px] border-white/15 bg-zinc-950 text-zinc-100 ring-white/10">
        <CardHeader className="border-b border-white/10 pb-4">
          <div className="flex gap-2 mb-2" aria-hidden>
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    step >= s.n ? "bg-blue-500" : "bg-white/15"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    step === s.n ? "text-zinc-200" : "text-zinc-500"
                  )}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <CardTitle id="onboarding-title" className="text-lg text-zinc-50">
            {step === 1 && "Your workspace is ready"}
            {step === 2 && "Run your first scan"}
            {step === 3 && "Invite your team"}
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4 text-sm text-zinc-400 leading-relaxed">
          {step === 1 && (
            <>
              <p className="m-0 mb-4">
                You&apos;re set up with a CRE Signal workspace. Add deal assumptions, run scans, and get a
                deterministic risk score plus IC-ready narratives aligned with how your committee works.
              </p>
              {demo && (
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 mb-4">
                  <p className="text-xs text-zinc-500 m-0 mb-1">Demo deal</p>
                  <p className="text-sm font-semibold text-zinc-100 m-0">{demo.dealName}</p>
                  {demo.riskScore != null && (
                    <p className="text-[13px] font-semibold m-0 mt-1" style={{ color: bandColor }}>
                      Risk score: {demo.riskScore} — {demo.riskBand}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="m-0 mb-4">
                Each scan produces a CRE Signal Risk Index™ band, risk drivers, and an IC memo narrative you
                can export to PDF. Start from the demo or paste your own underwriting text.
              </p>
              {demo && (
                <Link
                  href={`/app/deals/${demo.dealId}`}
                  className="text-sm text-blue-400 underline underline-offset-2 inline-block mb-4"
                >
                  Open demo deal →
                </Link>
              )}
              <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3 font-mono text-[12px] text-zinc-500 leading-relaxed">
                Example: Purchase $12M, cap 5.5%, LTV 70%, NOI Y1 $660K, hold 5y, exit cap 6.0%…
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="m-0 mb-4">
                Governance works best when IC and asset management share the same risk view. Invite colleagues
                from workspace settings so everyone sees the same scans and policies.
              </p>
              {canInviteMembers ? (
                <Link
                  href="/settings/workspace"
                  className="text-sm text-blue-400 underline underline-offset-2 font-medium"
                >
                  Open workspace &amp; invites →
                </Link>
              ) : (
                <p className="m-0 text-zinc-500 text-[13px]">
                  Invites are available on paid plans. You can upgrade from{" "}
                  <Link href="/pricing" className="text-blue-400 underline underline-offset-2">
                    Pricing
                  </Link>{" "}
                  when you&apos;re ready.
                </p>
              )}
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3 border-t border-white/10 bg-black/20">
          {step === 1 && (
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="text-zinc-500">
                Skip
              </Button>
              <Button type="button" size="sm" onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/app/deals/new"
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "border-white/20 text-zinc-200")}
              >
                New deal scan
              </Link>
              <div className="flex flex-wrap gap-2 justify-end sm:justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="text-zinc-500">
                  Skip
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" size="sm" onClick={() => setStep(3)}>
                  Next
                </Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {canInviteMembers ? (
                  <Link
                    href="/settings/workspace"
                    className={buttonVariants({ size: "sm" })}
                    onClick={handleFinish}
                  >
                    Invite teammates
                  </Link>
                ) : (
                  <Button type="button" size="sm" onClick={handleFinish}>
                    Done
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={handleSkip} className="text-zinc-500">
                  Skip
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
