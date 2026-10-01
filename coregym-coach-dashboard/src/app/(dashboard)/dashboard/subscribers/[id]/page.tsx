import { GlobalLink } from "@/components/shared/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { daysAgoISO, diffDays, loadAssignedWorkouts, loadClientProgress } from "@/lib/workouts";
import { loadClientEnrollments } from "@/lib/programs";
import {
  loadClientNutritionEnrollments,
  loadNutritionEnrollmentDetail,
  loadRecentNutritionChanges,
  loadTodayNutrition,
} from "@/lib/nutrition";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { RegenerateNutritionButton } from "@/components/subscribers/RegenerateNutritionButton";
import { EnrollmentActions } from "@/components/subscribers/EnrollmentActions";
import { ExerciseResults } from "@/components/subscribers/ExerciseResults";
import { AiAnalysisCard } from "@/components/subscribers/ai/AiAnalysisCard";
import { NutritionTrends } from "@/components/nutrition/NutritionTrends";
import { CollapsibleSection } from "@/components/shared/CollapsibleSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, MessageSquare } from "lucide-react";

type SubDetail = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plan: { name: string; price_usd: number; duration_days: number } | null;
  client: { id: string; full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

type DailySummary = {
  summary_date: string;
  calories_consumed: number | null;
  steps: number | null;
  calories_burned: number | null;
  water_ml: number | null;
  sleep_hours: number | null;
  workout_done: boolean | null;
  protein_g: number | null;
};

type NutritionLog = {
  id: string;
  logged_date: string;
  meal_type: string | null;
  food_name: string | null;
  quantity: number | null;
  serving_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

type WorkoutSession = {
  id: string;
  session_date: string | null;
  session_name: string | null;
  muscle_group: string | null;
  duration_min: number | null;
};

type WorkoutSet = {
  id: string;
  session_id: string;
  exercise_name: string | null;
  set_number: number | null;
  reps: number | null;
  weight_kg: number | null;
  is_warmup: boolean | null;
};

type Measurement = {
  id: string;
  measured_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
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

const WORKOUT_STATUS: Record<string, TKey> = {
  assigned: "subscribers.workoutStatus.assigned",
  started: "subscribers.workoutStatus.started",
  completed: "subscribers.workoutStatus.completed",
  skipped: "subscribers.workoutStatus.skipped",
};

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, fmt } = await getI18n();
  const subLabel = (s: string) => (SUB_STATUS[s] ? t(SUB_STATUS[s]) : s);
  const wsLabel = (s: string) => (WORKOUT_STATUS[s] ? t(WORKOUT_STATUS[s]) : s);
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  let sub: SubDetail | null = null;
  let coachId = "";

  if (user) {
    // subscriptions.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);
    const { data } = await supabase
      .from("subscriptions")
      .select(
        `
        id, status, start_date, end_date, created_at, client_id,
        plan:subscription_plans(name, price_usd, duration_days),
        client:profiles(id, full_name, email, avatar_url)
      `
      )
      .eq("id", id)
      .eq("coach_id", coachId)
      .maybeSingle();
    if (data) {
      const raw = data as unknown as Record<string, unknown>;
      const planRaw = raw.plan as unknown;
      const clientRaw = raw.client as unknown;
      const plan = Array.isArray(planRaw) ? (planRaw[0] as SubDetail["plan"]) : (planRaw as SubDetail["plan"]);
      const client = Array.isArray(clientRaw) ? (clientRaw[0] as SubDetail["client"]) : (clientRaw as SubDetail["client"]);
      sub = {
        id: raw.id as string,
        status: raw.status as string,
        start_date: raw.start_date as string,
        end_date: (raw.end_date as string | null) ?? null,
        created_at: raw.created_at as string,
        plan,
        client,
      };
    }
  }

  if (!sub || !sub.client) notFound();
  const clientId = sub.client.id;

  // ── Assigned workouts + progress (real records, no fabrication) ─────────────
  const [assigned, progress, enrollments, nutritionEnrollments, todayNutrition, nutritionChanges] =
    await Promise.all([
      loadAssignedWorkouts(coachId, clientId),
      loadClientProgress(coachId, clientId),
      loadClientEnrollments(coachId, clientId),
      loadClientNutritionEnrollments(coachId, clientId),
      loadTodayNutrition(coachId, clientId, new Date().toISOString().slice(0, 10)),
      loadRecentNutritionChanges(coachId, clientId, 10),
    ]);
  // Nutrition trends for the active enrollment (sibling of workout analytics,
  // scoped to the enrollment — not the client's whole history).
  const activeNutrition = nutritionEnrollments.find((ne) => ne.status === "active") ?? null;
  const nutritionDetail = activeNutrition
    ? await loadNutritionEnrollmentDetail(coachId, clientId, activeNutrition.id)
    : null;
  const prs = progress?.prs ?? [];
  const weekly = progress?.weekly ?? [];
  const sessionsLast30 = progress?.sessionsLast30 ?? 0;
  const upcoming = assigned
    .filter((a) => a.status === "assigned")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const inProgress = assigned.filter((a) => a.status === "started");
  const completed = assigned.filter((a) => a.status === "completed");
  const skipped = assigned.filter((a) => a.status === "skipped");

  // ── Customer logged data (shared DB; RLS lets a coach read subscribed clients)
  const since = daysAgoISO(14);
  const [goalsRes, summariesRes, nutritionRes, sessionsRes, measurementsRes] = await Promise.all([
    supabase.from("user_goals").select("*").eq("user_id", clientId).maybeSingle(),
    supabase
      .from("daily_summary")
      .select("summary_date, calories_consumed, steps, calories_burned, water_ml, sleep_hours, workout_done, protein_g")
      .eq("user_id", clientId)
      .gte("summary_date", since)
      .order("summary_date", { ascending: false }),
    supabase
      .from("nutrition_logs")
      .select("id, logged_date, meal_type, food_name, quantity, serving_unit, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", clientId)
      .order("logged_date", { ascending: false })
      .limit(15),
    supabase
      .from("workout_sessions")
      .select("id, session_date, session_name, muscle_group, duration_min")
      .eq("user_id", clientId)
      .order("session_date", { ascending: false })
      .limit(10),
    supabase
      .from("body_measurements")
      .select("id, measured_date, weight_kg, body_fat_pct, waist_cm")
      .eq("user_id", clientId)
      .order("measured_date", { ascending: false })
      .limit(10),
  ]);

  const goals = (goalsRes.data ?? null) as
    | { daily_calories: number | null; daily_steps: number | null; weekly_workouts: number | null; target_weight_kg: number | null }
    | null;
  const summaries = (summariesRes.data ?? []) as unknown as DailySummary[];
  const nutrition = (nutritionRes.data ?? []) as unknown as NutritionLog[];
  const sessions = (sessionsRes.data ?? []) as unknown as WorkoutSession[];
  const measurements = (measurementsRes.data ?? []) as unknown as Measurement[];

  // Sets for all recent sessions (single query, grouped in memory) — feeds
  // both the detail lists and the Exercise Results visual
  const sessionIds = sessions.map((s) => s.id);
  const { data: setsData } = sessionIds.length
    ? await supabase
        .from("workout_sets")
        .select("id, session_id, exercise_name, set_number, reps, weight_kg, is_warmup")
        .in("session_id", sessionIds)
        .order("logged_at", { ascending: true })
        .limit(400)
    : { data: [] as unknown[] };
  const sets = (setsData ?? []) as unknown as WorkoutSet[];

  // ── Derived numbers
  const today = summaries[0] ?? null;
  const weekAgo = daysAgoISO(7);
  const workoutsThisWeek = sessions.filter((s) => (s.session_date ?? "") >= weekAgo).length;
  const weights = measurements.filter((m) => m.weight_kg != null);
  const latestWeight = weights[0]?.weight_kg ?? null;
  const firstWeight = weights.length >= 2 ? weights[weights.length - 1].weight_kg : null;
  const weightDelta =
    latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;

  const name = sub.client.full_name ?? sub.client.email ?? t("subscribers.detail.clientFallback");

  // ── Exercise Results visual data (working sets only; warmups excluded)
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const volumeBySession = new Map<string, number>();
  const volumeByExercise = new Map<string, number>();
  const progression = new Map<string, Map<string, number>>(); // exercise → date → max weight
  for (const st of sets) {
    if (st.is_warmup || st.reps == null || st.weight_kg == null || !st.exercise_name) continue;
    const w = Number(st.weight_kg);
    const vol = w * st.reps;
    volumeBySession.set(st.session_id, (volumeBySession.get(st.session_id) ?? 0) + vol);
    volumeByExercise.set(st.exercise_name, (volumeByExercise.get(st.exercise_name) ?? 0) + vol);
    const date = sessionById.get(st.session_id)?.session_date ?? "";
    if (!date) continue;
    const perDate = progression.get(st.exercise_name) ?? new Map<string, number>();
    perDate.set(date, Math.max(perDate.get(date) ?? 0, w));
    progression.set(st.exercise_name, perDate);
  }
  const exerciseVolume = [...volumeBySession.entries()]
    .map(([sessionId, volume]) => {
      const s = sessionById.get(sessionId);
      return {
        date: s?.session_date ?? sessionId,
        label: s?.session_date ? s.session_date.slice(5) : "—",
        volume: Math.round(volume),
      };
    })
    .filter((p) => p.volume > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const topExercises = [...volumeByExercise.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([exerciseName]) => ({
      name: exerciseName,
      points: [...(progression.get(exerciseName) ?? new Map()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, weight]) => ({ date: date.slice(5), weight })),
    }))
    .filter((e) => e.points.length >= 2);


  // ── Hierarchy derivations (priority: progress → nutrition → workouts)
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayMeals = nutrition.filter((n) => n.logged_date === todayISO);
  const macros = todayMeals.reduce(
    (a, n) => ({
      kcal: a.kcal + (n.calories ?? 0),
      p: a.p + (n.protein_g ?? 0),
      c: a.c + (n.carbs_g ?? 0),
      f: a.f + (n.fat_g ?? 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  const activeEnrollment = enrollments.find((e) => e.status === 'active') ?? null;
  const programWeek = activeEnrollment
    ? Math.min(
        Math.max(Math.floor((todayISO > activeEnrollment.start_date ? diffDays(todayISO, activeEnrollment.start_date) : 0) / 7) + 1, 1),
        activeEnrollment.duration_weeks
      )
    : null;
  const latestPR = [...prs]
    .filter((pr) => pr.achieved_date)
    .sort((a, b) => (b.achieved_date ?? '').localeCompare(a.achieved_date ?? ''))[0] ?? null;
  const nextUpcoming = upcoming[0] ?? null;
  const recentMeals = nutrition.slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button render={<GlobalLink href="/dashboard/subscribers" />} variant="ghost" size="sm" className="-ms-2 text-muted-foreground">
          <ChevronLeft className="size-4 rtl:rotate-180" />
          {t("subscribers.detail.back")}
        </Button>
      </div>

      {/* ── Identity hero — Stitch client profile header ──────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <Avatar className="size-16 ring-2 ring-primary/40">
            {sub.client.avatar_url ? <AvatarImage src={sub.client.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-lg">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-headline-md tracking-tight text-foreground">{name}</h1>
              <Badge variant={sub.status === "active" ? "default" : "secondary"} className="uppercase">
                {subLabel(sub.status)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
              {sub.client.email && <span>{sub.client.email}</span>}
              {sub.plan?.name && (
                <span className="rounded bg-secondary px-2 py-0.5 text-label-md text-foreground">{sub.plan.name}</span>
              )}
              <span className="text-faint">
                {t("subscribers.detail.since", { date: fmt.date(sub.start_date) })}
              </span>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Button render={<GlobalLink href={`/dashboard/chat?client=${clientId}`} />} variant="secondary" size="lg">
              <MessageSquare className="size-4 text-faint" />
              {t("subscribers.detail.sendMessage")}
            </Button>
          </div>
        </CardContent>
        <CardContent className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.detail.plan")}</p>
            <p className="mt-0.5 font-medium">{sub.plan?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.detail.price")}</p>
            <p className="mt-0.5 font-medium tabular-nums">
              {sub.plan?.price_usd != null ? fmt.money(sub.plan.price_usd * 100) : "—"}
            </p>
          </div>
          <div>
            <p className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.detail.start")}</p>
            <p className="mt-0.5 text-sm tabular-nums">{fmt.date(sub.start_date)}</p>
          </div>
          <div>
            <p className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.detail.end")}</p>
            <p className="mt-0.5 text-sm tabular-nums">{sub.end_date ? fmt.date(sub.end_date) : "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── AI analysis (V1): coach-triggered, read-only, on demand ─────────── */}
      <AiAnalysisCard subscriptionId={sub.id} />

      {/* ── PRIORITY 1: Client progress ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("subscribers.progress.title")}</CardTitle>
          <CardDescription>{t("subscribers.progress.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">{t("subscribers.progress.weight")}</p>
              <div className="font-display text-2xl font-bold tabular-nums">{latestWeight != null ? `${latestWeight} kg` : "—"}</div>
              <p className="text-xs text-muted-foreground">
                {weightDelta != null
                  ? t("subscribers.progress.weightDelta", { delta: `${weightDelta > 0 ? "+" : ""}${weightDelta}` })
                  : t("subscribers.progress.weightNeedLogs")}
                {goals?.target_weight_kg
                  ? ` · ${t("subscribers.progress.weightTarget", { n: goals.target_weight_kg })}`
                  : ""}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">{t("subscribers.progress.calories")}</p>
              <div className="font-display text-2xl font-bold tabular-nums">{fmt.num(today?.calories_consumed ?? 0)}</div>
              <p className="text-xs text-muted-foreground">
                {goals?.daily_calories
                  ? t("subscribers.progress.goalKcal", { n: fmt.num(goals.daily_calories) })
                  : t("subscribers.progress.noGoal")}
                {today ? ` · ${fmt.date(today.summary_date)}` : ""}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">{t("subscribers.progress.steps")}</p>
              <div className="font-display text-2xl font-bold tabular-nums">{fmt.num(today?.steps ?? 0)}</div>
              <p className="text-xs text-muted-foreground">
                {goals?.daily_steps
                  ? t("subscribers.progress.goalSteps", { n: fmt.num(goals.daily_steps) })
                  : t("subscribers.progress.noGoal")}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">{t("subscribers.progress.workouts")}</p>
              <div className="font-display text-2xl font-bold tabular-nums">{workoutsThisWeek}</div>
              <p className="text-xs text-muted-foreground">
                {goals?.weekly_workouts
                  ? t("subscribers.progress.goalPerWeek", { n: goals.weekly_workouts })
                  : t("subscribers.progress.noGoal")}
                {" · "}
                {t("subscribers.progress.in30d", { n: sessionsLast30 })}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("subscribers.progress.program")}
              </p>
              {activeEnrollment ? (
                <>
                  <p className="mt-1 text-sm font-medium">{activeEnrollment.program_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("subscribers.progress.programWeek", {
                      week: programWeek ?? 1,
                      total: activeEnrollment.duration_weeks,
                      date: fmt.date(activeEnrollment.start_date),
                    })}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("subscribers.progress.noProgram")}</p>
              )}
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("subscribers.progress.pr")}
              </p>
              {latestPR ? (
                <>
                  <p className="mt-1 text-sm font-medium">
                    {latestPR.exercise_name} · {latestPR.max_weight != null ? `${Number(latestPR.max_weight)} kg` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {latestPR.achieved_date != null
                      ? t("subscribers.progress.prAchieved", { date: fmt.date(latestPR.achieved_date) })
                      : "—"}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("subscribers.progress.noPr")}</p>
              )}
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("subscribers.progress.volumeTrend")}
              </p>
              {weekly.every((w) => w.volume === 0) ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("subscribers.progress.noVolume")}</p>
              ) : (
                <div className="mt-2 flex h-14 items-end gap-1">
                  {weekly.map((w) => {
                    const max = Math.max(...weekly.map((x) => x.volume), 1);
                    return (
                      <div
                        key={w.weekStart}
                        className="flex-1 rounded-t bg-primary/70"
                        style={{ height: `${Math.max((w.volume / max) * 100, w.volume > 0 ? 8 : 2)}%` }}
                        title={t("subscribers.progress.volumeTip", { date: w.weekStart, volume: fmt.num(w.volume) })}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Assigned nutrition plan ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("subscribers.nutritionPlan.title")}</CardTitle>
          <CardDescription>
            {nutritionEnrollments.length === 0
              ? t("subscribers.nutritionPlan.empty")
              : t(
                  nutritionEnrollments.length === 1
                    ? "subscribers.nutritionPlan.countOne"
                    : "subscribers.nutritionPlan.countMany",
                  { n: nutritionEnrollments.length }
                )}
          </CardDescription>
        </CardHeader>
        {nutritionEnrollments.length > 0 && (
          <CardContent className="space-y-4">
            {nutritionEnrollments.map((ne) => (
              <div key={ne.id} className="rounded-lg bg-secondary/50 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{ne.program_name}</p>
                  <Badge variant={ne.status === "active" ? "default" : "outline"}>{subLabel(ne.status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("subscribers.nutritionPlan.enrollmentMeta", {
                    date: fmt.date(ne.start_date),
                    weeks: ne.duration_weeks,
                    detail:
                      ne.adherence.pct == null
                        ? t("subscribers.adherence.none")
                        : ne.adherence.skipped > 0
                          ? t("subscribers.adherence.pctSkipped", {
                              pct: ne.adherence.pct,
                              completed: ne.adherence.completed,
                              planned: ne.adherence.planned,
                              skipped: ne.adherence.skipped,
                            })
                          : t("subscribers.adherence.pct", {
                              pct: ne.adherence.pct,
                              completed: ne.adherence.completed,
                              planned: ne.adherence.planned,
                            }),
                  })}
                </p>
                {ne.status === "active" && <RegenerateNutritionButton enrollmentId={ne.id} />}
                <GlobalLink
                  href={`/dashboard/subscribers/${id}/nutrition/${ne.id}`}
                  className="inline-flex items-center text-xs font-medium text-primary hover:underline"
                >
                  {t("subscribers.shared.viewFull")}
                </GlobalLink>
              </div>
            ))}

            {todayNutrition.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("subscribers.nutritionPlan.todayMeals")}</p>
                {todayNutrition.map((m) => (
                  <div key={m.assignmentId} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{m.meal_name}</span>
                      <Badge variant={m.status === "completed" ? "default" : "outline"}>{wsLabel(m.status)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.totals.calories} kcal · {m.totals.protein_g}P / {m.totals.carbs_g}C / {m.totals.fat_g}F
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {m.foods.map((f, i) => (
                        <li key={i}>
                          {f.change_type && f.current_food_name ? (
                            <>
                              <span className="font-medium text-foreground">{f.current_food_name}</span>
                              {" — "}
                              {f.current_quantity} {f.serving_unit}{" "}
                              <Badge variant="secondary" className="text-[10px]">
                                {t("subscribers.nutritionPlan.swapped")}
                              </Badge>{" "}
                              <span className="line-through">
                                {f.food_name} — {f.prescribed_quantity} {f.serving_unit}
                              </span>
                            </>
                          ) : (
                            <>
                              {f.food_name} — {f.prescribed_quantity} {f.serving_unit}
                              {f.change_type && (
                                <span className="text-amber-600">
                                  {" "}
                                  {f.current_quantity != null
                                    ? t("subscribers.nutritionPlan.adjustedTo", {
                                        qty: f.current_quantity,
                                        unit: f.serving_unit ?? "",
                                      })
                                    : t("subscribers.nutritionPlan.adjusted")}
                                </span>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {nutritionChanges.length > 0 && (
              <CollapsibleSection
                title={t("subscribers.nutritionPlan.clientChanges")}
                description={t("subscribers.nutritionPlan.changesDesc", { n: nutritionChanges.length })}
              >
                <ul className="space-y-1.5">
                  {nutritionChanges.map((c) => (
                    <li key={c.id} className="rounded-lg border px-3 py-2 text-xs">
                      <span className="font-medium">{c.meal_name ?? t("subscribers.nutritionPlan.mealFallback")}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {c.plan_date ? fmt.date(c.plan_date) : "—"} · {c.change_type}
                      </span>
                      <br />
                      <span>
                        {c.original_food_name ?? "—"} ({c.original_quantity ?? "—"}) →{" "}
                        {c.new_food_name ?? "—"} ({c.new_quantity ?? "—"})
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── PRIORITY 2: Nutrition ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("subscribers.nutrition.title")}</CardTitle>
          <CardDescription>{t("subscribers.nutrition.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("subscribers.nutrition.todayKcal")}</p>
              <p className="font-display text-xl font-bold tabular-nums">{fmt.num(macros.kcal)}</p>
              {goals?.daily_calories ? (
                <p className="text-xs text-muted-foreground">
                  {macros.kcal > goals.daily_calories
                    ? t("subscribers.nutrition.goalOver", { n: fmt.num(goals.daily_calories) })
                    : macros.kcal > 0
                      ? t("subscribers.nutrition.goalWithin", { n: fmt.num(goals.daily_calories) })
                      : t("subscribers.nutrition.goalNone", { n: fmt.num(goals.daily_calories) })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("subscribers.progress.noGoal")}</p>
              )}
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("subscribers.nutrition.protein")}</p>
              <p className="font-display text-xl font-bold tabular-nums">{macros.p} g</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("subscribers.nutrition.carbs")}</p>
              <p className="font-display text-xl font-bold tabular-nums">{macros.c} g</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("subscribers.nutrition.fat")}</p>
              <p className="font-display text-xl font-bold tabular-nums">{macros.f} g</p>
            </div>
          </div>

          {recentMeals.length > 0 && (
            <ul className="space-y-1.5">
              {recentMeals.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{n.food_name ?? t("subscribers.nutrition.foodFallback")}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {n.meal_type ?? t("subscribers.nutrition.mealTypeFallback")} · {fmt.date(n.logged_date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {n.calories ?? 0} kcal · {n.protein_g ?? 0}/{n.carbs_g ?? 0}/{n.fat_g ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {recentMeals.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("subscribers.nutrition.recentEmpty")}</p>
          )}

          <CollapsibleSection
            title={t("subscribers.nutrition.viewAll")}
            description={t("subscribers.nutrition.historyDesc", { n: nutrition.length })}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.table.date")}</TableHead>
                    <TableHead>{t("subscribers.nutrition.meal")}</TableHead>
                    <TableHead>{t("subscribers.nutrition.food")}</TableHead>
                    <TableHead>{t("subscribers.nutrition.qty")}</TableHead>
                    <TableHead>kcal</TableHead>
                    <TableHead>P / C / F</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nutrition.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>{fmt.date(n.logged_date)}</TableCell>
                      <TableCell>{n.meal_type ?? "—"}</TableCell>
                      <TableCell>{n.food_name ?? "—"}</TableCell>
                      <TableCell>{n.quantity ?? "—"} {n.serving_unit ?? ""}</TableCell>
                      <TableCell>{n.calories ?? 0}</TableCell>
                      <TableCell>{n.protein_g ?? 0} / {n.carbs_g ?? 0} / {n.fat_g ?? 0}</TableCell>
                    </TableRow>
                  ))}
                  {nutrition.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        {t("subscribers.nutrition.tableEmpty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CollapsibleSection>
        </CardContent>
      </Card>

      {/* ── PRIORITY 3: Workout performance ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("subscribers.workoutCard.title")}</CardTitle>
          <CardDescription>
            {t("subscribers.workoutCard.desc", {
              completed: completed.length,
              thisWeek: workoutsThisWeek,
              last30: sessionsLast30,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExerciseResults sessionVolume={exerciseVolume} exercises={topExercises} />
        </CardContent>
      </Card>

      {nutritionDetail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("subscribers.trends.title")}</CardTitle>
            <CardDescription>
              {t("subscribers.trends.descDetail", { program: nutritionDetail.enrollment.program_name })}{" "}
              <GlobalLink
                href={`/dashboard/subscribers/${id}/nutrition/${nutritionDetail.enrollment.id}`}
                className="text-primary hover:underline"
              >
                {t("subscribers.shared.viewFull")}
              </GlobalLink>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NutritionTrends weekly={nutritionDetail.weekly} />
          </CardContent>
        </Card>
      )}

      <CollapsibleSection
        title={t("subscribers.sessions.title")}
        description={t("subscribers.sessions.desc")}
        summary={
          sessions.length > 0
            ? t(
                sessions.length === 1 ? "subscribers.sessions.summaryOne" : "subscribers.sessions.summaryMany",
                {
                  n: sessions.length,
                  date: sessions[0]?.session_date ? fmt.date(sessions[0].session_date) : "—",
                }
              )
            : t("subscribers.sessions.none")
        }
      >
        <div className="space-y-3">
          {sessions.map((s) => {
            const sessionSets = sets.filter((st) => st.session_id === s.id);
            return (
              <div key={s.id} className="rounded-lg bg-secondary/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{s.session_name ?? t("subscribers.sessions.workoutFallback")}</p>
                  {s.muscle_group && <Badge variant="secondary">{s.muscle_group}</Badge>}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {s.session_date
                      ? t("subscribers.sessions.meta", { date: fmt.date(s.session_date), n: s.duration_min ?? 0 })
                      : t("subscribers.assignmentPage.duration", { n: s.duration_min ?? 0 })}
                  </span>
                </div>
                {sessionSets.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sessionSets.map((st) => (
                      <li key={st.id} className="text-xs text-muted-foreground">
                        {st.weight_kg != null
                          ? t("subscribers.sessions.setLine", {
                              exercise: st.exercise_name ?? t("subscribers.sessions.exerciseFallback"),
                              n: st.set_number ?? 1,
                              reps: st.reps ?? 0,
                              weight: st.weight_kg,
                            })
                          : t("subscribers.sessions.setLineNoWeight", {
                              exercise: st.exercise_name ?? t("subscribers.sessions.exerciseFallback"),
                              n: st.set_number ?? 1,
                              reps: st.reps ?? 0,
                            })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("subscribers.sessions.empty")}</p>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Secondary: collapsed reference sections ───────────────────────── */}
      <CollapsibleSection
        title={t("subscribers.assigned.title")}
        description={t("subscribers.assigned.desc")}
        badge={
          <span className="flex gap-1.5">
            {upcoming.length > 0 && (
              <Badge variant="outline">{t("subscribers.assigned.upcomingBadge", { n: upcoming.length })}</Badge>
            )}
            {completed.length > 0 && (
              <Badge variant="secondary">{t("subscribers.assigned.completedBadge", { n: completed.length })}</Badge>
            )}
          </span>
        }
        summary={
          upcoming.length > 0
            ? t("subscribers.assigned.nextUpcoming", {
                name: nextUpcoming?.template?.name ?? t("subscribers.sessions.workoutFallback"),
                date: nextUpcoming?.scheduled_date ? fmt.date(nextUpcoming.scheduled_date) : "—",
              })
            : t("subscribers.assigned.noUpcoming")
        }
      >
        <div className="space-y-5">
          {assigned.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("subscribers.assigned.empty")}</p>
          )}
          {[
            { title: t("subscribers.assigned.sectionUpcoming"), rows: upcoming },
            { title: t("subscribers.workoutStatus.started"), rows: inProgress },
            { title: t("subscribers.workoutStatus.completed"), rows: completed },
            { title: t("subscribers.workoutStatus.skipped"), rows: skipped },
          ]
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <div key={section.title} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                <ul className="space-y-2">
                  {section.rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {a.template?.name ?? t("subscribers.sessions.workoutFallback")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("subscribers.assigned.scheduled", { date: fmt.date(a.scheduled_date) })}
                          {a.program_id ? t("subscribers.assigned.viaProgram") : ""}
                        </p>
                      </div>
                      <Badge
                        className="ms-auto"
                        variant={a.status === "completed" ? "default" : a.status === "skipped" ? "secondary" : "outline"}
                      >
                        {wsLabel(a.status)}
                      </Badge>
                      <Button
                        render={<GlobalLink href={`/dashboard/subscribers/${sub.id}/workouts/${a.id}`} />}
                        variant="outline"
                        size="sm"
                      >
                        {a.status === "completed" || a.status === "started"
                          ? t("subscribers.assigned.review")
                          : t("common.actions.view")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("common.nav.programs")}
        description={t("subscribers.programsSection.desc")}
        badge={
          enrollments.some((e) => e.status === "active") ? (
            <Badge>
              {t("subscribers.programsSection.activeBadge", {
                n: enrollments.filter((e) => e.status === "active").length,
              })}
            </Badge>
          ) : undefined
        }
        summary={
          enrollments.length > 0
            ? t(
                enrollments.length === 1
                  ? "subscribers.programsSection.summaryOne"
                  : "subscribers.programsSection.summaryMany",
                { n: enrollments.length, name: enrollments[0].program_name }
              )
            : t("subscribers.programsSection.none")
        }
      >
        <div className="space-y-2">
          {enrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("subscribers.programsSection.empty")}</p>
          )}
          {enrollments.map((en) => (
            <div key={en.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{en.program_name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("subscribers.programsSection.meta", { date: fmt.date(en.start_date), weeks: en.duration_weeks })}
                </p>
              </div>
              <Badge
                className="ms-auto"
                variant={en.status === "active" ? "default" : en.status === "completed" ? "outline" : "secondary"}
              >
                {subLabel(en.status)}
              </Badge>
              <Button
                        render={<GlobalLink href={`/dashboard/subscribers/${sub.id}/programs/${en.id}`} />}
                variant="outline"
                size="sm"
              >
                {t("subscribers.programsSection.openProgress")}
              </Button>
              <EnrollmentActions enrollmentId={en.id} status={en.status} />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("subscribers.daily.title")}
        description={t("subscribers.daily.desc")}
        summary={
          summaries.length > 0
            ? t("subscribers.daily.summary", {
                date: fmt.date(summaries[0]?.summary_date ?? ""),
                kcal: fmt.num(summaries[0]?.calories_consumed ?? 0),
              })
            : t("subscribers.daily.none")
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.table.date")}</TableHead>
                <TableHead>{t("subscribers.daily.calories")}</TableHead>
                <TableHead>{t("subscribers.daily.protein")}</TableHead>
                <TableHead>{t("subscribers.daily.steps")}</TableHead>
                <TableHead>{t("subscribers.daily.water")}</TableHead>
                <TableHead>{t("subscribers.daily.sleep")}</TableHead>
                <TableHead>{t("subscribers.daily.workout")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((d) => (
                <TableRow key={d.summary_date}>
                  <TableCell>{fmt.date(d.summary_date)}</TableCell>
                  <TableCell>{d.calories_consumed ?? 0} kcal</TableCell>
                  <TableCell>{d.protein_g ?? 0} g</TableCell>
                  <TableCell>{fmt.num(d.steps ?? 0)}</TableCell>
                  <TableCell>{d.water_ml ?? 0} ml</TableCell>
                  <TableCell>{d.sleep_hours ?? 0} h</TableCell>
                  <TableCell>
                    {d.workout_done ? <Badge>{t("subscribers.daily.done")}</Badge> : <Badge variant="secondary">{t("subscribers.daily.rest")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    {t("subscribers.daily.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("subscribers.measurements.title")}
        description={t("subscribers.measurements.desc")}
        summary={
          measurements.length > 0
            ? t("subscribers.measurements.summary", {
                date: fmt.date(measurements[0]?.measured_date ?? ""),
                weight: measurements[0]?.weight_kg ?? "—",
              })
            : t("subscribers.measurements.none")
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.table.date")}</TableHead>
                <TableHead>{t("subscribers.measurements.weight")}</TableHead>
                <TableHead>{t("subscribers.measurements.bodyFat")}</TableHead>
                <TableHead>{t("subscribers.measurements.waist")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measurements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{fmt.date(m.measured_date)}</TableCell>
                  <TableCell>{m.weight_kg != null ? `${m.weight_kg} kg` : "—"}</TableCell>
                  <TableCell>{m.body_fat_pct != null ? `${m.body_fat_pct}%` : "—"}</TableCell>
                  <TableCell>{m.waist_cm != null ? `${m.waist_cm} cm` : "—"}</TableCell>
                </TableRow>
              ))}
              {measurements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    {t("subscribers.measurements.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleSection>
    </div>
  );
}
