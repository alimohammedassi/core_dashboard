"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
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
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(false);

  async function handleRegenerate() {
    const confirmBody =
      futureCount === 1
        ? t("programs.regenerate.confirmOne", { n: futureCount })
        : t("programs.regenerate.confirmMany", { n: futureCount });
    if (!window.confirm(confirmBody)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/program-enrollments/${enrollmentId}/regenerate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("programs.error.regenerateFailed"));
      const replaced = Number(body.replaced ?? 0);
      toast.success(
        replaced === 1
          ? t("programs.toast.regeneratedOne")
          : t("programs.toast.regeneratedMany", { n: replaced })
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("programs.error.regenerateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={handleRegenerate} disabled={!enabled || busy} className="text-label-lg font-bold">
        <RefreshCw className="me-1 size-3.5" />
        {busy ? t("programs.regenerate.updating") : t("programs.regenerate.button")}
      </Button>
      <p className="text-body-sm text-muted-foreground">
        {enabled
          ? futureCount === 1
            ? t("programs.regenerate.hintOne", { n: futureCount })
            : t("programs.regenerate.hintMany", { n: futureCount })
          : t("programs.regenerate.hintDisabled")}
      </p>
    </div>
  );
}
