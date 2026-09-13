import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isoWeekday } from "@/lib/program-dates";
import type { AssignmentStatus } from "@/lib/supabase/types";

// ── Coach Program library ────────────────────────────────────────────────────

export type CoachProgramDay = {
  id: string;
  day_of_week: number; // ISO 1 = Monday .. 7 = Sunday
  template_id: string;
  templateName: string | null;
};

export type CoachProgram = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  days: CoachProgramDay[];
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek - 1] ?? `Day ${dayOfWeek}`;
}

export async function loadCoachPrograms(coachId: string): Promise<CoachProgram[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_programs")
    .select(
      `
      id, name, description, is_active, updated_at,
      days:coach_program_days(id, day_of_week, template_id, order_index, template:workout_templates(id, name))
      `
    )
    .eq("coach_id", coachId)
    .order("updated_at", { ascending: false });
  if (error) return []; // tables not migrated yet, or RLS error — render empty state

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((raw) => {
    const daysRaw = (raw.days ?? []) as unknown as Record<string, unknown>[];
    const days = daysRaw
      .map((d) => {
        const t = d.template as unknown;
        const template = (Array.isArray(t) ? t[0] : t) as { name: string } | null;
        return {
          id: d.id as string,
          day_of_week: d.day_of_week as number,
          template_id: d.template_id as string,
          templateName: template?.name ?? null,
        };
      })
      .sort((a, b) => a.day_of_week - b.day_of_week);
    return {
      id: raw.id as string,
      name: raw.name as string,
      description: (raw.description as string | null) ?? null,
      is_active: raw.is_active as boolean,
      updated_at: raw.updated_at as string,
      days,
    };
  });
}

// ── Enrollments (client profile) ─────────────────────────────────────────────

export type ProgramEnrollment = {
  id: string;
  program_id: string;
  program_name: string;
  start_date: string;
  duration_weeks: number;
  status: "active" | "paused" | "cancelled" | "completed";
  client_id: string;
};

export async function loadClientEnrollments(coachId: string, clientId: string): Promise<ProgramEnrollment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_program_enrollments")
    .select(
      `
      id, program_id, client_id, start_date, duration_weeks, status,
      program:coach_programs(name)
      `
    )
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("start_date", { ascending: false });
  if (error) return [];

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((raw) => {
    const p = raw.program as unknown;
    const program = (Array.isArray(p) ? p[0] : p) as { name: string } | null;
    return {
      id: raw.id as string,
      program_id: raw.program_id as string,
      program_name: program?.name ?? "Program",
      start_date: raw.start_date as string,
      duration_weeks: raw.duration_weeks as number,
      status: raw.status as ProgramEnrollment["status"],
      client_id: raw.client_id as string,
    };
  });
}

// ── Enrollment progress (weeks × days grid + adherence + volume) ─────────────

export type EnrollmentGridCell = {
  week: number;
  dayOfWeek: number;
  date: string;
  status: AssignmentStatus | null; // null = not generated (week-1 rest-before-start)
  assignmentId: string | null;
  templateName: string | null;
};

export type EnrollmentProgress = {
  enrollment: ProgramEnrollment;
  programDays: CoachProgramDay[];
  grid: EnrollmentGridCell[]; // week-major: week 1 cells, then week 2, ...
  totalAssignments: number;
  completedAssignments: number;
  weeklyVolume: { week: number; volume: number; sessions: number }[]; // 1..duration_weeks
  futureAssignedCount: number;
};

