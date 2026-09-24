"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
      if (!res.ok) throw new Error(body?.error ?? "Update failed");
      toast.success(next === "paused" ? "Program paused" : "Program resumed");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (
      !window.confirm(
        "Remove this client from the program? Past and logged workouts are kept; future untouched workouts are removed."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/program-enrollments/${encodeURIComponent(enrollmentId)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Remove failed");
      toast.success(
        body.removed ? "Enrollment removed" : `Enrollment cancelled (${body.pruned ?? 0} future workouts removed)`
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
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
          {status === "active" ? "Pause" : "Resume"}
        </Button>
      )}
      {status !== "cancelled" && status !== "completed" && (
        <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={handleRemove}>
          Remove
        </Button>
      )}
    </>
  );
}
