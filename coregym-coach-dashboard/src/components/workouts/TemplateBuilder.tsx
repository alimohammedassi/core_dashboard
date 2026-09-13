"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { WorkoutTemplate, WorkoutTemplateExercise } from "@/lib/supabase/types";
import type { ExerciseCatalogItem } from "@/lib/workouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MUSCLE_OPTIONS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
];

type BuilderRow = {
  key: string;
  exercise_name: string;
  target_sets: string;
  target_reps: string;
  target_weight_kg: string;
  rest_sec: string;
  notes: string;
};

function blankRow(): BuilderRow {
  return {
    key: Math.random().toString(36).slice(2),
    exercise_name: "",
    target_sets: "3",
    target_reps: "",
    target_weight_kg: "",
    rest_sec: "",
    notes: "",
  };
}

// Fully-formed starting state for the builder. Constructed inside click
// handlers (never during render) so Math.random/Date stay out of render.
export type BuilderSeed = {
  editing: WorkoutTemplate | null;
  name: string;
  muscles: string[];
  notes: string;
  rows: BuilderRow[];
};

export function seedForCreate(): BuilderSeed {
  return { editing: null, name: "", muscles: [], notes: "", rows: [blankRow(), blankRow(), blankRow()] };
}

export function seedForEdit(template: WorkoutTemplate): BuilderSeed {
  return {
    editing: template,
    name: template.name,
    muscles: template.target_muscles ?? [],
    notes: template.notes ?? "",
    rows:
      template.exercises && template.exercises.length > 0
        ? template.exercises.map((e: WorkoutTemplateExercise) => ({
            key: Math.random().toString(36).slice(2),
            exercise_name: e.exercise_name,
            target_sets: String(e.target_sets),
            target_reps: e.target_reps == null ? "" : String(e.target_reps),
            target_weight_kg: e.target_weight_kg == null ? "" : String(e.target_weight_kg),
            rest_sec: e.rest_sec == null ? "" : String(e.rest_sec),
            notes: e.notes ?? "",
          }))
        : [blankRow(), blankRow(), blankRow()],
  };
}

