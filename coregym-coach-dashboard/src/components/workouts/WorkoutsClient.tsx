"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Dumbbell, Layers, Pencil, PlusCircle, Send, Trash2 } from "lucide-react";
import type { WorkoutTemplate } from "@/lib/supabase/types";
import type { ActiveClient } from "@/lib/workouts";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/core/EmptyState";
import { TemplateBuilder, seedForCreate, seedForEdit, type BuilderSeed } from "@/components/workouts/TemplateBuilder";
import { AssignDialog, type AssignSeed } from "@/components/workouts/AssignDialog";

// Date-only "tomorrow", built with local date parts (no UTC shifting).
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Muscle chips use the biomechanical palette (spec: data-viz emphasis only).
// Known groups get their anatomical color; everything else stays graphite.
const MUSCLE_CHIP: Record<string, string> = {
  chest: "bg-[#ea7a72]/15 text-[#ea7a72] border-[#ea7a72]/30",
  arms: "bg-[#54c7be]/15 text-[#54c7be] border-[#54c7be]/30",
  legs: "bg-[#7e71e0]/15 text-[#7e71e0] border-[#7e71e0]/30",
  core: "bg-[#e87fa2]/15 text-[#e87fa2] border-[#e87fa2]/30",
};

function MuscleChip({ label }: { label: string }) {
  const cls = MUSCLE_CHIP[label.toLowerCase()] ?? "bg-secondary text-muted-foreground border-border";
  return (
    <span className={`rounded-[6px] border px-2 py-0.5 text-label-md capitalize ${cls}`}>{label}</span>
  );
}

export function WorkoutsClient({
  initialTemplates,
  clients,
  catalog,
}: {
  initialTemplates: WorkoutTemplate[];
  clients: ActiveClient[];
  catalog: { id: string; name: string; muscleGroup: string | null }[];
}) {
  const { t, fmt } = useI18n();
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [builderSeed, setBuilderSeed] = React.useState<BuilderSeed | null>(null);
  const [builderNonce, setBuilderNonce] = React.useState(0);
  const [assign, setAssign] = React.useState<AssignSeed | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function openCreate() {
    setBuilderSeed(seedForCreate());
    setBuilderNonce((n) => n + 1);
  }

  function upsertSaved(t: WorkoutTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((p) => p.id === t.id);
      return exists ? prev.map((p) => (p.id === t.id ? t : p)) : [t, ...prev];
    });
  }

  async function handleDuplicate(template: WorkoutTemplate) {
    setBusyId(template.id);
    try {
      const res = await fetch(`/api/workout-templates/${template.id}/duplicate`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("workouts.error.duplicateFailed"));
      setTemplates((prev) => [body as WorkoutTemplate, ...prev]);
      toast.success(t("workouts.toast.duplicatedAs", { name: (body as WorkoutTemplate).name }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.duplicateFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(template: WorkoutTemplate) {
    if (!window.confirm(`${t("workouts.confirm.deleteTemplate", { name: template.name })} ${t("common.confirm.cannotUndo")}`))
      return;
    setBusyId(template.id);
    try {
      const res = await fetch(`/api/workout-templates/${template.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? t("workouts.error.deleteFailed"));
      setTemplates((prev) => prev.filter((p) => p.id !== template.id));
      toast.success(t("workouts.toast.templateDeleted"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workouts.error.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button size="lg" onClick={openCreate}>
          <PlusCircle className="size-4" />
          {t("workouts.list.createTemplate")}
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("workouts.list.emptyTitle")}
          hint={t("workouts.list.emptyBody")}
          action={
            <Button onClick={openCreate}>{t("workouts.list.createTemplate")}</Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(tpl.target_muscles ?? []).map((m) => (
                      <MuscleChip key={m} label={m} />
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-headline-sm text-foreground">{tpl.name}</h3>
                  <p className="flex items-center gap-1.5 text-body-sm text-faint">
                    <Dumbbell className="size-3.5" />
                    {(tpl.exercises?.length ?? 0) === 1
                      ? t("workouts.list.exercisesOne")
                      : t("workouts.list.exercisesMany", { n: tpl.exercises?.length ?? 0 })}
                  </p>
                </div>

                {(tpl.exercises?.length ?? 0) > 0 && (
                  <div className="rounded-lg bg-secondary/70 p-3">
                    <p className="pb-1.5 text-label-sm uppercase tracking-wider text-faint">
                      {t("workouts.list.blueprint")}
                    </p>
                    <ol className="space-y-1">
                      {(tpl.exercises ?? []).slice(0, 5).map((e, i) => (
                        <li key={e.id} className="flex items-baseline justify-between gap-2 text-body-sm">
                          <span className="truncate text-foreground">
                            {i + 1}. {e.exercise_name}
                          </span>
                          <span className="shrink-0 tabular-nums text-faint">
                            {e.target_sets}
                            {e.target_reps ? `×${e.target_reps}` : ""}
                            {e.target_weight_kg ? ` @ ${e.target_weight_kg}kg` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {(tpl.exercises?.length ?? 0) > 5 && (
                      <p className="pt-1.5 text-label-md text-faint">
                        {t("workouts.list.moreExercises", { n: (tpl.exercises?.length ?? 0) - 5 })}
                      </p>
                    )}
                  </div>
                )}

                <p className="mt-auto flex items-center gap-1.5 text-body-sm text-faint">
                  <span className="size-1.5 rounded-full bg-primary/60" />
                  {t("workouts.list.updated", { date: fmt.date(tpl.updated_at) })}
                </p>

                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === tpl.id}
                    onClick={() => {
                      setBuilderSeed(seedForEdit(tpl));
                      setBuilderNonce((n) => n + 1);
                    }}
                  >
                    <Pencil className="size-3.5" /> {t("common.actions.edit")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === tpl.id}
                    onClick={() => handleDuplicate(tpl)}
                  >
                    <Copy className="size-3.5" /> {t("common.actions.duplicate")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === tpl.id}
                    onClick={() => setAssign({ template: tpl, mode: "assign", defaultDate: tomorrowLocal() })}
                  >
                    <Send className="size-3.5" /> {t("workouts.list.assign")}
                  </Button>
                  <div className="ms-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("workouts.list.program")}
                      title={t("workouts.list.program")}
                      disabled={busyId === tpl.id}
                      onClick={() => setAssign({ template: tpl, mode: "program", defaultDate: tomorrowLocal() })}
                    >
                      <Layers className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("common.actions.delete")}
                      title={t("common.actions.delete")}
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === tpl.id}
                      onClick={() => handleDelete(tpl)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {builderSeed && (
        <TemplateBuilder
          key={builderNonce}
          seed={builderSeed}
          onOpenChange={(v) => {
            if (!v) setBuilderSeed(null);
          }}
          catalog={catalog}
          onSaved={upsertSaved}
        />
      )}
      <AssignDialog
        seed={assign}
        onOpenChange={(v) => {
          if (!v) setAssign(null);
        }}
        clients={clients}
      />
    </>
  );
}
