"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, PlusCircle, X } from "lucide-react";
import type { WorkoutTemplate, WorkoutTemplateExercise } from "@/lib/supabase/types";
import type { ExerciseCatalogItem } from "@/lib/workouts";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Solid muscle palette for active toggles — same anatomical map as the card
// chips in WorkoutsClient (solid here instead of the /15 tint). Unmapped
// custom muscles fall back to the volt.
const MUSCLE_SOLID: Record<string, string> = {
  chest: "bg-muscle-chest",
  arms: "bg-muscle-arms",
  legs: "bg-muscle-legs",
  core: "bg-muscle-core",
  back: "bg-[#54c7be]",
  shoulders: "bg-[#4fd1c5]",
  "full body": "bg-[#d1fc00]",
};

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
        className="text-label-md font-semibold md:text-label-md"
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
                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
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
  const { t } = useI18n();
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
    if (!name.trim()) return t("workouts.validate.nameRequired");
    const valid = rows.filter((r) => r.exercise_name.trim());
    if (valid.length === 0) return t("workouts.validate.addExercise");
    for (const [i, r] of rows.filter((r) => r.exercise_name.trim() || r.target_sets).entries()) {
      if (!r.exercise_name.trim()) return t("workouts.validate.exerciseNameRequired", { n: i + 1 });
      const sets = Number(r.target_sets);
      if (!Number.isFinite(sets) || sets <= 0) return t("workouts.validate.setsPositive", { n: i + 1 });
      if (r.target_reps && Number(r.target_reps) <= 0) return t("workouts.validate.repsPositive", { n: i + 1 });
      if (r.target_weight_kg && Number(r.target_weight_kg) < 0) return t("workouts.validate.weightNegative", { n: i + 1 });
      if (r.rest_sec && Number(r.rest_sec) < 0) return t("workouts.validate.restNegative", { n: i + 1 });
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
      if (!res.ok) throw new Error(saved?.error ?? t("workouts.error.saveFailed"));
      onSaved(saved as WorkoutTemplate);
      toast.success(editing ? t("workouts.toast.templateUpdated") : t("workouts.toast.templateCreated"));
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const allMuscleChips = [...MUSCLE_OPTIONS, ...muscles.filter((m) => !MUSCLE_OPTIONS.includes(m))];
  // Truthful live total: real sum of the sets on named rows only.
  const totalSets = rows
    .filter((r) => r.exercise_name.trim())
    .reduce((s, r) => s + (Number(r.target_sets) || 0), 0);

  return (
    <Dialog open={seed !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <p className="text-label-sm uppercase tracking-wider text-primary">
            {t("workouts.builder.studioKicker")}
          </p>
          <DialogTitle>{editing ? t("workouts.builder.editTitle") : t("workouts.builder.createTitle")}</DialogTitle>
          {editing && (
            <p className="text-body-sm text-muted-foreground">
              {t("workouts.builder.editing", { name: editing.name })}
            </p>
          )}
          <DialogDescription>
            {editing ? t("workouts.builder.editDesc") : t("workouts.builder.createDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tpl-name" className="text-label-sm uppercase tracking-wider">
              {t("workouts.builder.templateName")}
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workouts.builder.namePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-label-sm uppercase tracking-wider">{t("workouts.builder.muscles")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {allMuscleChips.map((m) => {
                const active = muscles.includes(m);
                const solid = MUSCLE_SOLID[m.toLowerCase()] ?? "bg-primary";
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-label-sm transition-colors ${
                      active
                        ? `${solid} font-bold text-[#161806]`
                        : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {m}
                    {active && <Check className="size-3" />}
                  </button>
                );
              })}
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
                placeholder={t("workouts.builder.customMusclePlaceholder")}
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomMuscle}>
                {t("common.actions.add")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-notes" className="text-label-sm uppercase tracking-wider">
              {t("workouts.builder.notesLabel")}
            </Label>
            <Textarea
              id="tpl-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("workouts.builder.notesPlaceholder")}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-label-sm uppercase tracking-wider">
                  {t("workouts.builder.exerciseFlow", { n: rows.length })}
                </Label>
                {totalSets > 0 && (
                  <span className="text-label-sm tabular-nums text-faint">
                    {t("workouts.list.setsMany", { n: totalSets })}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary"
                onClick={() => setRows((prev) => [...prev, blankRow()])}
              >
                <PlusCircle className="size-4" />
                {t("workouts.builder.insertMovement")}
              </Button>
            </div>

            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={row.key} className="space-y-2 rounded-lg bg-background p-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        index === 0 ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <ExerciseNameInput
                        value={row.exercise_name}
                        onChange={(v) => updateRow(row.key, { exercise_name: v })}
                        catalog={catalog}
                        placeholder={t("workouts.fields.exercisePlaceholder")}
                      />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={t("workouts.builder.moveUp")}
                        disabled={index === 0}
                        onClick={() => moveRow(index, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label={t("workouts.builder.moveDown")}
                        disabled={index === rows.length - 1}
                        onClick={() => moveRow(index, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 hover:bg-destructive/20 hover:text-destructive"
                        aria-label={t("workouts.builder.removeExercise")}
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { label: t("workouts.fields.setsRequired"), field: "target_sets", min: "1", step: undefined, placeholder: "3", valueClass: "" },
                        { label: t("workouts.fields.reps"), field: "target_reps", min: "1", step: undefined, placeholder: "10", valueClass: "" },
                        { label: t("workouts.fields.weight"), field: "target_weight_kg", min: "0", step: "0.5", placeholder: "40", valueClass: "" },
                        { label: t("workouts.fields.rest"), field: "rest_sec", min: "0", step: undefined, placeholder: "90", valueClass: "text-primary" },
                      ] as const
                    ).map((cell) => (
                      <div key={cell.field} className="rounded bg-secondary p-1">
                        <span className="block text-[9px] uppercase text-faint">{cell.label}</span>
                        <Input
                          type="number"
                          min={cell.min}
                          step={cell.step}
                          value={row[cell.field]}
                          onChange={(e) => updateRow(row.key, { [cell.field]: e.target.value })}
                          placeholder={cell.placeholder}
                          className={`h-6 border-0 bg-transparent px-0 text-center text-[11px] font-semibold md:text-[11px] dark:bg-transparent ${cell.valueClass}`}
                        />
                      </div>
                    ))}
                  </div>
                  <Input
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    placeholder={t("workouts.fields.notesPlaceholder")}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("workouts.builder.emptyRows")}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("workouts.builder.discard")}
          </Button>
          <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? t("common.actions.saving") : t("workouts.builder.saveTemplate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