// Free-text exercise input with suggestions from the app's real exercises
// catalog. Free text stays allowed so coaches can log any exercise the mobile
// app accepts.
function ExerciseNameInput({
  value,
  onChange,
  catalog,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  catalog: ExerciseCatalogItem[];
  placeholder: string;
}) {
  const [query, setQuery] = React.useState(value);
  const [open, setOpen] = React.useState(false);

  // Keep the visible query in sync when the parent replaces the value
  // (render-time adjustment instead of a cascading setState effect).
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, catalog]);

  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s.name);
                  setQuery(s.name);
                  setOpen(false);
                }}
              >
                {s.name}
                {s.muscleGroup && (
                  <span className="text-xs text-muted-foreground">{s.muscleGroup}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TemplateBuilder({
  seed,
  onOpenChange,
  catalog,
  onSaved,
}: {
  seed: BuilderSeed | null; // non-null while the dialog is open; remounts per seed
  onOpenChange: (v: boolean) => void;
  catalog: ExerciseCatalogItem[];
  onSaved: (t: WorkoutTemplate) => void;
}) {
  const editing = seed?.editing ?? null;
  const [name, setName] = React.useState(seed?.name ?? "");
  const [muscles, setMuscles] = React.useState<string[]>(seed?.muscles ?? []);
  const [customMuscle, setCustomMuscle] = React.useState("");
  const [notes, setNotes] = React.useState(seed?.notes ?? "");
  const [rows, setRows] = React.useState<BuilderRow[]>(seed?.rows ?? []);
  const [saving, setSaving] = React.useState(false);

  function toggleMuscle(m: string) {
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function addCustomMuscle() {
    const m = customMuscle.trim();
    if (!m) return;
    setMuscles((prev) => (prev.some((x) => x.toLowerCase() === m.toLowerCase()) ? prev : [...prev, m]));
    setCustomMuscle("");
  }

  function updateRow(key: string, patch: Partial<BuilderRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function validate(): string | null {
    if (!name.trim()) return "Template name is required";
    const valid = rows.filter((r) => r.exercise_name.trim());
    if (valid.length === 0) return "Add at least one exercise";
    for (const [i, r] of rows.filter((r) => r.exercise_name.trim() || r.target_sets).entries()) {
      if (!r.exercise_name.trim()) return `Exercise ${i + 1}: name is required`;
      const sets = Number(r.target_sets);
      if (!Number.isFinite(sets) || sets <= 0) return `Exercise ${i + 1}: target sets must be greater than 0`;
      if (r.target_reps && Number(r.target_reps) <= 0) return `Exercise ${i + 1}: target reps must be positive`;
      if (r.target_weight_kg && Number(r.target_weight_kg) < 0) return `Exercise ${i + 1}: weight cannot be negative`;
      if (r.rest_sec && Number(r.rest_sec) < 0) return `Exercise ${i + 1}: rest cannot be negative`;
    }
    return null;
  }

  async function handleSave() {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        target_muscles: muscles,
        notes: notes.trim() || null,
        exercises: rows
          .filter((r) => r.exercise_name.trim())
          .map((r, i) => ({
            exercise_name: r.exercise_name.trim(),
            target_sets: Number(r.target_sets),
            target_reps: r.target_reps === "" ? null : Number(r.target_reps),
            target_weight_kg: r.target_weight_kg === "" ? null : Number(r.target_weight_kg),
            rest_sec: r.rest_sec === "" ? null : Number(r.rest_sec),
            notes: r.notes.trim() || null,
            order_index: i,
          })),
      };
      const res = await fetch(
        editing ? `/api/workout-templates/${editing.id}` : "/api/workout-templates",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const saved = await res.json();
      if (!res.ok) throw new Error(saved?.error ?? "Save failed");
      onSaved(saved as WorkoutTemplate);
      toast.success(editing ? "Template updated" : "Template created");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const allMuscleChips = [...MUSCLE_OPTIONS, ...muscles.filter((m) => !MUSCLE_OPTIONS.includes(m))];

  return (
    <Dialog open={seed !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit template" : "Create template"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes update the reusable template. Client performance history is never modified."
              : "Define the prescription once, then assign it to any active client."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Push Day — Hypertrophy"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Target muscles</Label>
            <div className="flex flex-wrap gap-2">
              {allMuscleChips.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMuscle(m)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    muscles.includes(m)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customMuscle}
                onChange={(e) => setCustomMuscle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomMuscle();
                  }
                }}
                placeholder="Add custom muscle group…"
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomMuscle}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-notes">General notes (optional)</Label>
            <Textarea
              id="tpl-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Focus on controlled eccentric movement. Keep 1–2 reps in reserve."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Exercises</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, blankRow()])}
              >
                <Plus className="mr-1 size-3.5" /> Add exercise
              </Button>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={row.key} className="rounded-xl border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {index + 1}
                    </Badge>
                    <div className="flex-1">
                      <ExerciseNameInput
                        value={row.exercise_name}
                        onChange={(v) => updateRow(row.key, { exercise_name: v })}
                        catalog={catalog}
                        placeholder="Bench Press"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => moveRow(index, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Move down"
                        disabled={index === rows.length - 1}
                        onClick={() => moveRow(index, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
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
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sets *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={row.target_sets}
                        onChange={(e) => updateRow(row.key, { target_sets: e.target.value })}
                        placeholder="3"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Reps</Label>
                      <Input
                        type="number"
                        min="1"
                        value={row.target_reps}
                        onChange={(e) => updateRow(row.key, { target_reps: e.target.value })}
                        placeholder="10"
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
                        placeholder="40"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rest (sec)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.rest_sec}
                        onChange={(e) => updateRow(row.key, { rest_sec: e.target.value })}
                        placeholder="90"
                      />
                    </div>
                  </div>
                  <Input
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    placeholder="Exercise notes (optional) — e.g. keep elbows slightly tucked"
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">No exercises yet — add the first one.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
