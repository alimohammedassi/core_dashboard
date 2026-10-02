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
import { ProfileTelemetryTiles } from "@/components/subscribers/ProfileTelemetryTiles";
import { AiAnalysisCard } from "@/components/subscribers/ai/AiAnalysisCard";
import { NutritionTrends } from "@/components/nutrition/NutritionTrends";
import { CollapsibleSection } from "@/components/shared/CollapsibleSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, statusTone, type StatusTone } from "@/components/core/StatusBadge";
import { BadgeCheck, Calendar, CalendarClock, ChevronLeft, CornerDownRight, Mail, MessageSquare } from "lucide-react";

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

const WORKOUT_TONE: Record<string, StatusTone> = {
  completed: "emerald",
  started: "mint",
  assigned: "neutral",
  skipped: "coral",
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
  // Most recent completed session — the "Review & duplicate" entry point into
  // the real performance page (where NextWorkoutEditor lives).
  const reviewTarget =
    completed.length > 0
      ? [...completed].sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0]
      : null;

  // ── Client logged data (shared DB; RLS lets a coach read subscribed clients)
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
  // Same week math for the active NUTRITION enrollment (feeds the header badge)
  const nutritionWeek = activeNutrition
    ? Math.min(
        Math.max(Math.floor((todayISO > activeNutrition.start_date ? diffDays(todayISO, activeNutrition.start_date) : 0) / 7) + 1, 1),
        activeNutrition.duration_weeks
      )
    : null;
  const otherNutritionEnrollments = nutritionEnrollments.filter((ne) => ne.id !== activeNutrition?.id);
  const latestPR = [...prs]
    .filter((pr) => pr.achieved_date)
    .sort((a, b) => (b.achieved_date ?? "").localeCompare(a.achieved_date ?? ""))[0] ?? null;
  const nextUpcoming = upcoming[0] ?? null;

  // ── Telemetry vs targets (all derivable from data already loaded above)
  const targetWeight = goals?.target_weight_kg ?? null;
  let pctToGoal: number | null = null;
  if (targetWeight != null && latestWeight != null && firstWeight != null && targetWeight !== firstWeight) {
    pctToGoal = Math.round(
      Math.min(100, Math.max(0, ((firstWeight - latestWeight) / (firstWeight - targetWeight)) * 100))
    );
  }
  const weekly6 = weekly.slice(-6);

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
        <CardContent className="flex flex-wrap items-center gap-4 py-5 sm:gap-5">
          <span className="relative shrink-0">
            <Avatar className="size-20 rounded-xl ring-2 ring-primary/40 sm:size-24">
              {sub.client.avatar_url ? <AvatarImage src={sub.client.avatar_url} alt="" className="rounded-xl" /> : null}
              <AvatarFallback className="rounded-xl text-xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1.5 -end-1.5 flex h-4 w-4">
              {sub.status === "active" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              )}
              <span
                className={`relative inline-flex h-4 w-4 rounded-full ring-2 ring-card ${
                  sub.status === "active"
                    ? "bg-primary"
                    : sub.status === "trialing"
                      ? "bg-mint"
                      : sub.status === "past_due" || sub.status === "cancelled" || sub.status === "canceled"
                        ? "bg-[#ea7a72]"
                        : "bg-faint"
                }`}
              />
            </span>
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-headline-lg text-foreground">{name}</h1>
              {sub.status === "active" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-label-sm font-bold uppercase tracking-wider text-primary">
                  <span className="size-1.5 rounded-full bg-current" />
                  {subLabel(sub.status)}
                </span>
              ) : (
                <StatusBadge tone={statusTone(sub.status)}>{subLabel(sub.status)}</StatusBadge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
              {sub.client.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-4 text-faint" />
                  {sub.client.email}
                </span>
              )}
              {sub.plan?.name && sub.plan.price_usd != null && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                  <BadgeCheck className="size-4" />
                  {t("subscribers.detail.verifiedPlan", {
                    plan: sub.plan.name,
                    price: fmt.money(sub.plan.price_usd * 100),
                  })}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 text-faint" />
                {t("subscribers.detail.since", { date: fmt.date(sub.start_date) })}
              </span>
              {sub.end_date && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <CalendarClock className="size-4 text-faint" />
                  {t("subscribers.detail.ends", { date: fmt.date(sub.end_date) })}
                </span>
              )}
            </div>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button render={<GlobalLink href={`/dashboard/chat?client=${clientId}`} />} variant="secondary" size="lg">
              <MessageSquare className="size-4 text-faint" />
              {t("subscribers.detail.sendMessage")}
            </Button>
            {activeNutrition && (
              <RegenerateNutritionButton
                enrollmentId={activeNutrition.id}
                variant="secondary"
                size="lg"
                label={t("subscribers.detail.regeneratePlan")}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── AI analysis (V1): coach-triggered, read-only, on demand ─────────── */}
      <AiAnalysisCard subscriptionId={sub.id} />

      {/* ── Telemetry vs targets (replaces the old progress grids) ─────────── */}
      <ProfileTelemetryTiles
        sectionTitle={t("subscribers.telemetry.title")}
        weight={{
          label: t("subscribers.telemetry.bodyWeight"),
          unit: t("subscribers.telemetry.kgUnit"),
          valueKg: latestWeight,
          deltaLabel: weightDelta != null && weightDelta !== 0 ? `${weightDelta > 0 ? "+" : ""}${weightDelta}` : null,
          deltaPositive: (weightDelta ?? 0) > 0,
          targetLine: targetWeight != null ? t("subscribers.telemetry.target", { n: targetWeight }) : null,
          pctToGoal,
          pctLine: pctToGoal != null ? t("subscribers.telemetry.pctToGoal", { pct: pctToGoal }) : null,
        }}
        energy={{
          label: t("subscribers.telemetry.nutritionEnergy"),
          kcalLabel: macros.kcal > 0 ? fmt.num(macros.kcal) : "—",
          goalSuffix: goals?.daily_calories ? t("subscribers.telemetry.ofKcal", { n: fmt.num(goals.daily_calories) }) : null,
          macros: [
            {
              label: t("subscribers.nutrition.protein"),
              grams: macros.p,
              display: `${fmt.num(macros.p)} g`,
              valueClass: "text-mint",
            },
            {
              label: t("subscribers.nutrition.carbs"),
              grams: macros.c,
              display: `${fmt.num(macros.c)} g`,
              valueClass: "text-primary",
            },
            {
              label: t("subscribers.nutrition.fat"),
              grams: macros.f,
              display: `${fmt.num(macros.f)} g`,
              valueClass: "text-faint",
            },
          ],
        }}
        adherence={{
          label: t("subscribers.telemetry.adherenceTile"),
          done: workoutsThisWeek,
          goal: goals?.weekly_workouts ?? null,
          goalSuffix: goals?.weekly_workouts ? `/ ${goals.weekly_workouts}` : null,
          footerLine: goals?.weekly_workouts
            ? `${t("subscribers.progress.goalPerWeek", { n: goals.weekly_workouts })} · ${t("subscribers.progress.in30d", { n: sessionsLast30 })}`
            : t("subscribers.progress.in30d", { n: sessionsLast30 }),
        }}
        pr={{
          label: t("subscribers.telemetry.milestone"),
          recordChip: t("subscribers.telemetry.prRecord"),
          headline: latestPR
            ? `${latestPR.exercise_name} · ${latestPR.max_weight != null ? `${Number(latestPR.max_weight)} kg` : "—"}`
            : null,
          achievedLine: latestPR?.achieved_date
            ? t("subscribers.progress.prAchieved", { date: fmt.date(latestPR.achieved_date) })
            : null,
          emptyLine: t("subscribers.progress.noPr"),
          volumeLabel: t("subscribers.telemetry.volume6w"),
          bars: weekly6.map((w) => ({ label: w.weekStart.slice(5), volume: Math.round(w.volume) })),
        }}
      />

      {/* ── Assigned nutrition plan & daily log (merged card) ──────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t("subscribers.nutritionPlan.sectionTitle")}</CardTitle>
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
          {activeNutrition && (
            <CardAction>
              <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-label-md text-foreground">
                <span className="size-1.5 rounded-full bg-mint" aria-hidden />
                <span className="font-semibold">{activeNutrition.program_name}</span>
                <span className="text-muted-foreground">
                  • {t("subscribers.nutritionPlan.weekOf", { w: nutritionWeek ?? 1, n: activeNutrition.duration_weeks })}
                </span>
                {activeNutrition.adherence.pct != null && (
                  <span className="font-bold text-primary">
                    • {t("subscribers.nutritionPlan.adherencePct", { pct: activeNutrition.adherence.pct })}
                  </span>
                )}
              </span>
            </CardAction>
          )}
        </CardHeader>
        {nutritionEnrollments.length > 0 && (
          <CardContent className="space-y-5">
            {/* Non-active enrollments stay listed (honest history, no fake state) */}
            {otherNutritionEnrollments.length > 0 && (
              <div className="space-y-2">
                {otherNutritionEnrollments.map((ne) => (
                  <div key={ne.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                    <p className="text-body-sm font-medium text-foreground">{ne.program_name}</p>
                    <p className="text-body-sm text-faint">
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
                    <StatusBadge tone={statusTone(ne.status)} className="ms-auto">
                      {subLabel(ne.status)}
                    </StatusBadge>
                    <GlobalLink
                      href={`/dashboard/subscribers/${id}/nutrition/${ne.id}`}
                      className="inline-flex items-center text-label-md font-medium text-primary hover:underline"
                    >
                      {t("subscribers.shared.viewFull")}
                    </GlobalLink>
                  </div>
                ))}
              </div>
            )}

            {todayNutrition.length > 0 && (
              <div className="space-y-2">
                <p className="text-label-sm uppercase tracking-wider text-faint">
                  {t("subscribers.nutritionPlan.todayMeals")}
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {todayNutrition.map((m, mi) => {
                    const hasSwap = m.foods.some((f) => f.change_type && f.current_food_name);
                    return (
                      <div
                        key={m.assignmentId}
                        className={`flex flex-col gap-2.5 rounded-xl bg-secondary/50 p-4 ${
                          hasSwap ? "ring-1 ring-primary/30" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label-sm uppercase tracking-wider text-faint">
                            {t("subscribers.nutritionPlan.mealLabel", { n: mi + 1 })}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-label-sm font-semibold ${
                              m.status === "completed"
                                ? "bg-mint/15 text-mint"
                                : m.status === "skipped"
                                  ? "bg-[#ea7a72]/15 text-[#ea7a72]"
                                  : "bg-accent text-muted-foreground"
                            }`}
                          >
                            {wsLabel(m.status)}
                          </span>
                        </div>
                        <p className="font-display text-headline-sm tracking-tight text-foreground">{m.meal_name}</p>
                        <ul className="space-y-1.5">
                          {m.foods.map((f, i) => (
                            <li key={i} className="text-body-sm">
                              {f.change_type && f.current_food_name ? (
                                <div className="rounded bg-background/80 p-2">
                                  <p className="flex items-center gap-1.5 text-primary">
                                    <CornerDownRight className="size-3.5 shrink-0" />
                                    <span className="font-semibold">
                                      {f.current_food_name} — {f.current_quantity} {f.serving_unit}
                                    </span>
                                  </p>
                                  <p className="ps-5 text-body-sm text-faint line-through">
                                    {f.food_name} — {f.prescribed_quantity} {f.serving_unit}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 text-foreground">
                                    {f.food_name} — {f.prescribed_quantity} {f.serving_unit}
                                    {f.change_type && f.current_quantity != null && (
                                      <span className="font-semibold text-primary">
                                        {" "}
                                        {t("subscribers.nutritionPlan.adjustedTo", {
                                          qty: f.current_quantity,
                                          unit: f.serving_unit ?? "",
                                        })}
                                      </span>
                                    )}
                                    {f.change_type && f.current_quantity == null && (
                                      <span className="font-semibold text-primary">
                                        {" "}
                                        {t("subscribers.nutritionPlan.adjusted")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-foreground">
                                    {fmt.num(Math.round(f.calories))} kcal
                                  </span>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-auto border-t border-border/60 pt-2 text-label-sm tabular-nums text-faint">
                          {fmt.num(m.totals.calories)} kcal ·{" "}
                          {t("subscribers.nutritionPlan.macrosLine", {
                            p: fmt.num(m.totals.protein_g),
                            c: fmt.num(m.totals.carbs_g),
                            f: fmt.num(m.totals.fat_g),
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {nutritionChanges.length > 0 && (
              <CollapsibleSection
                title={t("subscribers.nutritionPlan.clientChanges")}
                description={t("subscribers.nutritionPlan.changesDesc", { n: nutritionChanges.length })}
              >
                <ul className="space-y-1.5">
                  {nutritionChanges.map((c) => (
                    <li key={c.id} className="rounded-lg border px-3 py-2 text-body-sm">
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
                        <TableCell className="tabular-nums">{fmt.date(n.logged_date)}</TableCell>
                        <TableCell>{n.meal_type ?? "—"}</TableCell>
                        <TableCell>{n.food_name ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {n.quantity ?? "—"} {n.serving_unit ?? ""}
                        </TableCell>
                        <TableCell className="tabular-nums">{n.calories ?? 0}</TableCell>
                        <TableCell className="tabular-nums">
                          {n.protein_g ?? 0} / {n.carbs_g ?? 0} / {n.fat_g ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                    {nutrition.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-body-sm text-muted-foreground">
                          {t("subscribers.nutrition.tableEmpty")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleSection>
          </CardContent>
        )}
      </Card>

      {/* ── Nutrition trends for the active enrollment ─────────────────────── */}
      {nutritionDetail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t("subscribers.trends.title")}</CardTitle>
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

      {/* ── Exercise results & session breakdown ────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full bg-primary" aria-hidden />
              <div>
                <h2 className="font-display text-headline-md tracking-tight text-foreground">
                  {t("subscribers.exerciseResults.title")}
                </h2>
                <p className="text-body-sm text-faint">{t("subscribers.exerciseResults.subtitle")}</p>
              </div>
            </div>
            {reviewTarget && (
              <Button
                render={<GlobalLink href={`/dashboard/subscribers/${sub.id}/workouts/${reviewTarget.id}`} />}
                variant="secondary"
                size="sm"
              >
                {t("subscribers.exerciseResults.duplicate")}
              </Button>
            )}
          </div>
          <ExerciseResults sessionVolume={exerciseVolume} exercises={topExercises} />
        </CardContent>
      </Card>

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
                  <p className="text-body-sm font-medium">{s.session_name ?? t("subscribers.sessions.workoutFallback")}</p>
                  {s.muscle_group && <Badge variant="secondary">{s.muscle_group}</Badge>}
                  <span className="ms-auto text-body-sm tabular-nums text-muted-foreground">
                    {s.session_date
                      ? t("subscribers.sessions.meta", { date: fmt.date(s.session_date), n: s.duration_min ?? 0 })
                      : t("subscribers.assignmentPage.duration", { n: s.duration_min ?? 0 })}
                  </span>
                </div>
                {sessionSets.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sessionSets.map((st) => (
                      <li key={st.id} className="text-body-sm tabular-nums text-muted-foreground">
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
            <p className="text-body-sm text-muted-foreground">{t("subscribers.sessions.empty")}</p>
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
              <StatusBadge tone="neutral">{t("subscribers.assigned.upcomingBadge", { n: upcoming.length })}</StatusBadge>
            )}
            {completed.length > 0 && (
              <StatusBadge tone="emerald">{t("subscribers.assigned.completedBadge", { n: completed.length })}</StatusBadge>
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
            <p className="text-body-sm text-muted-foreground">{t("subscribers.assigned.empty")}</p>
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
                <p className="text-label-sm uppercase tracking-wider text-faint">{section.title}</p>
                <ul className="space-y-2">
                  {section.rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium">
                          {a.template?.name ?? t("subscribers.sessions.workoutFallback")}
                        </p>
                        <p className="text-body-sm tabular-nums text-muted-foreground">
                          {t("subscribers.assigned.scheduled", { date: fmt.date(a.scheduled_date) })}
                          {a.program_id ? t("subscribers.assigned.viaProgram") : ""}
                        </p>
                      </div>
                      <StatusBadge tone={WORKOUT_TONE[a.status] ?? "neutral"} className="ms-auto">
                        {wsLabel(a.status)}
                      </StatusBadge>
                      <Button
                        render={<GlobalLink href={`/dashboard/subscribers/${sub.id}/workouts/${a.id}`} />}
                        variant="secondary"
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
            <StatusBadge tone="emerald">
              {t("subscribers.programsSection.activeBadge", {
                n: enrollments.filter((e) => e.status === "active").length,
              })}
            </StatusBadge>
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
            <p className="text-body-sm text-muted-foreground">{t("subscribers.programsSection.empty")}</p>
          )}
          {enrollments.map((en) => (
            <div key={en.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-body-sm font-medium">{en.program_name}</p>
                <p className="text-body-sm tabular-nums text-muted-foreground">
                  {t("subscribers.programsSection.meta", { date: fmt.date(en.start_date), weeks: en.duration_weeks })}
                </p>
              </div>
              <StatusBadge tone={statusTone(en.status)} className="ms-auto">
                {subLabel(en.status)}
              </StatusBadge>
              <Button render={<GlobalLink href={`/dashboard/subscribers/${sub.id}/programs/${en.id}`} />} variant="secondary" size="sm">
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
                  <TableCell className="tabular-nums">{fmt.date(d.summary_date)}</TableCell>
                  <TableCell className="tabular-nums">{d.calories_consumed ?? 0} kcal</TableCell>
                  <TableCell className="tabular-nums">{d.protein_g ?? 0} g</TableCell>
                  <TableCell className="tabular-nums">{fmt.num(d.steps ?? 0)}</TableCell>
                  <TableCell className="tabular-nums">{d.water_ml ?? 0} ml</TableCell>
                  <TableCell className="tabular-nums">{d.sleep_hours ?? 0} h</TableCell>
                  <TableCell>
                    {d.workout_done ? (
                      <StatusBadge tone="emerald">{t("subscribers.daily.done")}</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">{t("subscribers.daily.rest")}</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-body-sm text-muted-foreground">
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
                  <TableCell className="tabular-nums">{fmt.date(m.measured_date)}</TableCell>
                  <TableCell className="tabular-nums">{m.weight_kg != null ? `${m.weight_kg} kg` : "—"}</TableCell>
                  <TableCell className="tabular-nums">{m.body_fat_pct != null ? `${m.body_fat_pct}%` : "—"}</TableCell>
                  <TableCell className="tabular-nums">{m.waist_cm != null ? `${m.waist_cm} cm` : "—"}</TableCell>
                </TableRow>
              ))}
              {measurements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-body-sm text-muted-foreground">
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
