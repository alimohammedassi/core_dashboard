"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export function RegenerateNutritionButton({ enrollmentId }: { enrollmentId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handle() {
    if (!window.confirm(t("subscribers.regenerate.confirm"))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/nutrition-enrollments/${encodeURIComponent(enrollmentId)}/regenerate`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("subscribers.regenerate.failed"));
      toast.success(t("subscribers.regenerate.toast", { n: body.replaced ?? 0 }));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("subscribers.regenerate.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={busy}>
      {busy ? t("subscribers.regenerate.updating") : t("subscribers.regenerate.button")}
    </Button>
  );
}
