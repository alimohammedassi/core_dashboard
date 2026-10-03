"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

// Per-enrollment actions on the customer profile: pause/resume and remove
// (unenroll). Remove keeps history when the client already trained/ate
// (enrollment is cancelled, pristine future rows pruned) and fully removes
// pristine enrollments — which also unblocks deleting the program.
// kind switches the endpoint and the copy: "workout" hits
// /api/program-enrollments, "nutrition" hits /api/nutrition-enrollments
// (added so the AI proposal flow's "pause it first" instruction is actually
// actionable for nutrition plans).
export function EnrollmentActions({
  enrollmentId,
  status,
  kind = "workout",
}: {
  enrollmentId: string;
  status: string;
  kind?: "workout" | "nutrition";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const base = kind === "nutrition" ? "subscribers.nutritionEnrollmentActions" : "subscribers.enrollmentActions";
  const endpoint = kind === "nutrition" ? "nutrition-enrollments" : "program-enrollments";

  async function handleStatus(next: "paused" | "active") {
    setBusy(true);
    try {
      const res = await fetch(`/api/${endpoint}/${encodeURIComponent(enrollmentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t(`${base}.updateFailed`));
      toast.success(next === "paused" ? t(`${base}.pausedToast`) : t(`${base}.resumedToast`));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(`${base}.updateFailed`));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(t(`${base}.confirmRemove`))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/${endpoint}/${encodeURIComponent(enrollmentId)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t(`${base}.removeFailed`));
      toast.success(
        body.removed
          ? t(`${base}.removedToast`)
          : t(`${base}.cancelledToast`, { n: body.pruned ?? 0 })
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(`${base}.removeFailed`));
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
          {status === "active" ? t(`${base}.pause`) : t(`${base}.resume`)}
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
