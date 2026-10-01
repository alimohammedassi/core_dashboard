import { GlobalLink } from "@/components/shared/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { loadNutritionEnrollmentDetail } from "@/lib/nutrition";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { RegenerateNutritionButton } from "@/components/subscribers/RegenerateNutritionButton";
import { NutritionTrends } from "@/components/nutrition/NutritionTrends";

const MEAL_STATUS_LABEL: Record<string, TKey> = {
  assigned: "subscribers.workoutStatus.assigned",
  completed: "subscribers.workoutStatus.completed",
  skipped: "subscribers.workoutStatus.skipped",
};

const SUB_STATUS: Record<string, TKey> = {
  active: "subscribers.status.active",
  paused: "subscribers.status.paused",
  cancelled: "subscribers.status.cancelled",
  canceled: "subscribers.status.canceled",
  past_due: "subscribers.status.pastDue",
  trialing: "subscribers.status.trialing",
  expired: "subscribers.status.expired",
  completed: "subscribers.status.completed",
};

// Grid columns are weekday numbers 1 (Mon) … 7 (Sun)
const WEEKDAY_KEYS: Record<number, TKey> = {
  1: "programs.weekdays.mon",
  2: "programs.weekdays.tue",
  3: "programs.weekdays.wed",
  4: "programs.weekdays.thu",
  5: "programs.weekdays.fri",
  6: "programs.weekdays.sat",
  7: "programs.weekdays.sun",
};

function fmtMacros(calories: number, p: number, c: number, f: number): string {
  return `${calories} kcal · ${p}P / ${c}C / ${f}F`;
}