// All reads go through the service role AFTER the coach-ownership +
// client-match checks on the enrollment row.
export async function loadEnrollmentProgress(
  coachId: string,
  clientId: string,
  enrollmentId: string
): Promise<EnrollmentProgress | null> {
  const svc = await createServiceClient();

  const { data: enrollmentRaw } = await svc
    .from("client_program_enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!enrollmentRaw) return null;
  const e = enrollmentRaw as unknown as {
    id: string;
    program_id: string;
    client_id: string;
    start_date: string;
    duration_weeks: number;
    status: ProgramEnrollment["status"];
  };

  const [{ data: programRaw }, { data: daysRaw }, { data: assignmentsRaw }] = await Promise.all([
    svc.from("coach_programs").select("id, name").eq("id", e.program_id).maybeSingle(),
    svc
      .from("coach_program_days")
      .select("id, day_of_week, template_id, order_index, template:workout_templates(id, name)")
      .eq("program_id", e.program_id)
      .order("day_of_week"),
    svc
      .from("workout_assignments")
      .select("id, template_id, scheduled_date, status, week_number")
      .eq("enrollment_id", e.id)
      .order("scheduled_date"),
  ]);

  const program = programRaw as unknown as { name: string } | null;
  const daysRows = (daysRaw ?? []) as unknown as Record<string, unknown>[];
  const programDays: CoachProgramDay[] = daysRows
    .map((d) => {
      const t = d.template as unknown;
      const template = (Array.isArray(t) ? t[0] : t) as { name: string } | null;
      return {
        id: d.id as string,
        day_of_week: d.day_of_week as number,
        template_id: d.template_id as string,
        templateName: template?.name ?? null,
      };
    })
    .sort((a, b) => a.day_of_week - b.day_of_week);

  const assignments = (assignmentsRaw ?? []) as unknown as {
    id: string;
    template_id: string;
    scheduled_date: string;
    status: AssignmentStatus;
    week_number: number | null;
  }[];

  const templateNames = new Map<string, string>();
  for (const d of programDays) templateNames.set(d.template_id, d.templateName ?? "Workout");

  const byDate = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) byDate.set(a.scheduled_date, a);

  // weeks × days grid, mirroring the generation math
  const isoStart = isoWeekday(e.start_date);
  const grid: EnrollmentGridCell[] = [];
  for (let week = 1; week <= e.duration_weeks; week++) {
    for (const day of programDays) {
      if (week === 1 && day.day_of_week < isoStart) {
        grid.push({ week, dayOfWeek: day.day_of_week, date: "", status: null, assignmentId: null, templateName: day.templateName });
        continue;
      }
      const offset = (week - 1) * 7 + (day.day_of_week - isoStart);
      const d = new Date(`${e.start_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      const date = d.toISOString().slice(0, 10);
      const a = byDate.get(date);
      grid.push({
        week,
        dayOfWeek: day.day_of_week,
        date,
        status: a ? a.status : null,
        assignmentId: a?.id ?? null,
        templateName: day.templateName,
      });
    }
  }

  const completedAssignments = assignments.filter((a) => a.status === "completed").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureAssignedCount = assignments.filter(
    (a) => a.status === "assigned" && a.scheduled_date > todayStr
  ).length;

  // Volume trend scoped to this enrollment: sessions linked to this
  // enrollment's assignments, grouped by the assignment's week_number.
  const weeklyVolume: { week: number; volume: number; sessions: number }[] = Array.from(
    { length: e.duration_weeks },
    (_, i) => ({ week: i + 1, volume: 0, sessions: 0 })
  );
  if (assignments.length > 0) {
    const { data: sessionsRaw } = await svc
      .from("workout_sessions")
      .select("id, assignment_id")
      .in(
        "assignment_id",
        assignments.map((a) => a.id)
      )
      .limit(500);
    const sessions = (sessionsRaw ?? []) as unknown as { id: string; assignment_id: string | null }[];
    const assignmentById = new Map(assignments.map((a) => [a.id, a]));
    const volumeBySession = new Map<string, number>();
    if (sessions.length > 0) {
      const { data: setsRaw } = await svc
        .from("workout_sets")
        .select("session_id, reps, weight_kg, is_warmup")
        .in(
          "session_id",
          sessions.map((s) => s.id)
        )
        .limit(5000);
      for (const s of (setsRaw ?? []) as unknown as {
        session_id: string;
        reps: number | null;
        weight_kg: number | null;
        is_warmup: boolean | null;
      }[]) {
        if (s.is_warmup || s.reps == null || s.weight_kg == null) continue;
        volumeBySession.set(s.session_id, (volumeBySession.get(s.session_id) ?? 0) + s.reps * Number(s.weight_kg));
      }
    }
    for (const s of sessions) {
      const a = s.assignment_id ? assignmentById.get(s.assignment_id) : null;
      if (!a || a.week_number == null || a.week_number < 1 || a.week_number > e.duration_weeks) continue;
      weeklyVolume[a.week_number - 1].volume += Math.round(volumeBySession.get(s.id) ?? 0);
      weeklyVolume[a.week_number - 1].sessions += 1;
    }
  }

  return {
    enrollment: {
      id: e.id,
      program_id: e.program_id,
      program_name: program?.name ?? "Program",
      start_date: e.start_date,
      duration_weeks: e.duration_weeks,
      status: e.status,
      client_id: e.client_id,
    },
    programDays,
    grid,
    totalAssignments: assignments.length,
    completedAssignments,
    weeklyVolume,
    futureAssignedCount,
  };
}
