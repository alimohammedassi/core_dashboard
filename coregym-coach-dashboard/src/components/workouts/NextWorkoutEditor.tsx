"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import type { ExercisePerformance } from "@/lib/workouts";
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

type NextRow = {
  key: string;
  exercise_name: string;
  target_sets: string;
  target_reps: string;
  target_weight_kg: string;
  rest_sec: string;
  notes: string;
};

function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NextWorkoutEditor({
  sourceAssignmentId,
  templateName,
  templateMuscles,
  templateNotes,
  exercises,
}: {
  sourceAssignmentId: string;
  templateName: string;
  templateMuscles: string[];
  templateNotes: string | null;
  exercises: ExercisePerformance[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [rows, setRows] = React.useState<NextRow[]>([]);
  const [saving, setSaving] = React.useState(false);

  // Seeding happens in the click handler (event context), keeping impure
  // values out of render entirely.
  function openEditor() {
    setName(`${templateName} — next`);
    setDate(tomorrowLocal());
    setRows(
      exercises.map((ex) => ({
        key: Math.random().toString(36).slice(2),
        exercise_name: ex.exerciseName,
        target_sets: String(ex.targetSets),
        target_reps: ex.targetReps == null ? "" : String(ex.targetReps),
        // Pre-suggest the weight the client actually achieved; the coach decides.
        target_weight_kg:
          ex.bestWeightKg != null
            ? String(ex.bestWeightKg)
            : ex.targetWeightKg != null
              ? String(ex.targetWeightKg)
              : "",
        rest_sec: ex.restSec == null ? "" : String(ex.restSec),
        notes: ex.notes ?? "",
      }))
    );
    setOpen(true);
  }

  function updateRow(key: string, patch: Partial<NextRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function referenceFor(index: number): string {
    const ex = exercises[index];
    if (!ex) return "";
    const target = `${ex.targetSets} × ${ex.targetReps ?? "—"}${ex.targetWeightKg != null ? ` @ ${ex.targetWeightKg}kg` : ""}`;
    const actual =
      ex.bestWeightKg != null
        ? `${ex.bestWeightKg}kg${ex.bestReps != null ? ` × ${ex.bestReps}` : ""}`
        : "no sets logged";
    return `Current: ${target} · Actual: ${actual}`;
  }

  async function handleSaveAndAssign() {
    const valid = rows.filter((r) => r.exercise_name.trim());
    if (valid.length === 0) {
      toast.error("Add at least one exercise");
      return;
    }
    if (!date) {
      toast.error("Select the next scheduled date");
      return;
    }
    for (const [i, r] of valid.entries()) {
      const sets = Number(r.target_sets);
      if (!Number.isFinite(sets) || sets <= 0) return void toast.error(`Exercise ${i + 1}: sets must be greater than 0`);
    }
    setSaving(true);
    try {
      const res = await fetch("/api/workout-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_assignment_id: sourceAssignmentId,
          scheduled_date: date,
          template: {
            name: name.trim() || `${templateName} — next`,
            target_muscles: templateMuscles,
            notes: templateNotes,
            exercises: valid.map((r, i) => ({
              exercise_name: r.exercise_name.trim(),
              target_sets: Number(r.target_sets),
              target_reps: r.target_reps === "" ? null : Number(r.target_reps),
              target_weight_kg: r.target_weight_kg === "" ? null : Number(r.target_weight_kg),
              rest_sec: r.rest_sec === "" ? null : Number(r.rest_sec),
              notes: r.notes.trim() || null,
              order_index: i,
            })),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Assignment failed");
      toast.success(`Next workout assigned for ${date}`);
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={openEditor} disabled={exercises.length === 0}>
        <Copy className="mr-1 size-3.5" /> Duplicate as Next Workout
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Next workout</DialogTitle>
            <DialogDescription>
              Creates a new independent template and assignment — the original template and this completed workout stay
              unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="next-name">Name</Label>
                <Input id="next-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next-date">Next scheduled date</Label>
                <Input id="next-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={row.key} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.exercise_name}
                      onChange={(e) => updateRow(row.key, { exercise_name: e.target.value })}
                      placeholder="Exercise"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      aria-label="Remove exercise"
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{referenceFor(index)}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sets</Label>
                      <Input
                        type="number"
                        min="1"
                        value={row.target_sets}
                        onChange={(e) => updateRow(row.key, { target_sets: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Reps</Label>
                      <Input
                        type="number"
                        min="1"
                        value={row.target_reps}
                        onChange={(e) => updateRow(row.key, { target_reps: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={row.target_weight_kg}
                        onChange={(e) => updateRow(row.key, { target_weight_kg: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rest (sec)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.rest_sec}
                        onChange={(e) => updateRow(row.key, { rest_sec: e.target.value })}
                      />
                    </div>
                  </div>
                  <Input
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    {
                      key: Math.random().toString(36).slice(2),
                      exercise_name: "",
                      target_sets: "3",
                      target_reps: "",
                      target_weight_kg: "",
                      rest_sec: "",
                      notes: "",
                    },
                  ])
                }
              >
                <Plus className="mr-1 size-3.5" /> Add exercise
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveAndAssign} disabled={saving}>
              {saving ? "Saving…" : "Save & Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
