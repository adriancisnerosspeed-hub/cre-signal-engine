"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

const STORAGE_KEY = "cre_owner_ab_variant";

export function AbVariantPanel() {
  const [variant, setVariant] = useState<"A" | "B">("A");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "A" || v === "B") setVariant(v);
    } catch {
      /* ignore */
    }
  }, []);

  function choose(next: "A" | "B") {
    setVariant(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      toast(`Variant ${next} saved to localStorage`, "info");
    } catch {
      toast("Could not persist variant", "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>A/B variant tester</CardTitle>
        <CardDescription>
          Stores a local-only label for manual QA (key: {STORAGE_KEY}). Wire marketing experiments to read this in the browser when needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          Current variant: <strong>{variant}</strong>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant={variant === "A" ? "default" : "outline"} onClick={() => choose("A")}>
            Variant A
          </Button>
          <Button type="button" variant={variant === "B" ? "default" : "outline"} onClick={() => choose("B")}>
            Variant B
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
