import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { loadNutritionEnrollmentDetail } from "@/lib/nutrition";
import { weekdayLabel } from "@/lib/programs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { RegenerateNutritionButton } from "@/components/subscribers/RegenerateNutritionButton";
import { NutritionTrends } from "@/components/nutrition/NutritionTrends";

const MEAL_STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  completed: "Completed",
  skipped: "Skipped",
};

function fmt(calories: number, p: number, c: number, f: number): string {
  return `${calories} kcal · ${p}P / ${c}C / ${f}F`;
}

export default async function NutritionEnrollmentPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
          ← Customer profile
        </Link>
        <span>/</span>
        <span className="text-foreground">Nutrition program</span>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl font-bold">{enrollment.program_name}</CardTitle>
            <Badge variant={enrollment.status === "active" ? "default" : "outline"}>{enrollment.status}</Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
            <span>Starts: {enrollment.start_date}</span>
            <span>{enrollment.duration_weeks} weeks</span>
            <span>
              Adherence:{" "}
              {overall.pct == null
                ? "— (no elapsed meals)"
                : `${overall.pct}% (${overall.completed}/${overall.planned} meals${overall.skipped > 0 ? `, ${overall.skipped} skipped` : ""})`}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {days.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No meals generated for this enrollment yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Weeks × days grid — same navigation idiom as Coach Weekly Programs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Program grid</CardTitle>
              <CardDescription>
                Each cell is one day of prescribed meals. Click a day to jump to its detail below.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="w-14 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Week
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                      <th
                        key={dow}
                        className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground"
                      >
                        {weekdayLabel(dow)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week}>
                      <td className="align-middle text-xs font-semibold text-muted-foreground">W{week}</td>
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
                              aria-label={`${day.date}: ${day.meals.length} meals`}
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
                    {weekdayLabel(day.dayOfWeek)} · {day.date}
                  </CardTitle>
                  <Badge variant="outline">Week {day.week}</Badge>
                  {day.status === "today" && <Badge>Today</Badge>}
                  {day.status === "upcoming" && <Badge variant="secondary">Upcoming</Badge>}
                </div>
                <CardDescription>
                  Prescribed {fmt(day.prescribed.calories, day.prescribed.protein_g, day.prescribed.carbs_g, day.prescribed.fat_g)}
                  {" · "}Current{" "}
                  {fmt(day.current.calories, day.current.protein_g, day.current.carbs_g, day.current.fat_g)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {day.meals.map((m) => (
                  <div key={m.assignmentId} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{m.mealName}</p>
                      <Badge variant={m.status === "completed" ? "default" : "outline"}>
                        {MEAL_STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prescribed {fmt(m.prescribed.calories, m.prescribed.protein_g, m.prescribed.carbs_g, m.prescribed.fat_g)}
                      {m.status !== "skipped" && (
                        <>
                          {" · "}Current{" "}
                          {fmt(m.current.calories, m.current.protein_g, m.current.carbs_g, m.current.fat_g)}
                        </>
                      )}
                      {m.status === "skipped" && " · Skipped — excluded from current totals"}
                    </p>
                    <ul className="space-y-1.5">
                      {m.foods.map((f) => (
                        <li key={f.id} className="text-sm rounded border px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{f.currentName}</span>
                            {f.changed && (
                              <Badge variant="secondary" className="text-[10px]">
                                {f.changeType === "substitution" ? "Swapped" : "Adjusted"}
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                              {f.currentQuantity} {f.servingUnit} · {Math.round(f.current.calories)} kcal
                            </span>
                          </div>
                          {f.changed && (
                            <details className="mt-1 text-xs text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">
                                Prescribed: {f.prescribedName} — {f.prescribedQuantity} {f.servingUnit}
                              </summary>
                              <p className="pt-0.5">
                                {fmt(
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
                <TrendingUp className="size-4" /> Nutrition trends
              </CardTitle>
              <CardDescription>
                Prescribed vs current calories, macros and adherence per week — this enrollment only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NutritionTrends weekly={weekly} />
            </CardContent>
          </Card>

          {/* Update Remaining Days */}
          {enrollment.status === "active" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adjust after program edits</CardTitle>
                <CardDescription>
                  If the program changed, this replaces only the future still-“Assigned” meals with the new
                  plan. Completed, skipped, changed and past meals are never touched.
                </CardDescription>
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
