import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import type {
  PersonalRecord,
  WorkoutAssignment,
  WorkoutSetLog,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from "@/lib/supabase/types";

// ── Small shared helpers ─────────────────────────────────────────────────────

// Date-only string for N days ago (server-rendered pages use this for query
// windows; kept outside components so render stays lint-pure).
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Whole days between two date-only strings (a - b).
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

// ── Coach context ────────────────────────────────────────────────────────────

export type CoachContext = { userId: string; coachId: string };

// Resolves the authenticated user to their coaches.id. Returns null when the
// visitor is not authenticated or has no coach row — callers return 401/403.
export async function requireCoachContext(): Promise<CoachContext | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) return null; // no coaches row yet
  return { userId: user.id, coachId };
}

// ── Clients ──────────────────────────────────────────────────────────────────

export type ActiveClient = {
  clientId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

// Active subscribers of the resolved coach (subscriptions.coach_id = coaches.id).
export async function loadActiveClients(coachId: string): Promise<ActiveClient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(
      `
      client_id,
      client:profiles(id, full_name, name, email, avatar_url)
      `
    )
    .eq("coach_id", coachId)
    .eq("status", "active");

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const byClient = new Map<string, ActiveClient>();
  for (const row of rows) {
    const clientId = row.client_id as string;
    if (byClient.has(clientId)) continue;
    const clientRaw = row.client as unknown;
    const c = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as
      | { full_name: string | null; name: string | null; email: string | null; avatar_url: string | null }
      | null
      | undefined;
    byClient.set(clientId, {
      clientId,
      name: c?.full_name || c?.name || c?.email || "Client",
      email: c?.email ?? null,
      avatarUrl: c?.avatar_url ?? null,
    });
  }
  return [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Exercise catalog (autocomplete) ─────────────────────────────────────────

export type ExerciseCatalogItem = { id: string; name: string; muscleGroup: string | null };

// The exercises table is the mobile app's shared catalog. Read with the user's
// context first; fall back to the service role if RLS on the catalog blocks
// coach reads — it contains no personal data, only exercise names.
export async function loadExerciseCatalog(): Promise<ExerciseCatalogItem[]> {
  const supabase = await createClient();
  let { data, error } = await supabase.from("exercises").select("id, name, muscle_group").order("name");
  if (error) {
    const svc = await createServiceClient();
    const res = await svc.from("exercises").select("id, name, muscle_group").order("name");
    data = res.data;
    error = res.error;
  }
  if (error) return [];
  const rows = (data ?? []) as unknown as { id: string; name: string | null; muscle_group: string | null }[];
  return rows
    .filter((r) => r.name)
    .map((r) => ({ id: r.id, name: r.name as string, muscleGroup: r.muscle_group ?? null }));
}

// ── Assigned workouts (client profile) ───────────────────────────────────────

export type AssignedWorkout = WorkoutAssignment & { template: WorkoutTemplate | null };

export async function loadAssignedWorkouts(
  coachId: string,
  clientId: string
): Promise<AssignedWorkout[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_assignments")
    .select(
      `
      id, template_id, coach_id, client_id, program_id, scheduled_date, status, created_at,
      template:workout_templates(id, name, target_muscles, notes, updated_at)
      `
    )
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((raw) => {
    const templateRaw = raw.template as unknown;
    const template = (Array.isArray(templateRaw) ? templateRaw[0] : templateRaw) as
      | WorkoutTemplate
      | null;
    return {
      id: raw.id as string,
      template_id: raw.template_id as string,
      coach_id: raw.coach_id as string,
      client_id: raw.client_id as string,
      program_id: (raw.program_id as string | null) ?? null,
      scheduled_date: raw.scheduled_date as string,
      status: raw.status as WorkoutAssignment["status"],
      created_at: raw.created_at as string,
      template,
    };
  });
}

// ── Performance review (target vs actual) ────────────────────────────────────

export type ExercisePerformance = {
  exerciseName: string;
  orderIndex: number;
  targetSets: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  restSec: number | null;
  notes: string | null;
  // Actual data — empty arrays when the mobile app has not linked a session yet
  actualSets: WorkoutSetLog[]; // working sets only, in logged order
  warmupSets: WorkoutSetLog[];
  bestWeightKg: number | null;
  bestReps: number | null; // reps achieved at the best weight
  totalVolume: number; // Σ reps × weight over working sets
  completionPct: number | null; // working sets / target sets
};

export type AssignmentPerformance = {
  assignment: WorkoutAssignment;
  template: WorkoutTemplate;
  templateExercises: WorkoutTemplateExercise[];
  exercises: ExercisePerformance[];
  session: WorkoutSession | null;
  durationMin: number | null;
  clientNote: string | null;
  totalVolume: number;
  completedSets: number;
  targetSetsTotal: number;
};

// "Bench Press" / "bench  press" / "Bench press" must match each other.
function normalizeExerciseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Loads everything the review screen needs. All reads go through the service
// role, but only after the caller verifies the assignment belongs to the
// resolved coach and the requested client — the service role bypasses RLS, so
// those checks are what actually protect the data.
export async function loadAssignmentPerformance(
  coachId: string,
  clientId: string,
  assignmentId: string
): Promise<AssignmentPerformance | null> {
  const svc = await createServiceClient();

  const { data: assignmentRaw } = await svc
    .from("workout_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!assignmentRaw) return null;
  const assignment = assignmentRaw as unknown as WorkoutAssignment;

  const [{ data: templateRaw }, { data: exercisesRaw }] = await Promise.all([
    svc.from("workout_templates").select("*").eq("id", assignment.template_id).maybeSingle(),
    svc
      .from("workout_template_exercises")
      .select("*")
      .eq("template_id", assignment.template_id)
      .order("order_index", { ascending: true }),
  ]);
  if (!templateRaw) return null;
  const template = templateRaw as unknown as WorkoutTemplate;
  const templateExercises = (exercisesRaw ?? []) as unknown as WorkoutTemplateExercise[];

  // The mobile app links the executed session via workout_sessions.assignment_id
  const { data: sessionsRaw } = await svc
    .from("workout_sessions")
    .select("*")
    .eq("assignment_id", assignment.id)
    .order("started_at", { ascending: false })
    .limit(1);
  const session = ((sessionsRaw ?? [])[0] ?? null) as WorkoutSession | null;

  let sets: WorkoutSetLog[] = [];
  if (session) {
    const { data: setsRaw } = await svc
      .from("workout_sets")
      .select("*")
      .eq("session_id", session.id)
      .order("logged_at", { ascending: true })
      .limit(1000);
    sets = (setsRaw ?? []) as unknown as WorkoutSetLog[];
  }

  const byNormalizedName = new Map<string, WorkoutSetLog[]>();
  for (const set of sets) {
    const key = normalizeExerciseName(set.exercise_name ?? "");
    const list = byNormalizedName.get(key) ?? [];
    list.push(set);
    byNormalizedName.set(key, list);
  }

  let totalVolume = 0;
  let completedSets = 0;
  let targetSetsTotal = 0;

  const exercises: ExercisePerformance[] = templateExercises.map((tpl) => {
    const all = byNormalizedName.get(normalizeExerciseName(tpl.exercise_name)) ?? [];
    const actualSets = all.filter((s) => !s.is_warmup);
    const warmupSets = all.filter((s) => s.is_warmup);

    let volume = 0;
    let bestWeightKg: number | null = null;
    let bestReps: number | null = null;
    for (const s of actualSets) {
      const w = s.weight_kg != null ? Number(s.weight_kg) : null;
      if (w != null && s.reps != null) volume += w * s.reps;
      if (w != null && (bestWeightKg == null || w > bestWeightKg)) {
        bestWeightKg = w;
        bestReps = s.reps;
      } else if (w != null && w === bestWeightKg && s.reps != null && (bestReps == null || s.reps > bestReps)) {
        bestReps = s.reps;
      }
    }

    totalVolume += volume;
    completedSets += actualSets.length;
    targetSetsTotal += tpl.target_sets;

    return {
      exerciseName: tpl.exercise_name,
      orderIndex: tpl.order_index,
      targetSets: tpl.target_sets,
      targetReps: tpl.target_reps,
      targetWeightKg: tpl.target_weight_kg != null ? Number(tpl.target_weight_kg) : null,
      restSec: tpl.rest_sec,
      notes: tpl.notes,
      actualSets,
      warmupSets,
      bestWeightKg,
      bestReps,
      totalVolume: Math.round(volume),
      completionPct: tpl.target_sets > 0 ? Math.round((actualSets.length / tpl.target_sets) * 100) : null,
    };
  });

  let durationMin = session?.duration_min ?? null;
  if ((durationMin == null || durationMin === 0) && session?.started_at && session?.ended_at) {
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (ms > 0) durationMin = Math.round(ms / 60000);
  }

  return {
    assignment,
    template,
    templateExercises,
    exercises,
    session,
    durationMin,
    clientNote: session?.notes ?? null,
    totalVolume: Math.round(totalVolume),
    completedSets,
    targetSetsTotal,
  };
}

// ── Client progress (weekly volume + PRs) ────────────────────────────────────

export type WeeklyVolume = { weekStart: string; volume: number; sessions: number };

export type ClientProgress = {
  weekly: WeeklyVolume[]; // oldest → newest, gaps included as zero weeks
  prs: PersonalRecord[];
  sessionsLast30: number;
  completedAssignments: number;
};

// Monday of the week containing the given date-only string.
function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export async function loadClientProgress(coachId: string, clientId: string): Promise<ClientProgress | null> {
  // Ownership gate: the client must be this coach's via the assignment or
  // subscription tables before any service-role read happens.
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!sub) return null;

  const svc = await createServiceClient();
  const since = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);

  const [{ data: sessionsRaw }, { data: prRaw }] = await Promise.all([
    svc
      .from("workout_sessions")
      .select("id, session_date")
      .eq("user_id", clientId)
      .gte("session_date", since)
      .order("session_date", { ascending: true }),
    svc
      .from("personal_records")
      .select("user_id, exercise_name, max_weight, reps, achieved_date")
      .eq("user_id", clientId)
      .order("max_weight", { ascending: false })
      .limit(12),
  ]);

  const sessions = (sessionsRaw ?? []) as unknown as { id: string; session_date: string | null }[];

  let volumeByWeek = new Map<string, number>();
  if (sessions.length > 0) {
    const { data: setsRaw } = await svc
      .from("workout_sets")
      .select("session_id, reps, weight_kg, is_warmup")
      .in(
        "session_id",
        sessions.map((s) => s.id)
      )
      .limit(5000);
    const volumeBySession = new Map<string, number>();
    for (const s of (setsRaw ?? []) as unknown as {
      session_id: string;
      reps: number | null;
      weight_kg: number | null;
      is_warmup: boolean | null;
    }[]) {
      if (s.is_warmup || s.reps == null || s.weight_kg == null) continue;
      volumeBySession.set(s.session_id, (volumeBySession.get(s.session_id) ?? 0) + s.reps * Number(s.weight_kg));
    }
    for (const s of sessions) {
      const v = volumeBySession.get(s.id) ?? 0;
      const wk = weekStart(s.session_date ?? new Date().toISOString().slice(0, 10));
      volumeByWeek.set(wk, (volumeByWeek.get(wk) ?? 0) + v);
    }
  }

  // Fill the full 8-week window so gaps render as zero-height bars
  const weekly: WeeklyVolume[] = [];
  const now = new Date();
  const thisMonday = weekStart(now.toISOString().slice(0, 10));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(`${thisMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const wk = d.toISOString().slice(0, 10);
    weekly.push({ weekStart: wk, volume: Math.round(volumeByWeek.get(wk) ?? 0), sessions: 0 });
  }
  volumeByWeek = new Map();
  const sessionCountByWeek = new Map<string, number>();
  for (const s of sessions) {
    const wk = weekStart(s.session_date ?? "");
    sessionCountByWeek.set(wk, (sessionCountByWeek.get(wk) ?? 0) + 1);
  }
  for (const w of weekly) w.sessions = sessionCountByWeek.get(w.weekStart) ?? 0;

  const { count: completedCount } = await svc
    .from("workout_assignments")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("status", "completed");

  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sessionsLast30 = sessions.filter((s) => (s.session_date ?? "") >= thirtyAgo).length;

  return {
    weekly,
    prs: (prRaw ?? []) as unknown as PersonalRecord[],
    sessionsLast30,
    completedAssignments: completedCount ?? 0,
  };
}
