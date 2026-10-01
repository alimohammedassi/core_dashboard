"use client";

import * as React from "react";
import { ChevronDown, ClipboardList, Dumbbell, UtensilsCrossed } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { WorkoutProposal, NutritionProposal } from "@/lib/ai/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProposalApplyDialog } from "./ProposalApplyDialog";

// One AI-proposed program, rendered for coach review. Every displayed total
// (weekly sets, per-day/per-meal kcal, macros) is deterministic arithmetic
// over the proposal itself — nothing is invented in the UI. The proposal is
// READ-ONLY until the coach applies it via the dialog.

const WEEKDAY_KEY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
function weekdayKey(dayOfWeek: number) {
  return WEEKDAY_KEY[dayOfWeek - 1] ?? "mon";
}

function sum(list: (number | null)[]): number {
  return list.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function DayAccordion({
  header,
  children,
  defaultOpen = false,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-3 text-start"
      >
        <span className="min-w-0 flex-1">{header}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

function WorkoutDay({
  proposal,
  index,
}: {
  proposal: WorkoutProposal;
  index: number;
}) {
  const { t } = useI18n();
  const day = proposal.days[index];
  const totalSets = sum(day.exercises.map((e) => e.sets));
  return (
    <DayAccordion
      header={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t(`nutrition.weekdays.${weekdayKey(day.day_of_week)}.full`)}</span>
          <Badge variant="outline" className="text-[10px]">
            {t("subscribers.ai.proposal.weeklySets", { n: totalSets })}
          </Badge>
          {day.focus && <span className="text-xs text-muted-foreground">{day.focus}</span>}
        </span>
      }
    >
      {day.notes && <p className="mb-2 text-xs text-muted-foreground">{day.notes}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("subscribers.ai.proposal.colExercise")}</TableHead>
            <TableHead className="text-center">{t("subscribers.ai.proposal.colSets")}</TableHead>
            <TableHead className="text-center">{t("subscribers.ai.proposal.colReps")}</TableHead>
            <TableHead className="text-center">{t("subscribers.ai.proposal.colWeight")}</TableHead>
            <TableHead className="text-center">{t("subscribers.ai.proposal.colRest")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {day.exercises.map((e, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">
                {e.name}
                {e.notes && <span className="block text-xs text-muted-foreground">{e.notes}</span>}
              </TableCell>
              <TableCell className="text-center">{e.sets}</TableCell>
              <TableCell className="text-center">{e.reps ?? "—"}</TableCell>
              <TableCell className="text-center">
                {e.weight_kg != null ? `${e.weight_kg} ${t("subscribers.ai.proposal.kg")}` : "—"}
              </TableCell>
              <TableCell className="text-center">
                {e.rest_sec != null ? `${e.rest_sec} ${t("subscribers.ai.proposal.sec")}` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DayAccordion>
  );
}

function NutritionDay({ proposal, index, maxDayKcal }: { proposal: NutritionProposal; index: number; maxDayKcal: number }) {
  const { t, fmt } = useI18n();
  const day = proposal.days[index];
  const dayKcal = sum(day.meals.flatMap((m) => m.foods.map((f) => f.calories)));
  return (
    <DayAccordion
      header={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t(`nutrition.weekdays.${weekdayKey(day.day_of_week)}.full`)}</span>
          <Badge variant="outline" className="text-[10px]">
            {t("subscribers.ai.proposal.kcal", { n: fmt.num(Math.round(dayKcal)) })}
          </Badge>
          {maxDayKcal > 0 && (
            <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
              <span
                className="block h-full rounded-full bg-[var(--gold)]"
                style={{ width: `${Math.min(100, Math.round((dayKcal / maxDayKcal) * 100))}%` }}
              />
            </span>
          )}
        </span>
      }
    >
      {day.notes && <p className="mb-2 text-xs text-muted-foreground">{day.notes}</p>}
      <div className="space-y-3">
        {day.meals.map((meal, mi) => {
          const mealKcal = sum(meal.foods.map((f) => f.calories));
          return (
            <div key={mi} className="rounded-md border p-2">
              <p className="flex items-center justify-between gap-2 text-sm font-medium">
                {meal.name}
                <span className="text-xs text-muted-foreground">
                  {t("subscribers.ai.proposal.perMeal", { n: fmt.num(Math.round(mealKcal)) })}
                </span>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("subscribers.ai.proposal.colFood")}</TableHead>
                    <TableHead className="text-center">{t("subscribers.ai.proposal.colQty")}</TableHead>
                    <TableHead className="text-center">{t("subscribers.ai.proposal.colKcal")}</TableHead>
                    <TableHead className="text-center">{t("subscribers.ai.proposal.colProtein")}</TableHead>
                    <TableHead className="text-center">{t("subscribers.ai.proposal.colCarbs")}</TableHead>
                    <TableHead className="text-center">{t("subscribers.ai.proposal.colFat")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meal.foods.map((f, fi) => (
                    <TableRow key={fi}>
                      <TableCell className="font-medium">
                        {f.name}
                        {f.serving_unit && (
                          <span className="block text-xs text-muted-foreground">
                            {f.quantity} {f.serving_unit}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{f.quantity}</TableCell>
                      <TableCell className="text-center">{f.calories != null ? fmt.num(Math.round(f.calories)) : "—"}</TableCell>
                      <TableCell className="text-center">{f.protein_g != null ? fmt.num(f.protein_g) : "—"}</TableCell>
                      <TableCell className="text-center">{f.carbs_g != null ? fmt.num(f.carbs_g) : "—"}</TableCell>
                      <TableCell className="text-center">{f.fat_g != null ? fmt.num(f.fat_g) : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        );
        })}
      </div>
    </DayAccordion>
  );
}

export function AiProposalCard({
  kind,
  proposal,
  subscriptionId,
}: {
  kind: "workout" | "nutrition";
  proposal: WorkoutProposal | NutritionProposal;
  subscriptionId: string;
}) {
  const { t, fmt } = useI18n();
  const [applyOpen, setApplyOpen] = React.useState(false);
  const Icon = kind === "workout" ? Dumbbell : UtensilsCrossed;

  // Deterministic headline stats computed from the proposal itself.
  const stats: { label: string; value: string }[] = [];
  if (kind === "workout") {
    const w = proposal as WorkoutProposal;
    const weeklySets = sum(w.days.flatMap((d) => d.exercises.map((e) => e.sets)));
    stats.push(
      { label: t("subscribers.ai.proposal.trainingDays", { n: w.days.length }), value: "" },
      { label: t("subscribers.ai.proposal.weeklySets", { n: weeklySets }), value: "" }
    );
  } else {
    const n = proposal as NutritionProposal;
    const dayKcals = n.days.map((d) => sum(d.meals.flatMap((m) => m.foods.map((f) => f.calories))));
    const avg = (list: number[]) => (list.length > 0 ? Math.round(sum(list) / list.length) : 0);
    const avgKcal = avg(dayKcals);
    const avgProtein = avg(n.days.map((d) => sum(d.meals.flatMap((m) => m.foods.map((f) => f.protein_g)))));
    const avgCarbs = avg(n.days.map((d) => sum(d.meals.flatMap((m) => m.foods.map((f) => f.carbs_g)))));
    const avgFat = avg(n.days.map((d) => sum(d.meals.flatMap((m) => m.foods.map((f) => f.fat_g)))));
    stats.push(
      { label: t("subscribers.ai.proposal.avgDaily"), value: t("subscribers.ai.proposal.kcal", { n: fmt.num(avgKcal) }) },
      { label: t("subscribers.ai.proposal.colProtein"), value: `${fmt.num(avgProtein)} g` },
      { label: t("subscribers.ai.proposal.colCarbs"), value: `${fmt.num(avgCarbs)} g` },
      { label: t("subscribers.ai.proposal.colFat"), value: `${fmt.num(avgFat)} g` }
    );
  }
  const maxDayKcal =
    kind === "nutrition"
      ? Math.max(...(proposal as NutritionProposal).days.map((d) => sum(d.meals.flatMap((m) => m.foods.map((f) => f.calories)))))
      : 0;

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Icon className="size-4" />
            {kind === "workout" ? t("subscribers.ai.proposal.workoutTitle") : t("subscribers.ai.proposal.nutritionTitle")}
          </p>
          <p className="mt-1 text-sm font-semibold">{proposal.name}</p>
        </div>
        <Button size="sm" onClick={() => setApplyOpen(true)}>
          <ClipboardList className="size-4" /> {t("subscribers.ai.proposal.apply")}
        </Button>
      </div>

      {proposal.description && <p className="text-sm">{proposal.description}</p>}

      <div className="flex flex-wrap gap-2">
        {stats.map((s, i) => (
          <span key={i} className="rounded-md border bg-background px-2.5 py-1 text-xs">
            <span className="font-semibold">{s.value || s.label}</span>
            {s.value && <span className="ms-1 text-muted-foreground">{s.label}</span>}
          </span>
        ))}
      </div>

      <div className="rounded-md border bg-background p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("subscribers.ai.proposal.rationale")}
        </p>
        <p className="mt-1 text-sm">{proposal.rationale}</p>
      </div>

      <div className="space-y-2">
        {(kind === "workout" ? (proposal as WorkoutProposal).days : (proposal as NutritionProposal).days).map((_, i) =>
          kind === "workout" ? (
            <WorkoutDay key={i} proposal={proposal as WorkoutProposal} index={i} />
          ) : (
            <NutritionDay key={i} proposal={proposal as NutritionProposal} index={i} maxDayKcal={maxDayKcal} />
          )
        )}
      </div>

      {kind === "workout" ? (
        <ProposalApplyDialog
          subscriptionId={subscriptionId}
          kind="workout"
          proposal={proposal as WorkoutProposal}
          open={applyOpen}
          onOpenChange={setApplyOpen}
        />
      ) : (
        <ProposalApplyDialog
          subscriptionId={subscriptionId}
          kind="nutrition"
          proposal={proposal as NutritionProposal}
          open={applyOpen}
          onOpenChange={setApplyOpen}
        />
      )}
    </div>
  );
}
