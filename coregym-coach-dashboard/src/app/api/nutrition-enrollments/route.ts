import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { isCoachOwned } from "@/lib/ownership";
import { dbError } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

// Enroll a client in a nutrition program: validates program ownership + the
// client's ACTIVE subscription, then materializes every meal row in one
// atomic RPC (mirrors /api/program-enrollments).
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  // API-05: enrollment materializes a whole meal tree in one RPC — 10/min
  // per coach/instance caps runaway generation.
  if (rateLimit(`enroll:${ctx.coachId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many enrollments — please wait a moment" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const programId = String(body?.program_id ?? "");
  const clientId = String(body?.client_id ?? "");
  const startDate = String(body?.start_date ?? "");
  const durationWeeks = Number(body?.duration_weeks ?? 0);
  if (!programId) return NextResponse.json({ error: "Program is required" }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "Client is required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Start date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0 || durationWeeks > 52) {
    return NextResponse.json({ error: "Duration must be 1–52 weeks" }, { status: 400 });
  }

  const svc = await createServiceClient();
  // Ownership pre-read (S5): the program must belong to this coach — never
  // enroll a client into another coach's program via a client-supplied id.
  const { data: program } = await svc
    .from("nutrition_programs")
    .select("id, coach_id")
    .eq("id", programId)
    .maybeSingle();
  if (!isCoachOwned(program as { coach_id: string } | null, ctx.coachId)) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  // Eligibility: active subscription with this coach (same rule as workouts).
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();
  if (!sub) {
    return NextResponse.json({ error: "Client must have an active subscription" }, { status: 400 });
  }

  // F-11 / data integrity: refuse a second ACTIVE nutrition enrollment for
  // the same client — the first enrollment already materializes meal rows for
  // its whole window, so a second one silently double-books the same dates
  // with duplicate ACTIVE nutrition_assignments. Mirrors the program side's
  // 409 convention (program-enrollments POST): the coach must end/pause the
  // current enrollment first. The check runs in the same request as the
  // insert (server-side; the double-submit window shrinks to the RPC itself).
  const { data: existingEnrollment } = await svc
    .from("client_nutrition_enrollments")
    .select("id, program_id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1);
  if (existingEnrollment && existingEnrollment.length > 0) {
    const e = existingEnrollment[0] as { id: string; program_id: string };
    return NextResponse.json(
      {
        error: "This client already has an active nutrition plan. End or pause it before assigning a new one.",
        existing_enrollment_id: e.id,
      },
      { status: 409 }
    );
  }

  const { data: enrollmentId, error } = await svc.rpc("create_nutrition_enrollment_atomic", {
    p_program_id: programId,
    p_coach_id: ctx.coachId,
    p_client_id: clientId,
    p_start_date: startDate,
    p_duration_weeks: durationWeeks,
  });
  if (error) return NextResponse.json(dbError("nutrition-enrollments", error), { status: 400 });

  const { count } = await svc
    .from("nutrition_assignments")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId as string);
  return NextResponse.json({ id: enrollmentId, meals_generated: count ?? 0 });
}