export default async function NutritionEnrollmentPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { t, fmt } = await getI18n();
  const mealLabel = (s: string) => (MEAL_STATUS_LABEL[s] ? t(MEAL_STATUS_LABEL[s]) : s);
  const subLabel = (s: string) => (SUB_STATUS[s] ? t(SUB_STATUS[s]) : s);
  const weekday = (dow: number) =>
    WEEKDAY_KEYS[dow] ? t(WEEKDAY_KEYS[dow]) : t("programs.weekdays.fallback", { n: dow });
  const { id, enrollmentId } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) notFound();

  // `id` is the SUBSCRIPTION id (matching the profile route's convention).
  const supabase = await createClient();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("client_id")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!subRow) notFound();
  const clientId = (subRow as { client_id: string }).client_id;

  const detail = await loadNutritionEnrollmentDetail(ctx.coachId, clientId, enrollmentId);
  if (!detail) notFound();

  const { enrollment, days, weekly, overall } = detail;
  const weeks = Array.from({ length: enrollment.duration_weeks }, (_, i) => i + 1);
  const dayByWeekday = new Map<string, (typeof days)[number]>();
  for (const d of days) dayByWeekday.set(`${d.week}:${d.dayOfWeek}`, d);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <GlobalLink href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
          {t("subscribers.shared.backToProfile")}
        </GlobalLink>
        <span>/</span>
        <span className="text-foreground">{t("subscribers.nutritionEnrollment.crumb")}</span>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="font-display text-xl font-bold tracking-tight">{enrollment.program_name}</CardTitle>
            <Badge variant={enrollment.status === "active" ? "default" : "outline"}>{subLabel(enrollment.status)}</Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
            <span>{t("subscribers.shared.starts", { date: fmt.date(enrollment.start_date) })}</span>
            <span>{t("subscribers.shared.weeks", { n: enrollment.duration_weeks })}</span>
            <span>
              {t("subscribers.adherence.label")}:{" "}
              {overall.pct == null
                ? t("subscribers.adherence.none")
                : overall.skipped > 0
                  ? t("subscribers.adherence.pctSkipped", {
                      pct: overall.pct,
                      completed: overall.completed,
                      planned: overall.planned,
                      skipped: overall.skipped,
                    })
                  : t("subscribers.adherence.pct", {
                      pct: overall.pct,
                      completed: overall.completed,
                      planned: overall.planned,
                    })}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {days.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("subscribers.nutritionEnrollment.empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Weeks × days grid — same navigation idiom as Coach Weekly Programs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("subscribers.nutritionEnrollment.gridTitle")}</CardTitle>
              <CardDescription>{t("subscribers.nutritionEnrollment.gridDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="w-14 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {t("common.time.week")}
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                      <th
                        key={dow}
                        className="text-start text-xs font-bold uppercase tracking-wide text-muted-foreground"
                      >
                        {weekday(dow)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week}>
                      <td className="align-middle text-xs font-semibold text-muted-foreground">
                        {t("subscribers.enrollmentPage.weekShort", { n: week })}
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                        const day = dayByWeekday.get(`${week}:${dow}`);
                        if (!day) {
                          return (
                            <td
                              key={dow}
                              className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground"
                            >
                              —
                            </td>
                          );
                        }
                        const allDone = day.meals.every((m) => m.status === "completed");
                        const anySkipped = day.meals.some((m) => m.status === "skipped");
                        const variant = allDone ? "default" : anySkipped ? "secondary" : "outline";
                        return (
                          <td key={dow} className="p-0">
                            <Button
                              render={<a href={`#day-${day.date}`} />}
                              variant="ghost"
                              className="w-full p-0.5"
                              aria-label={t("subscribers.nutritionEnrollment.ariaDay", {
                                date: fmt.date(day.date),
                                n: day.meals.length,
                              })}
                            >
                              <Badge variant={variant} className="w-full justify-center">
                                {Math.round(day.current.calories)} kcal
                              </Badge>
                            </Button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Day-by-day detail */}
          {days.map((day) => (
            <Card key={day.date} id={`day-${day.date}`} className="scroll-mt-4">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {weekday(day.dayOfWeek)} · {fmt.date(day.date)}
                  </CardTitle>
                  <Badge variant="outline">
                    {t("subscribers.nutritionEnrollment.weekBadge", { n: day.week })}
                  </Badge>
                  {day.status === "today" && <Badge>{t("common.time.today")}</Badge>}
                  {day.status === "upcoming" && (
                    <Badge variant="secondary">{t("subscribers.nutritionEnrollment.upcoming")}</Badge>
                  )}
                </div>
                <CardDescription>
                  {t("subscribers.nutritionEnrollment.prescribedLine", {
                    macros: fmtMacros(day.prescribed.calories, day.prescribed.protein_g, day.prescribed.carbs_g, day.prescribed.fat_g),
                  })}
                  {" · "}
                  {t("subscribers.nutritionEnrollment.currentLine", {
                    macros: fmtMacros(day.current.calories, day.current.protein_g, day.current.carbs_g, day.current.fat_g),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {day.meals.map((m) => (
                  <div key={m.assignmentId} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{m.mealName}</p>
                      <Badge variant={m.status === "completed" ? "default" : "outline"}>
                        {mealLabel(m.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("subscribers.nutritionEnrollment.prescribedLine", {
                        macros: fmtMacros(m.prescribed.calories, m.prescribed.protein_g, m.prescribed.carbs_g, m.prescribed.fat_g),
                      })}
                      {m.status !== "skipped" && (
                        <>
                          {" · "}
                          {t("subscribers.nutritionEnrollment.currentLine", {
                            macros: fmtMacros(m.current.calories, m.current.protein_g, m.current.carbs_g, m.current.fat_g),
                          })}
                        </>
                      )}
                      {m.status === "skipped" && t("subscribers.nutritionEnrollment.skippedNote")}
                    </p>
                    <ul className="space-y-1.5">
                      {m.foods.map((f) => (
                        <li key={f.id} className="text-sm rounded border px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{f.currentName}</span>
                            {f.changed && (
                              <Badge variant="secondary" className="text-[10px]">
                                {f.changeType === "substitution"
                                  ? t("subscribers.nutritionPlan.swapped")
                                  : t("subscribers.nutritionEnrollment.adjusted")}
                              </Badge>
                            )}
                            <span className="ms-auto text-xs text-muted-foreground whitespace-nowrap">
                              {f.currentQuantity} {f.servingUnit} · {Math.round(f.current.calories)} kcal
                            </span>
                          </div>
                          {f.changed && (
                            <details className="mt-1 text-xs text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">
                                {t("subscribers.nutritionEnrollment.prescribedFood", {
                                  name: f.prescribedName,
                                  qty: f.prescribedQuantity,
                                  unit: f.servingUnit,
                                })}
                              </summary>
                              <p className="pt-0.5">
                                {fmtMacros(
                                  Math.round(f.prescribed.calories),
                                  f.prescribed.protein_g,
                                  f.prescribed.carbs_g,
                                  f.prescribed.fat_g
                                )}
                              </p>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Analytics scoped to this enrollment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" /> {t("subscribers.trends.title")}
              </CardTitle>
              <CardDescription>{t("subscribers.trends.descEnrollment")}</CardDescription>
            </CardHeader>
            <CardContent>
              <NutritionTrends weekly={weekly} />
            </CardContent>
          </Card>

          {/* Update Remaining Days */}
          {enrollment.status === "active" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("subscribers.shared.adjustTitle")}</CardTitle>
                <CardDescription>{t("subscribers.nutritionEnrollment.adjustDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <RegenerateNutritionButton enrollmentId={enrollment.id} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
