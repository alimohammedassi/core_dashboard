import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

// POST /api/nutrition-enrollments/[id]/regenerate — "Update Remaining Days".
// Regenerates only pristine future rows; completed/skipped/changed/past rows
// are never touched (mirrors the workout regenerate route).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Enrollment id is required" }, { status: 400 });

  const svc = await createServiceClient();
  const { data: replaced, error } = await svc.rpc("regenerate_remaining_nutrition_assignments", {
    p_enrollment_id: id,
    p_coach_id: ctx.coachId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ replaced: (replaced as number) ?? 0 });
}
