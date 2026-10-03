import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import type {
  AssignmentStatus,
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

// True when an ISO timestamp falls inside the last N days (request-time "now";
// kept outside components so render stays lint-pure).
export function isWithinDays(timestamp: string, days: number): boolean {
  return Date.now() - new Date(timestamp).getTime() < days * 86400000;
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
// P-11: defensively bounded — the roster page and every dropdown caller only
// renders a slice of this list; the cap only engages on pathological data.
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
    .eq("status", "active")
    .limit(1000);

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
  // P-11: defensive cap — the catalog feeds autocomplete, never a full render.
  let { data, error } = await supabase
    .from("exercises")
    .select("id, name, muscle_group")
    .order("name")
    .limit(2000);
  if (error) {
    const svc = await createServiceClient();
    const res = await svc.from("exercises").select("id, name, muscle_group").order("name").limit(2000);
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

// ── Pure performance math (framework-free, unit-tested) ─────────────────────
// Lives in ./performance-math so node --test can import it without the
// server-only Supabase chain; re-exported here for existing importers.
import { computeExerciseStats, resolveSessionDurationMin } from "@/lib/performance-math";
export { computeExerciseStats, resolveSessionDurationMin } from "@/lib/performance-math";
export type { ExerciseStats } from "@/lib/performance-math";

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

  // F-03: a failed ownership read is a query error, not a missing row — throw
  // so the error boundary renders, and reserve null for "query succeeded,
  // nothing matched" (missing or foreign-owned → caller renders 404).
  // P-10: explicit columns (the typed row) — select * would also ship the
  // live table's week_number/enrollment_id columns the dashboard never reads.
  const { data: assignmentRaw, error: assignmentErr } = await svc
    .from("workout_assignments")
    .select(
      "id, template_id, coach_id, client_id, program_id, scheduled_date, status, created_at"
    )
    .eq("id", assignmentId)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (assignmentErr) throw new Error(`assignment load failed: ${assignmentErr.message}`);
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
    // Pure per-exercise math (unit-tested in tests/exercise-performance.test.ts).
    const stats = computeExerciseStats(tpl, all);

    totalVolume += stats.volume;
    completedSets += stats.actualSets.length;
    targetSetsTotal += tpl.target_sets;

    return {
      exerciseName: tpl.exercise_name,
      orderIndex: tpl.order_index,
      targetSets: tpl.target_sets,
      targetReps: tpl.target_reps,
      targetWeightKg: tpl.target_weight_kg != null ? Number(tpl.target_weight_kg) : null,
      restSec: tpl.rest_sec,
      notes: tpl.notes,
      actualSets: stats.actualSets,
      warmupSets: stats.warmupSets,
      bestWeightKg: stats.bestWeightKg,
      bestReps: stats.bestReps,
      totalVolume: Math.round(stats.volume),
      completionPct: stats.completionPct,
    };
  });

  const durationMin = resolveSessionDurationMin(session);

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

// ── Whole-prescription read (AI payload, batched — no per-assignment N+1) ────

export type PrescriptionExercise = {
  exercise_name: string;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_sec: number | null;
  notes: string | null;
  order_index: number;
};

export type PrescriptionDay = {
  scheduled_date: string; // YYYY-MM-DD
  week_number: number | null;
  status: AssignmentStatus;
  template_name: string | null;
  target_muscles: string[];
  template_notes: string | null;
  exercises: PrescriptionExercise[];
  session: { session_date: string | null; duration_min: number | null } | null;
};

export type ClientPrescription = {
  assignments: PrescriptionDay[]; // chronological, bounded to the window
  window: { since: string; until: string }; // echo of the applied bounds
  truncated: boolean; // true when more assignments existed than MAX
};

// Bounded caps for the AI payload (spec §13). A 52-week × 7-day enrollment is
// the structural max; the analysis window keeps the payload predictable.
export const PRESCRIPTION_MAX_ASSIGNMENTS = 120;
export const PRESCRIPTION_WINDOW_DAYS = 28; // recent-performance window

// One batched fetch of a client's assigned workouts + their templates +
// exercises + linked sessions (session ids only — sets are aggregated
// elsewhere, never sent raw). All reads go through the service role AFTER
// the caller has verified the client belongs to the resolved coach (same
// contract as loadAssignmentPerformance). Bounded by an explicit window and
// a row cap so a malformed enrollment cannot fan the payload out.
export async function loadClientPrescription(
  coachId: string,
  clientId: string,
  options?: { windowDays?: number; maxAssignments?: number }
): Promise<ClientPrescription> {
  const windowDays = Math.max(1, Math.min(options?.windowDays ?? PRESCRIPTION_WINDOW_DAYS, 365));
  const maxAssignments = Math.max(1, Math.min(options?.maxAssignments ?? PRESCRIPTION_MAX_ASSIGNMENTS, 500));
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const svc = await createServiceClient();

  // 1) Assignments in the window (bounded) + total count for truncation flag.
  //    Chronological order; the cap keeps the LATEST rows (analysis cares
  //    most about recent scheduling).
  const [{ count }, { data: assignmentsRaw }] = await Promise.all([
    svc
      .from("workout_assignments")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .gte("scheduled_date", since),
    svc
      .from("workout_assignments")
      .select("id, scheduled_date, status, week_number, template_id")
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .gte("scheduled_date", since)
      .order("scheduled_date", { ascending: false })
      .limit(maxAssignments),
  ]);
  const total = count ?? 0;
  const assignmentRows = (assignmentsRaw ?? []) as unknown as {
    id: string;
    scheduled_date: string;
    status: AssignmentStatus;
    week_number: number | null;
    template_id: string;
  }[];

  const templateIds = [...new Set(assignmentRows.map((a) => a.template_id))];

  // 2) Batched templates + exercises + linked sessions (no per-assignment round trips).
  const [templatesRes, exercisesRes, sessionsRes] = await Promise.all([
    templateIds.length
      ? svc
          .from("workout_templates")
          .select("id, name, target_muscles, notes")
          .in("id", templateIds)
      : Promise.resolve({ data: [] as unknown[] }),
    templateIds.length
      ? svc
          .from("workout_template_exercises")
          .select("template_id, exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes, order_index")
          .in("template_id", templateIds)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    assignmentRows.length
      ? svc
          .from("workout_sessions")
          .select("id, assignment_id, session_date, duration_min")
          .in(
            "assignment_id",
            assignmentRows.map((a) => a.id)
          )
          .limit(maxAssignments)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const templateById = new Map<
    string,
    { name: string | null; target_muscles: string[] | null; notes: string | null }
  >();
  for (const t of (templatesRes.data ?? []) as unknown as {
    id: string;
    name: string | null;
    target_muscles: string[] | null;
    notes: string | null;
  }[]) {
    templateById.set(t.id, { name: t.name, target_muscles: t.target_muscles, notes: t.notes });
  }

  const exercisesByTemplate = new Map<string, PrescriptionExercise[]>();
  for (const e of (exercisesRes.data ?? []) as unknown as (PrescriptionExercise & { template_id: string })[]) {
    const list = exercisesByTemplate.get(e.template_id) ?? [];
    list.push({
      exercise_name: e.exercise_name,
      target_sets: e.target_sets,
      target_reps: e.target_reps,
      target_weight_kg: e.target_weight_kg != null ? Number(e.target_weight_kg) : null,
      rest_sec: e.rest_sec,
      notes: e.notes,
      order_index: e.order_index,
    });
    exercisesByTemplate.set(e.template_id, list);
  }

  // Session presence per assignment (latest session wins); id/dates only —
  // raw workout_sets are deliberately never loaded here (spec §13).
  const sessionByAssignment = new Map<
    string,
    { id: string; session_date: string | null; duration_min: number | null }
  >();
  for (const s of (sessionsRes.data ?? []) as unknown as {
    id: string;
    assignment_id: string | null;
    session_date: string | null;
    duration_min: number | null;
  }[]) {
    if (!s.assignment_id || sessionByAssignment.has(s.assignment_id)) continue;
    sessionByAssignment.set(s.assignment_id, { id: s.id, session_date: s.session_date, duration_min: s.duration_min });
  }

  // Chronological output; when capped, keep the most recent `maxAssignments`.
  const ordered = [...assignmentRows].reverse();
  const assignments: PrescriptionDay[] = ordered.map((a) => {
    const tpl = templateById.get(a.template_id);
    const session = sessionByAssignment.get(a.id) ?? null;
    return {
      scheduled_date: a.scheduled_date,
      week_number: a.week_number,
      status: a.status,
      template_name: tpl?.name ?? null,
      target_muscles: tpl?.target_muscles ?? [],
      template_notes: tpl?.notes ?? null,
      exercises: exercisesByTemplate.get(a.template_id) ?? [],
      session,
    };
  });

  return {
    assignments,
    window: { since, until: today },
    truncated: total > maxAssignments,
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

  // P-01: the completed-assignment head-count is independent of the session /
  // PR reads below — it previously ran as a separate sequential round trip
  // after the sets fetch and now joins the first parallel wave.
  const [{ data: sessionsRaw }, { data: prRaw }, completedRes] = await Promise.all([
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
    svc
      .from("workout_assignments")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .eq("status", "completed"),
  ]);
  const completedCount = completedRes.count;

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

  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sessionsLast30 = sessions.filter((s) => (s.session_date ?? "") >= thirtyAgo).length;

  return {
    weekly,
    prs: (prRaw ?? []) as unknown as PersonalRecord[],
    sessionsLast30,
    completedAssignments: completedCount ?? 0,
  };
}
