import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { generateEnrollmentDates } from "@/lib/program-dates";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Enroll a client into a Coach Program. The RPC creates the enrollment row
// and generates ALL workout_assignments for the whole duration in one
// transaction — no partial enrollments.
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const programId = String(body.program_id ?? "");
  const clientId = String(body.client_id ?? "");
  const startDate = String(body.start_date ?? "");
  const durationWeeks = Number(body.duration_weeks);

  if (!programId) return NextResponse.json({ error: "Program is required" }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "Client is required" }, { status: 400 });
  if (!DATE_RE.test(startDate) || Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime())) {
    return NextResponse.json({ error: "A valid start date is required" }, { status: 400 });
  }
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) {
    return NextResponse.json({ error: "Duration must be a positive whole number of weeks" }, { status: 400 });
  }

  const svc = await createServiceClient();

  // Program must belong to the resolved coach.
  const { data: program } = await svc
    .from("coach_programs")
    .select("id, coach_id")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 });
  if ((program as { coach_id: string }).coach_id !== ctx.coachId) {
    return NextResponse.json({ error: "This program belongs to another coach" }, { status: 403 });
  }

  // Client must be an active subscriber of this coach (§44 convention).
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1);
  if (!sub || sub.length === 0) {
    return NextResponse.json({ error: "Client must be an active subscriber of yours" }, { status: 400 });
  }

  const { data: enrollmentId, error } = await svc.rpc("create_program_enrollment_atomic", {
    p_program_id: programId,
    p_coach_id: ctx.coachId,
    p_client_id: clientId,
    p_start_date: startDate,
    p_duration_weeks: durationWeeks,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Expected assignment count comes from the same pure, unit-tested math the
  // SQL uses — surfaced so the UI can confirm what was generated.
  const { data: daysRaw } = await svc
    .from("coach_program_days")
    .select("day_of_week")
    .eq("program_id", programId);
  const days = (daysRaw ?? []).map((d) => (d as { day_of_week: number }).day_of_week);
  const generated = generateEnrollmentDates(startDate, durationWeeks, days).length;

  return NextResponse.json({ enrollment_id: enrollmentId, generated });
}
