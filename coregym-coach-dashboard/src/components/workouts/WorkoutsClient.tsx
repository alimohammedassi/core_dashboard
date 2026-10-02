"use client";

import * as React from "react";
import { toast } from "sonner";
import { Dumbbell, Layers, ListPlus, PlusCircle, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkoutTemplate } from "@/lib/supabase/types";
import type { ActiveClient } from "@/lib/workouts";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/core/PageHeader";
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
// back/shoulders/full-body keep the Stitch hexes — they share the muscle
// families but not the four anatomical tokens.
const MUSCLE_CHIP: Record<string, string> = {
  chest: "bg-muscle-chest/15 text-muscle-chest",
  arms: "bg-muscle-arms/15 text-muscle-arms",
  legs: "bg-muscle-legs/15 text-muscle-legs",
  core: "bg-muscle-core/15 text-muscle-core",
  back: "bg-[#54c7be]/15 text-[#54c7be]",
  shoulders: "bg-[#4fd1c5]/15 text-[#4fd1c5]",
  "full body": "bg-[#d1fc00]/15 text-[#d1fc00]",
};

function MuscleChip({ label }: { label: string }) {
  const cls = MUSCLE_CHIP[label.toLowerCase()] ?? "bg-secondary text-muted-foreground";
  return <span className={`rounded-[6px] px-2 py-0.5 text-label-sm capitalize ${cls}`}>{label}</span>;
}

// Freshness ("updated this week" = volt dot) is computed on the server at
// request time and passed in, so this client render stays pure.

