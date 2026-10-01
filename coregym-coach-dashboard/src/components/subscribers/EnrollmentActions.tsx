"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

// Per-enrollment actions on the customer profile: pause/resume and remove
// (unenroll). Remove keeps history when the client already trained
// (enrollment is cancelled, future untouched workouts pruned) and fully
// removes pristine enrollments — which also unblocks deleting the program.
export function EnrollmentActions({
  enrollmentId,
  status,
}: {
  enrollmentId: string;
  status: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleStatus(next: "paused" | "active") {
    setBusy(true);
    try {
      const res = await fetch(`/api/program-enrollments/${encodeURIComponent(enrollmentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("subscribers.enrollmentActions.updateFailed"));
      toast.success(next === "paused" ? t("subscribers.enrollmentActions.pausedToast") : t("subscribers.enrollmentActions.resumedToast"));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("subscribers.enrollmentActions.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(t("subscribers.enrollmentActions.confirmRemove"))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/program-enrollments/${encodeURIComponent(enrollmentId)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("subscribers.enrollmentActions.removeFailed"));
      toast.success(
        body.removed
          ? t("subscribers.enrollmentActions.removedToast")
          : t("subscribers.enrollmentActions.cancelledToast", { n: body.pruned ?? 0 })
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("subscribers.enrollmentActions.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {(status === "active" || status === "paused") && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => handleStatus(status === "active" ? "paused" : "active")}
        >
          {status === "active" ? t("subscribers.enrollmentActions.pause") : t("subscribers.enrollmentActions.resume")}
        </Button>
      )}
      {status !== "cancelled" && status !== "completed" && (
        <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={handleRemove}>
          {t("common.actions.remove")}
        </Button>
      )}
    </>
  );
}
