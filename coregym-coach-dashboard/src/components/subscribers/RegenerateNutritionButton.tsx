"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RegenerateNutritionButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handle() {
    if (!window.confirm("Regenerate future meals from the current template? Completed, skipped and changed meals are never touched.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/nutrition-enrollments/${encodeURIComponent(enrollmentId)}/regenerate`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Regeneration failed");
      toast.success(`${body.replaced ?? 0} future meals regenerated`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? "Updating…" : "Update remaining days"}
    </Button>
  );
}