export function WorkoutsClient({
  initialTemplates,
  clients,
  catalog,
  usedBy,
  totalTemplates,
  freshTemplates,
}: {
  initialTemplates: WorkoutTemplate[];
  clients: ActiveClient[];
  catalog: { id: string; name: string; muscleGroup: string | null }[];
  usedBy: Record<string, number>;
  totalTemplates: number;
  freshTemplates: Record<string, boolean>;
}) {
  const { t, fmt } = useI18n();
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [builderSeed, setBuilderSeed] = React.useState<BuilderSeed | null>(null);
  const [builderNonce, setBuilderNonce] = React.useState(0);
  const [assign, setAssign] = React.useState<AssignSeed | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Stitch filter toolbar state — filters the loaded page client-side
  const [query, setQuery] = React.useState("");
  const [muscle, setMuscle] = React.useState<string | null>(null);

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

  // Muscle chip row derives from the loaded page's own muscle tags (All first)
  const muscleOptions = [...new Set(templates.flatMap((tpl) => tpl.target_muscles ?? []))];
  const q = query.trim().toLowerCase();
  const visibleTemplates = templates.filter((tpl) => {
    if (muscle && !(tpl.target_muscles ?? []).some((m) => m.toLowerCase() === muscle.toLowerCase())) return false;
    if (!q) return true;
    const haystack = [tpl.name, ...(tpl.exercises ?? []).map((e) => e.exercise_name)].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const filterBtn = (active: boolean) =>
    `shrink-0 rounded-[6px] px-3 py-1.5 text-label-sm capitalize transition-colors ${
      active
        ? "bg-primary font-bold text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header lives here (client) so the Create CTA can open the builder.
          Kicker row is truthful: library label + real template count. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded bg-primary/15 px-2 py-0.5 text-label-sm uppercase tracking-wider text-primary">
            {t("workouts.page.kicker")}
          </span>
          <span className="size-1.5 rounded-full bg-border" />
          <span className="text-label-sm text-muted-foreground">
            {t("workouts.page.templateCount", { n: totalTemplates })}
          </span>
        </div>
        <PageHeader
          title={t("workouts.page.title")}
          description={t("workouts.page.subtitle")}
          actions={
            <Button size="lg" onClick={openCreate}>
              <PlusCircle className="size-4" />
              {t("workouts.list.createTemplate")}
            </Button>
          }
        />
      </div>

      {/* Filter toolbar — one card: search + horizontally scrollable muscle chips */}
      <div className="flex flex-col gap-3 rounded-xl bg-card p-2 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-xl flex-1">
          <Search className="absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("workouts.list.searchPlaceholder")}
            aria-label={t("workouts.list.searchPlaceholder")}
            className="h-9 bg-background ps-10 text-body-sm focus:bg-secondary dark:bg-background dark:focus:bg-secondary"
          />
        </div>
        {muscleOptions.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setMuscle(null)}
              aria-pressed={muscle === null}
              className={`shrink-0 rounded-[6px] px-3 py-1.5 text-label-sm transition-colors ${
                muscle === null
                  ? "bg-primary font-bold text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t("common.state.all")}
            </button>
            {muscleOptions.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMuscle(muscle === m ? null : m)}
                aria-pressed={muscle === m}
                className={filterBtn(muscle === m)}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {templates.length > 0 && visibleTemplates.length === 0 ? (
        <EmptyState icon={Search} title={t("workouts.list.searchEmpty")} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("workouts.list.emptyTitle")}
          hint={t("workouts.list.emptyBody")}
          action={
            <Button onClick={openCreate}>{t("workouts.list.createTemplate")}</Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleTemplates.map((tpl) => {
            const exercises = tpl.exercises ?? [];
            const totalSets = exercises.reduce((s, e) => s + e.target_sets, 0);
            const used = usedBy[tpl.id] ?? 0;
            const fresh = freshTemplates[tpl.id] ?? false;
            return (
              <Card key={tpl.id} className="group flex flex-col justify-between py-5 transition-colors hover:bg-secondary">
                <CardContent className="flex flex-1 flex-col justify-between gap-3 px-5">
                  <div className="flex flex-col gap-2.5">
                    {(tpl.target_muscles ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(tpl.target_muscles ?? []).map((m) => (
                          <MuscleChip key={m} label={m} />
                        ))}
                      </div>
                    )}
                    <div className="space-y-1">
                      <h3 className="font-display text-headline-sm tracking-tight text-foreground transition-colors group-hover:text-primary">
                        {tpl.name}
                      </h3>
                      <p className="flex items-center gap-1.5 text-label-sm text-muted-foreground">
                        <Dumbbell className="size-3.5 text-primary" />
                        <span>
                          {exercises.length === 1
                            ? t("workouts.list.exercisesOne")
                            : t("workouts.list.exercisesMany", { n: exercises.length })}
                        </span>
                        <span className="text-faint">•</span>
                        <span>
                          {totalSets === 1
                            ? t("workouts.list.setsOne")
                            : t("workouts.list.setsMany", { n: totalSets })}
                        </span>
                      </p>
                    </div>

                    {exercises.length > 0 && (
                      <div className="rounded-lg bg-background/80 p-2">
                        <p className="pb-1.5 text-label-sm uppercase tracking-wider text-faint">
                          {t("workouts.list.blueprint")}
                        </p>
                        <ol className="space-y-1">
                          {exercises.slice(0, 5).map((e, i) => (
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
                        {exercises.length > 5 && (
                          <p className="pt-1.5 text-label-md text-faint">
                            {t("workouts.list.moreExercises", { n: exercises.length - 5 })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer strip — freshness dot + real usage, then actions */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-body-sm text-faint">
                      <span className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${fresh ? "bg-primary" : "bg-faint"}`} />
                        {t("workouts.list.updated", { date: fmt.date(tpl.updated_at) })}
                      </span>
                      {used > 0 && (
                        <span className="shrink-0 text-body-sm text-muted-foreground">
                          {t("workouts.list.usedBy", { n: used })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-border/60 pt-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyId === tpl.id}
                          onClick={() => {
                            setBuilderSeed(seedForEdit(tpl));
                            setBuilderNonce((n) => n + 1);
                          }}
                        >
                          {t("common.actions.edit")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyId === tpl.id}
                          onClick={() => handleDuplicate(tpl)}
                        >
                          {t("common.actions.duplicate")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground"
                          disabled={busyId === tpl.id}
                          onClick={() => setAssign({ template: tpl, mode: "assign", defaultDate: tomorrowLocal() })}
                        >
                          {t("workouts.list.assign")}
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("workouts.list.program")}
                          title={t("workouts.list.program")}
                          disabled={busyId === tpl.id}
                          onClick={() => setAssign({ template: tpl, mode: "program", defaultDate: tomorrowLocal() })}
                        >
                          <ListPlus className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("common.actions.delete")}
                          title={t("common.actions.delete")}
                          className="text-destructive hover:bg-destructive/20 hover:text-destructive"
                          disabled={busyId === tpl.id}
                          onClick={() => handleDelete(tpl)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
        key={assign ? `${assign.template.id}:${assign.mode}` : "assign-closed"}
        seed={assign}
        onOpenChange={(v) => {
          if (!v) setAssign(null);
        }}
        clients={clients}
      />
    </div>
  );
}
