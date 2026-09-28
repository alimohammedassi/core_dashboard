import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ id: string }> };

// "Update Remaining Weeks" (§4.2): coach-triggered regeneration of an
// enrollment's future still-assigned rows with the program's CURRENT weekday
// mapping. Past / started / completed / skipped rows are untouched. Atomic
// delete + re-insert inside the RPC.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const { id } = await params;
  const svc = await createServiceClient();

  // Pre-checks give clean error messages; the RPC re-verifies defensively.
  // API-03: scoped read — foreign-owned and missing ids are both 404.
  const { data: enrollment } = await svc
    .from("client_program_enrollments")
    .select("id, coach_id, status")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if ((enrollment as { status: string }).status !== "active") {
    return NextResponse.json({ error: "Only active enrollments can be regenerated" }, { status: 400 });
  }

  const { data: replaced, error } = await svc.rpc("regenerate_remaining_enrollment_assignments", {
    p_enrollment_id: id,
    p_coach_id: ctx.coachId,
  });
  if (error) return NextResponse.json(dbError("program-enrollments/[id]/regenerate", error), { status: 400 });

  return NextResponse.json({ replaced: replaced ?? 0 });
}
