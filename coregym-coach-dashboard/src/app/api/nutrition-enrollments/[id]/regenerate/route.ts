import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/nutrition-enrollments/[id]/regenerate — "Update Remaining Days".
// Regenerates only pristine future rows; completed/skipped/changed/past rows
// are never touched (mirrors the workout regenerate route).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  // API-05: regeneration rewrites the future assignment tree — 10/min per
  // coach/instance caps runaway fan-out.
  if (rateLimit(`regen:${ctx.coachId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many regenerations — please wait a moment" }, { status: 429 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Enrollment id is required" }, { status: 400 });

  const svc = await createServiceClient();
  // Pre-checks mirror the workout regenerate route (S6): clean errors here,
  // RPC re-verifies defensively. API-03: scoped read — foreign-owned and
  // missing ids are indistinguishable (both 404), no existence oracle.
  const { data: enrollment } = await svc
    .from("client_nutrition_enrollments")
    .select("id, coach_id, status")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  if ((enrollment as { status: string }).status !== "active") {
    return NextResponse.json({ error: "Only active enrollments can be regenerated" }, { status: 400 });
  }

  const { data: replaced, error } = await svc.rpc("regenerate_remaining_nutrition_assignments", {
    p_enrollment_id: id,
    p_coach_id: ctx.coachId,
  });
  if (error) return NextResponse.json(dbError("nutrition-enrollments/[id]/regenerate", error), { status: 400 });
  return NextResponse.json({ replaced: (replaced as number) ?? 0 });
}
