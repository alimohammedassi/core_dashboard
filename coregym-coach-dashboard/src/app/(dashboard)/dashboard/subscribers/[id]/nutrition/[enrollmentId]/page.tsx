import { GlobalLink } from "@/components/shared/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { loadNutritionEnrollmentDetail } from "@/lib/nutrition";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard } from "@/components/core/StatCard";
import { EmptyState } from "@/components/core/EmptyState";
import { Apple, CalendarDays, CheckCircle2, Target, TrendingUp, XCircle } from "lucide-react";
import { RegenerateNutritionButton } from "@/components/subscribers/RegenerateNutritionButton";
import { NutritionTrends } from "@/components/nutrition/NutritionTrends";
import { MacroPill, MealChip, mealNo } from "@/components/nutrition/macro-display";
import { cn } from "cn";

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

  const { enrollment, days, weekly, overall, futureAssignedCount } = detail;
  const weeks = Array.from({ length: enrollment.duration_weeks }, (_, i) => i + 1);
  const dayByWeekday = new Map<string, (typeof days)[number]>();
  for (const d of days) dayByWeekday.set(`${d.week}:${d.dayOfWeek}`, d);

  // Last logged meal — the most recent completed meal by scheduled_date,
  // straight from the loaded detail (no extra query). Null until the client
  // completes something.
  let lastLogged: { meal: string; date: string } | null = null;
  for (const d of days) {
    for (const m of d.meals) {
      if (m.status === "completed" && (!lastLogged || d.date >= lastLogged.date)) {
        lastLogged = { meal: m.mealName, date: d.date };
      }
    }
  }

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
      <PageHeader
        title={enrollment.program_name}
        meta={
          <>
            <Badge variant={enrollment.status === "active" ? "default" : "outline"}>
              {subLabel(enrollment.status)}
            </Badge>
            <span>{t("subscribers.shared.starts", { date: fmt.date(enrollment.start_date) })}</span>
            <span>{t("subscribers.shared.weeks", { n: enrollment.duration_weeks })}</span>
          </>
        }
      />

      {/* Enrollment metric row — all values from the loaded detail */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("nutrition.trends.adherence")}
          icon={Target}
          value={overall.pct == null ? "—" : fmt.percent(overall.pct)}
          footer={
            <span>
              {lastLogged
                ? t("nutrition.enrollment.lastLogged", { meal: lastLogged.meal, date: fmt.date(lastLogged.date) })
                : t("nutrition.enrollment.noLogs")}
            </span>
          }
        />
        <StatCard
          label={t("nutrition.enrollment.metrics.completed")}
          icon={CheckCircle2}
          value={fmt.num(overall.completed)}
          suffix={`/ ${fmt.num(overall.planned)}`}
          footer={<span>{t("nutrition.enrollment.upcomingMeals", { n: fmt.num(futureAssignedCount) })}</span>}
        />
        <StatCard
          label={t("nutrition.enrollment.metrics.skipped")}
          icon={XCircle}
          value={fmt.num(overall.skipped)}
          footer={<span>{t("nutrition.enrollment.skippedFooter")}</span>}
        />
        <StatCard
          label={t("nutrition.enrollment.metrics.weeks")}
          icon={CalendarDays}
          value={fmt.num(enrollment.duration_weeks)}
        />
      </div>

      {days.length === 0 ? (
        <EmptyState icon={Apple} title={t("subscribers.nutritionEnrollment.empty")} />
      ) : (
        <>
          {/* Weeks × days grid — same navigation idiom as Coach Weekly Programs.
              Heatmap cells: elapsed days volt-tinted with the day's kcal, today
              full volt, future days an em dash, no-plan days dashed. The anchor
              + aria-label navigation is unchanged. */}
          <Card>
            <CardHeader>
              <CardTitle>{t("subscribers.nutritionEnrollment.gridTitle")}</CardTitle>
              <CardDescription>{t("subscribers.nutritionEnrollment.gridDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="w-14 text-start text-label-sm uppercase tracking-wider text-faint">
                      {t("common.time.week")}
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                      <th key={dow} className="text-start text-label-sm uppercase tracking-wider text-faint">
                        {weekday(dow)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week}>
                      <td className="align-middle text-label-sm font-semibold text-muted-foreground">
                        {t("subscribers.enrollmentPage.weekShort", { n: week })}
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                        const day = dayByWeekday.get(`${week}:${dow}`);
                        if (!day) {
                          return (
                            <td
                              key={dow}
                              className="rounded-md border border-dashed border-border/60 p-0 text-center text-label-sm text-faint"
                            >
                              <span className="flex h-8 items-center justify-center">—</span>
                            </td>
                          );
                        }
                        const upcoming = day.status === "upcoming";
                        const isToday = day.status === "today";
                        return (
                          <td key={dow} className="p-0">
                            <a
                              href={`#day-${day.date}`}
                              aria-label={t("subscribers.nutritionEnrollment.ariaDay", {
                                date: fmt.date(day.date),
                                n: day.meals.length,
                              })}
                              className={cn(
                                "flex h-8 items-center justify-center rounded text-label-sm font-bold tabular-nums transition-colors",
                                isToday
                                  ? "bg-primary text-primary-foreground hover:brightness-105"
                                  : upcoming
                                    ? "bg-background/40 text-faint"
                                    : "bg-primary/20 text-primary hover:bg-primary/30"
                              )}
                            >
                              {upcoming ? "—" : `${Math.round(day.current.calories)} kcal`}
                            </a>
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
                  <CardTitle>
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
                <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-label-sm uppercase tracking-wider text-faint">
                      {t("nutrition.trends.prescribed")}
                    </span>
                    <MacroPill macros={day.prescribed} className="text-label-sm" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-label-sm uppercase tracking-wider text-faint">
                      {t("nutrition.enrollment.current")}
                    </span>
                    <MacroPill macros={day.current} className="text-label-sm" />
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {day.meals.map((m) => {
                  // Show the current pill only when a client change actually
                  // moved the macros — otherwise it duplicates the prescription.
                  const mealChanged = m.foods.some((f) => f.changed);
                  return (
                    <div key={m.assignmentId} className="space-y-2.5 rounded-lg border border-border/40 p-3">
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-2.5">
                        <MealChip>{t("nutrition.builder.numberedMeal", { n: mealNo(m.orderIndex + 1) })}</MealChip>
                        <p className="min-w-0 flex-1 text-label-lg font-semibold text-foreground">{m.mealName}</p>
                        <Badge variant={m.status === "completed" ? "default" : "outline"}>
                          {mealLabel(m.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-label-sm uppercase tracking-wider text-faint">
                            {t("nutrition.trends.prescribed")}
                          </span>
                          <MacroPill macros={m.prescribed} className="text-label-sm" />
                        </span>
                        {m.status !== "skipped" && mealChanged && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-label-sm uppercase tracking-wider text-faint">
                              {t("nutrition.enrollment.current")}
                            </span>
                            <MacroPill macros={m.current} className="text-label-sm" />
                          </span>
                        )}
                        {m.status === "skipped" && (
                          <span className="text-label-sm text-muted-foreground">
                            {t("nutrition.enrollment.skippedFooter")}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {m.foods.map((f) => (
                          <div key={f.id} className="rounded-lg bg-background/40 p-2.5">
                            <div className="flex items-center gap-1.5">
                              <p className="min-w-0 flex-1 truncate text-label-md font-semibold">{f.currentName}</p>
                              {f.changed && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {f.changeType === "substitution"
                                    ? t("subscribers.nutritionPlan.swapped")
                                    : t("subscribers.nutritionEnrollment.adjusted")}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-label-sm text-muted-foreground">
                              <span className="min-w-0 truncate">
                                {f.currentQuantity} {f.servingUnit}
                              </span>
                              <span className="tabular-nums">{Math.round(f.current.calories)} kcal</span>
                            </div>
                            {f.changed && (
                              <details className="mt-1.5 text-label-sm text-muted-foreground">
                                <summary className="cursor-pointer hover:text-foreground">
                                  {t("subscribers.nutritionEnrollment.prescribedFood", {
                                    name: f.prescribedName,
                                    qty: f.prescribedQuantity,
                                    unit: f.servingUnit,
                                  })}
                                </summary>
                                <p className="pt-0.5">
                                  <MacroPill macros={f.prescribed} />
                                </p>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          {/* Analytics scoped to this enrollment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
                <CardTitle>{t("subscribers.shared.adjustTitle")}</CardTitle>
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
