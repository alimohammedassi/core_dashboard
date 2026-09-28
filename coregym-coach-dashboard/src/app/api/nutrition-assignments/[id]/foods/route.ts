import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/nutrition-assignments/[id]/foods — coach adds a food to one
// assigned meal. Body: { food_id, quantity, note? }. The assignment must
// belong to this coach (verified here); the RPC re-verifies, enforces the
// edit window (no completed/past meals, active enrollment only), snapshots
// values from the library base, and appends history — atomically.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id: assignmentId } = await params;
  if (!assignmentId || !UUID_RE.test(assignmentId)) {
    return NextResponse.json({ error: "Meal id is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const foodId = String(body?.food_id ?? "");
  const quantity = Number(body?.quantity);
  const note = body?.note == null ? null : String(body.note).slice(0, 500);
  if (!UUID_RE.test(foodId)) {
    return NextResponse.json({ error: "Select a food from the library" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: assignment } = await svc
    .from("nutrition_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  const { error } = await svc.rpc("apply_coach_meal_edit", {
    p_assignment_id: assignmentId,
    p_action: "add",
    p_food_id: foodId,
    p_quantity: quantity,
    p_assignment_food_id: null,
    p_note: note,
  });
  if (error) return NextResponse.json(dbError("nutrition-assignments/[id]/foods", error), { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/nutrition-assignments/[id]/foods — coach removes a food from
// one assigned meal. Body: { assignment_food_id }. The row is kept and
// flagged (history preserved), never hard-deleted.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id: assignmentId } = await params;
  if (!assignmentId || !UUID_RE.test(assignmentId)) {
    return NextResponse.json({ error: "Meal id is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const assignmentFoodId = String(body?.assignment_food_id ?? "");
  if (!UUID_RE.test(assignmentFoodId)) {
    return NextResponse.json({ error: "Food item is required" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: assignment } = await svc
    .from("nutrition_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  const { error } = await svc.rpc("apply_coach_meal_edit", {
    p_assignment_id: assignmentId,
    p_action: "remove",
    p_food_id: null,
    p_quantity: null,
    p_assignment_food_id: assignmentFoodId,
    p_note: null,
  });
  if (error) return NextResponse.json(dbError("nutrition-assignments/[id]/foods", error), { status: 400 });
  return NextResponse.json({ ok: true });
}
