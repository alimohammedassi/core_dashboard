"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import type { WorkoutTemplate } from "@/lib/supabase/types";
import type { ActiveClient } from "@/lib/workouts";
import { useI18n } from "@/lib/i18n/client";
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

export type AssignSeed = {
  template: WorkoutTemplate;
  mode: "assign" | "program";
  defaultDate: string; // computed in the click handler — date-only, no TZ shifting
};

export function AssignDialog({
  seed,
  onOpenChange,
  clients,
  onAssigned,
}: {
  seed: AssignSeed | null; // non-null while the dialog is open; remounts per seed
  onOpenChange: (v: boolean) => void;
  clients: ActiveClient[];
  onAssigned?: () => void;
}) {
  const mode = seed?.mode ?? "assign";
  const template = seed?.template ?? null;
  const { t } = useI18n();

  const [clientId, setClientId] = React.useState("");
  const [date, setDate] = React.useState(seed?.defaultDate ?? "");
  const [program, setProgram] = React.useState<{ id: string; name: string } | null>(null);
  const [programLoading, setProgramLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function fetchProgram(cid: string) {
    setProgram(null);
    if (!cid || mode !== "program") return;
    setProgramLoading(true);
    try {
      const res = await fetch(`/api/client-active-program?client_id=${encodeURIComponent(cid)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("workouts.error.programLookup"));
      setProgram(body.program ?? null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.programLookup"));
    } finally {
      setProgramLoading(false);
    }
  }

  async function handleSubmit() {
    if (!template) return;
    if (!clientId) {
      toast.error(t("workouts.validate.selectClient"));
      return;
    }
    if (!date) {
      toast.error(t("workouts.validate.selectDate"));
      return;
    }
    if (mode === "program" && !program) {
      toast.error(t("workouts.validate.noProgramForAdd"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/workout-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: template.id,
          client_id: clientId,
          scheduled_date: date,
          ...(mode === "program" && program ? { program_id: program.id } : {}),
        }),
      });
      const body2 = await res.json();
      if (!res.ok) throw new Error(body2?.error ?? t("workouts.error.assignFailed"));
      const clientName = clients.find((c) => c.clientId === clientId)?.name ?? t("workouts.assign.clientFallback");
      toast.success(
        mode === "program"
          ? t("workouts.toast.addedToProgram", {
              program: program?.name ?? t("workouts.assign.programFallback"),
              client: clientName,
              date,
            })
          : t("workouts.toast.assigned", { client: clientName, date })
      );
      onOpenChange(false);
      onAssigned?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.assignFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={seed !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "program" ? t("workouts.assign.addToProgram") : t("workouts.assign.title")}</DialogTitle>
          <DialogDescription>
            {template?.name ?? ""} —{" "}
            {mode === "program" ? t("workouts.assign.programDesc") : t("workouts.assign.assignDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign-client">{t("workouts.assign.clientLabel")}</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workouts.assign.noClients")}</p>
            ) : (
              <select
                id="assign-client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  void fetchProgram(e.target.value);
                }}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">{t("workouts.assign.selectClient")}</option>
                {clients.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {mode === "program" && clientId && (
            <div className="space-y-1 text-sm">
              {programLoading ? (
                <p className="text-muted-foreground">{t("workouts.assign.checkingProgram")}</p>
              ) : program ? (
                <p>
                  {t("workouts.assign.activeProgramLabel")}{" "}
                  <span className="font-medium">{program.name}</span>
                </p>
              ) : (
                <p className="text-sm text-destructive">{t("workouts.assign.noActiveProgram")}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="assign-date">{t("workouts.assign.dateLabel")}</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input id="assign-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ps-8" />
            </div>
            <p className="text-xs text-muted-foreground">{t("workouts.assign.dateHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || clients.length === 0 || (mode === "program" && !program)}
          >
            {submitting
              ? t("workouts.assign.submitting")
              : mode === "program"
                ? t("workouts.assign.addToProgram")
                : t("workouts.assign.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
