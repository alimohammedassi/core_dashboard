"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import type { WorkoutTemplate } from "@/lib/supabase/types";
import type { ActiveClient } from "@/lib/workouts";
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
      if (!res.ok) throw new Error(body?.error ?? "Could not look up the program");
      setProgram(body.program ?? null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not look up the program");
    } finally {
      setProgramLoading(false);
    }
  }

  async function handleSubmit() {
    if (!template) return;
    if (!clientId) {
      toast.error("Select a client");
      return;
    }
    if (!date) {
      toast.error("Select a scheduled date");
      return;
    }
    if (mode === "program" && !program) {
      toast.error("This client has no active program to add the workout to");
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
      if (!res.ok) throw new Error(body2?.error ?? "Assignment failed");
      const clientName = clients.find((c) => c.clientId === clientId)?.name ?? "client";
      toast.success(
        mode === "program"
          ? `Added to ${program?.name ?? "program"} — ${clientName}, ${date}`
          : `Workout assigned to ${clientName} for ${date}`
      );
      onOpenChange(false);
      onAssigned?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={seed !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "program" ? "Add to program" : "Assign to client"}</DialogTitle>
          <DialogDescription>
            {template?.name ?? ""} —{" "}
            {mode === "program"
              ? "the client sees this workout inside their active program."
              : "the client sees this workout on the scheduled date in the mobile app."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign-client">Client (active subscribers)</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active subscribers yet. Assignments need a client with an active subscription.
              </p>
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
                <option value="">Select a client…</option>
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
                <p className="text-muted-foreground">Checking active program…</p>
              ) : program ? (
                <p>
                  Active program: <span className="font-medium">{program.name}</span>
                </p>
              ) : (
                <p className="text-sm text-destructive">This client has no active program in the app.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="assign-date">Scheduled date</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input id="assign-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-8" />
            </div>
            <p className="text-xs text-muted-foreground">
              Date-only — stored exactly as picked, no timezone shifting. Tomorrow works.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || clients.length === 0 || (mode === "program" && !program)}
          >
            {submitting ? "Assigning…" : mode === "program" ? "Add to program" : "Assign workout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
