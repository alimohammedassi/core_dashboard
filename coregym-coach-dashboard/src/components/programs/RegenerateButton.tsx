"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// "Update Remaining Weeks" (§4.2): explicit, coach-triggered regeneration.
// Never automatic — editing the program alone changes nothing for clients.
export function RegenerateButton({
  enrollmentId,
  enabled,
  futureCount,
}: {
  enrollmentId: string;
  enabled: boolean;
  futureCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleRegenerate() {
    if (
      !window.confirm(
        `Replace ${futureCount} future "Assigned" workout${futureCount === 1 ? "" : "s"} with the program's current schedule?\n\nCompleted, started, skipped and past workouts are not touched.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/program-enrollments/${enrollmentId}/regenerate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Regeneration failed");
      toast.success(`${body.replaced ?? 0} workout${(body.replaced ?? 0) === 1 ? "" : "s"} updated`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={handleRegenerate} disabled={!enabled || busy}>
        <RefreshCw className="mr-1 size-3.5" />
        {busy ? "Updating…" : "Update Remaining Weeks"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? `${futureCount} future assigned workout${futureCount === 1 ? "" : "s"} will be replaced.`
          : "Available while the enrollment is active and has future assigned workouts."}
      </p>
    </div>
  );
}
