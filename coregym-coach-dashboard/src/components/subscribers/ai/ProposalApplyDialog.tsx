"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { nextMonday } from "@/lib/program-dates";
import type { WorkoutProposal, NutritionProposal } from "@/lib/ai/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// "Apply as Program" dialog: the coach picks the start date (default: next
// Monday, matching the enroll dialogs) and duration; the server re-validates
// everything (client-side checks are UX only). Recoverable errors keep the
// dialog state so the coach can adjust and retry; duplicate submission is
// disabled while a request is in flight.
//
// Form state lives in ApplyForm, which the Dialog mounts fresh on every open
// (base-ui unmounts its content when closed) — defaults re-initialize per
// open with no effects. `submitting` is hoisted so the dialog cannot be
// dismissed mid-request.

type UnresolvedFood = { name: string; reason: "not_found" | "ambiguous"; candidates?: string[] };

type ApplyError = { kind: "message"; message: string } | { kind: "unmatched"; foods: UnresolvedFood[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  subscriptionId: string;
  kind: "workout" | "nutrition";
  proposal: WorkoutProposal | NutritionProposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProposalApplyDialog({ subscriptionId, kind, proposal, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = React.useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("subscribers.ai.apply.title")}</DialogTitle>
          <DialogDescription>{t("subscribers.ai.apply.desc")}</DialogDescription>
        </DialogHeader>
        {open && (
          <ApplyForm
            subscriptionId={subscriptionId}
            kind={kind}
            proposal={proposal}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyForm({
  subscriptionId,
  kind,
  proposal,
  submitting,
  setSubmitting,
  onDone,
}: {
  subscriptionId: string;
  kind: "workout" | "nutrition";
  proposal: WorkoutProposal | NutritionProposal;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  // Fresh defaults on every mount (= every time the dialog opens).
  const [startDate, setStartDate] = React.useState(() => nextMonday(new Date().toISOString().slice(0, 10)));
  const [durationWeeks, setDurationWeeks] = React.useState("8");
  const [error, setError] = React.useState<ApplyError | null>(null);

  async function submit() {
    if (submitting) return;
    if (!DATE_RE.test(startDate) || Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime())) {
      setError({ kind: "message", message: t("subscribers.ai.apply.invalidDate") });
      return;
    }
    const duration = Number(durationWeeks);
    if (!Number.isInteger(duration) || duration < 1 || duration > 52) {
      setError({ kind: "message", message: t("subscribers.ai.apply.invalidDuration") });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/proposal-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          kind,
          proposal,
          start_date: startDate,
          duration_weeks: duration,
        }),
      });

      if (res.ok) {
        const body = (await res.json()) as { enrollment_id?: string };
        const base = `/dashboard/subscribers/${subscriptionId}`;
        const href =
          kind === "workout"
            ? `${base}/programs/${body.enrollment_id ?? ""}`
            : `${base}/nutrition/${body.enrollment_id ?? ""}`;
        toast.success(t("subscribers.ai.apply.success"), {
          action: { label: t("subscribers.ai.apply.viewProgress"), onClick: () => router.push(href) },
        });
        onDone();
        router.refresh(); // the profile page re-renders with the new enrollment + progress
        return;
      }

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError({
          kind: "message",
          message: body?.error ?? t("subscribers.ai.apply.conflict"),
        });
        return;
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as { foods?: UnresolvedFood[] } | null;
        setError({ kind: "unmatched", foods: body?.foods ?? [] });
        return;
      }
      setError({ kind: "message", message: t("subscribers.ai.apply.failed") });
    } catch (err) {
      console.error("[ui] proposal-apply fetch failed:", err instanceof Error ? err.message : String(err));
      setError({ kind: "message", message: t("subscribers.ai.apply.failed") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai-apply-start">{t("subscribers.ai.apply.startDate")}</Label>
          <Input
            id="ai-apply-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-apply-weeks">{t("subscribers.ai.apply.duration")}</Label>
          <Input
            id="ai-apply-weeks"
            type="number"
            min={1}
            max={52}
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            disabled={submitting}
          />
        </div>

        {error?.kind === "message" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm">{error.message}</p>
          </div>
        )}

        {error?.kind === "unmatched" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="size-4 text-amber-600" /> {t("subscribers.ai.apply.unmatchedTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("subscribers.ai.apply.unmatchedDetail")}</p>
            <ul className="mt-2 space-y-1">
              {error.foods.map((f, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{f.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    (
                    {f.reason === "ambiguous"
                      ? `${t("subscribers.ai.apply.unmatchedAmbiguous")}: ${(f.candidates ?? []).join(", ")}`
                      : t("subscribers.ai.apply.unmatchedNotFound")}
                    )
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onDone} disabled={submitting}>
          {t("subscribers.ai.apply.close")}
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("subscribers.ai.apply.submitting")}
            </>
          ) : (
            t("subscribers.ai.apply.submit")
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
