import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { loadAssignedWorkouts, loadClientProgress } from "@/lib/workouts";
import { loadClientEnrollments } from "@/lib/programs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Flame, Footprints, Dumbbell, Scale, TrendingUp, Trophy } from "lucide-react";

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
};

type Measurement = {
  id: string;
  measured_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
};

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const [assigned, progress, enrollments] = await Promise.all([
    loadAssignedWorkouts(coachId, clientId),
    loadClientProgress(coachId, clientId),
    loadClientEnrollments(coachId, clientId),
  ]);
  const upcoming = assigned
    .filter((a) => a.status === "assigned")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const inProgress = assigned.filter((a) => a.status === "started");
  const completed = assigned.filter((a) => a.status === "completed");
  const skipped = assigned.filter((a) => a.status === "skipped");

  const statusLabel: Record<string, string> = {
    assigned: "Assigned",
    started: "In progress",
    completed: "Completed",
    skipped: "Skipped",
  };

  // ── Customer logged data (shared DB; RLS lets a coach read subscribed clients)
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
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

  // Sets for the latest sessions (single query, grouped in memory)
  const sessionIds = sessions.slice(0, 3).map((s) => s.id);
  const { data: setsData } = sessionIds.length
    ? await supabase
        .from("workout_sets")
        .select("id, session_id, exercise_name, set_number, reps, weight_kg")
        .in("session_id", sessionIds)
        .order("logged_at", { ascending: true })
        .limit(120)
    : { data: [] as unknown[] };
  const sets = (setsData ?? []) as unknown as WorkoutSet[];

  // ── Derived numbers
  const today = summaries[0] ?? null;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const workoutsThisWeek = sessions.filter((s) => (s.session_date ?? "") >= weekAgo).length;
  const weights = measurements.filter((m) => m.weight_kg != null);
  const latestWeight = weights[0]?.weight_kg ?? null;
  const firstWeight = weights.length >= 2 ? weights[weights.length - 1].weight_kg : null;
  const weightDelta =
    latestWeight != null && firstWeight != null ? Math.round((latestWeight - firstWeight) * 10) / 10 : null;

  const name = sub.client.full_name ?? sub.client.email ?? "Client";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/subscribers" className="hover:text-foreground">← Subscribers</Link>
      </div>
      <h1 className="-mt-4 text-2xl font-bold tracking-tight">Customer profile</h1>

      {/* Identity + subscription */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription>{sub.client.email ?? ""}</CardDescription>
          </div>
          <Badge className="ml-auto" variant={sub.status === "active" ? "default" : "secondary"}>
            {sub.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="font-medium">{sub.plan?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="font-medium">{sub.plan?.price_usd != null ? `$${sub.plan.price_usd.toFixed(2)}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="text-sm">{new Date(sub.start_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">End</p>
            <p className="text-sm">{sub.end_date ? new Date(sub.end_date).toLocaleDateString() : "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Key stats vs goals */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Calories (latest day)</CardTitle>
            <Flame className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{today?.calories_consumed ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {goals?.daily_calories ? `Goal ${goals.daily_calories} kcal` : "No goal set"}
              {today ? ` · ${today.summary_date}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Steps (latest day)</CardTitle>
            <Footprints className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(today?.steps ?? 0).toLocaleString("en-US")}</div>
            <p className="text-xs text-muted-foreground">
              {goals?.daily_steps ? `Goal ${goals.daily_steps.toLocaleString("en-US")}` : "No goal set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Workouts (this week)</CardTitle>
            <Dumbbell className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workoutsThisWeek}</div>
            <p className="text-xs text-muted-foreground">
              {goals?.weekly_workouts ? `Goal ${goals.weekly_workouts}/week` : "No goal set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Weight</CardTitle>
            <Scale className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestWeight != null ? `${latestWeight} kg` : "—"}</div>
            <p className="text-xs text-muted-foreground">
              {weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta} kg since first log` : "Need 2+ logs"}
              {goals?.target_weight_kg ? ` · Target ${goals.target_weight_kg} kg` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Assigned workouts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned workouts</CardTitle>
          <CardDescription>
            Templates assigned to this client. Completed workouts open a target-vs-actual performance review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {assigned.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No assigned workouts yet. Create a template in Workouts, then assign it to this client.
            </p>
          )}

          {[
            { title: "Upcoming", rows: upcoming },
            { title: "In progress", rows: inProgress },
            { title: "Completed", rows: completed },
            { title: "Skipped", rows: skipped },
          ]
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <div key={section.title} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                <ul className="space-y-2">
                  {section.rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{a.template?.name ?? "Workout"}</p>
                        <p className="text-xs text-muted-foreground">
                          Scheduled {a.scheduled_date}
                          {a.program_id ? " · via program" : ""}
                        </p>
                      </div>
                      <Badge
                        className="ml-auto"
                        variant={a.status === "completed" ? "default" : a.status === "skipped" ? "secondary" : "outline"}
                      >
                        {statusLabel[a.status] ?? a.status}
                      </Badge>
                      <Button
                        render={
                          <Link href={`/dashboard/subscribers/${sub.id}/workouts/${a.id}`} />
                        }
                        variant="outline"
                        size="sm"
                      >
                        {a.status === "completed" || a.status === "started" ? "Review" : "View"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Programs — weekly enrollments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programs</CardTitle>
          <CardDescription>
            Weekly program enrollments. Open one to see the weeks × days progress grid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {enrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No program enrollments yet. Create a program in Programs, then enroll this client.
            </p>
          )}
          {enrollments.map((en) => (
            <div key={en.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{en.program_name}</p>
                <p className="text-xs text-muted-foreground">
                  {en.start_date} · {en.duration_weeks} weeks
                </p>
              </div>
              <Badge
                className="ml-auto"
                variant={en.status === "active" ? "default" : en.status === "completed" ? "outline" : "secondary"}
              >
                {en.status}
              </Badge>
              <Button
                render={<Link href={`/dashboard/subscribers/${sub.id}/programs/${en.id}`} />}
                variant="outline"
                size="sm"
              >
                Open progress
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Progress — weekly volume + PRs from real records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
          <CardDescription>
            Weekly training volume and personal records, computed from the app&apos;s workout logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!progress ? (
            <p className="text-sm text-muted-foreground">Progress becomes available once this client is one of your subscribers.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Sessions (30 days)</p>
                  <p className="text-2xl font-extrabold">{progress.sessionsLast30}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed assignments</p>
                  <p className="text-2xl font-extrabold">{progress.completedAssignments}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Volume (this week)</p>
                  <p className="text-2xl font-extrabold">
                    {(progress.weekly[progress.weekly.length - 1]?.volume ?? 0).toLocaleString("en-US")} kg
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="size-3.5" /> Weekly volume (8 weeks)
                </p>
                {progress.weekly.every((w) => w.volume === 0) ? (
                  <p className="text-sm text-muted-foreground">No logged volume in the last 8 weeks yet.</p>
                ) : (
                  <div className="flex h-32 items-end gap-2">
                    {progress.weekly.map((w) => {
                      const max = Math.max(...progress.weekly.map((x) => x.volume), 1);
                      return (
                        <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">
                            {w.volume > 0 ? `${(w.volume / 1000).toFixed(1)}t` : ""}
                          </span>
                          <div
                            className="w-full rounded-t-md bg-primary/70"
                            style={{ height: `${Math.max((w.volume / max) * 100, w.volume > 0 ? 4 : 1)}%` }}
                            title={`${w.weekStart}: ${w.volume.toLocaleString("en-US")} kg · ${w.sessions} sessions`}
                          />
                          <span className="text-[10px] text-muted-foreground">{w.weekStart.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Trophy className="size-3.5" /> Personal records
                </p>
                {progress.prs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No personal records logged yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {progress.prs.slice(0, 6).map((pr) => (
                      <div key={pr.exercise_name} className="rounded-lg border p-3">
                        <p className="text-sm font-medium">{pr.exercise_name}</p>
                        <p className="text-lg font-extrabold">
                          {pr.max_weight != null ? `${Number(pr.max_weight)} kg` : "—"}
                          {pr.reps != null ? <span className="text-xs font-normal text-muted-foreground"> × {pr.reps}</span> : null}
                        </p>
                        {pr.achieved_date && <p className="text-xs text-muted-foreground">{pr.achieved_date}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Daily summaries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily summaries (last 14 days)</CardTitle>
          <CardDescription>From daily_summary — auto-maintained by the app&apos;s triggers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Calories</TableHead>
                <TableHead>Protein</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Water</TableHead>
                <TableHead>Sleep</TableHead>
                <TableHead>Workout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((d) => (
                <TableRow key={d.summary_date}>
                  <TableCell>{d.summary_date}</TableCell>
                  <TableCell>{d.calories_consumed ?? 0} kcal</TableCell>
                  <TableCell>{d.protein_g ?? 0} g</TableCell>
                  <TableCell>{(d.steps ?? 0).toLocaleString("en-US")}</TableCell>
                  <TableCell>{d.water_ml ?? 0} ml</TableCell>
                  <TableCell>{d.sleep_hours ?? 0} h</TableCell>
                  <TableCell>{d.workout_done ? <Badge>done</Badge> : <Badge variant="secondary">rest</Badge>}</TableCell>
                </TableRow>
              ))}
              {summaries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No daily summaries logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Nutrition */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nutrition logs (recent)</CardTitle>
          <CardDescription>Meal-level entries from the app&apos;s food scanner and logger.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Meal</TableHead>
                <TableHead>Food</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>kcal</TableHead>
                <TableHead>P / C / F</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nutrition.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{n.logged_date}</TableCell>
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
                    No nutrition logs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Workouts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workout sessions</CardTitle>
          <CardDescription>Sessions logged in the app, with the sets of the latest ones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions.map((s) => {
            const sessionSets = sets.filter((st) => st.session_id === s.id);
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{s.session_name ?? "Workout"}</p>
                  {s.muscle_group && <Badge variant="secondary">{s.muscle_group}</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {s.session_date ? new Date(s.session_date).toLocaleDateString() : ""} · {s.duration_min ?? 0} min
                  </span>
                </div>
                {sessionSets.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sessionSets.map((st) => (
                      <li key={st.id} className="text-xs text-muted-foreground">
                        {st.exercise_name ?? "Exercise"} — set {st.set_number ?? 1}: {st.reps ?? 0} reps
                        {st.weight_kg != null ? ` @ ${st.weight_kg} kg` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">No workout sessions logged yet.</p>}
        </CardContent>
      </Card>

      {/* Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Body measurements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Body fat</TableHead>
                <TableHead>Waist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measurements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.measured_date}</TableCell>
                  <TableCell>{m.weight_kg != null ? `${m.weight_kg} kg` : "—"}</TableCell>
                  <TableCell>{m.body_fat_pct != null ? `${m.body_fat_pct}%` : "—"}</TableCell>
                  <TableCell>{m.waist_cm != null ? `${m.waist_cm} cm` : "—"}</TableCell>
                </TableRow>
              ))}
              {measurements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    No measurements logged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
