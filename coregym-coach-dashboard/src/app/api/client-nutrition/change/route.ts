import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { dbError } from "@/lib/api-error";

// POST /api/client-nutrition/change { assignment_food_id, new_quantity?,
// new_food_id?, note? } — mobile quantity change / substitution. Runs the
// atomic apply_nutrition_food_change RPC (update + history in one
// transaction). Ownership is verified HERE first (service-role calls carry
// no auth.uid(), so the route must prove the food row belongs to the caller
// via nutrition_assignment_foods -> nutrition_assignments.client_id).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const assignmentFoodId = String(body?.assignment_food_id ?? "");
  if (!assignmentFoodId) {
    return NextResponse.json({ error: "assignment_food_id is required" }, { status: 400 });
  }
  if (!UUID_RE.test(assignmentFoodId)) {
    return NextResponse.json({ error: "assignment_food_id must be a valid id" }, { status: 400 });
  }
  const rawQty = body?.new_quantity;
  const newQuantity = rawQty == null || rawQty === "" ? null : Number(rawQty);
  if (newQuantity != null && (!Number.isFinite(newQuantity) || newQuantity <= 0)) {
    return NextResponse.json({ error: "new_quantity must be greater than 0" }, { status: 400 });
  }
  const rawFood = body?.new_food_id;
  const newFoodId = rawFood == null || rawFood === "" ? null : String(rawFood);
  if (newFoodId != null && !UUID_RE.test(newFoodId)) {
    return NextResponse.json({ error: "new_food_id must be a valid id" }, { status: 400 });
  }
  const note = body?.note == null ? null : String(body.note).slice(0, 500);
  if (newQuantity == null && newFoodId == null) {
    return NextResponse.json({ error: "Provide new_quantity and/or new_food_id" }, { status: 400 });
  }

  const svc = await createServiceClient();
  // Ownership pre-read (S1): the food row must belong to one of the caller's
  // own assignments. 404 (not 403) to avoid leaking other users' row ids.
  const { data: food } = await svc
    .from("nutrition_assignment_foods")
    .select("id, assignment_id")
    .eq("id", assignmentFoodId)
    .maybeSingle();
  if (!food) return NextResponse.json({ error: "Meal item not found" }, { status: 404 });
  const { data: assignment } = await svc
    .from("nutrition_assignments")
    .select("id, client_id")
    .eq("id", (food as { assignment_id: string }).assignment_id)
    .eq("client_id", user.id)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Meal item not found" }, { status: 404 });

  const { data: changeId, error } = await svc.rpc("apply_nutrition_food_change", {
    p_assignment_food_id: assignmentFoodId,
    p_new_quantity: newQuantity,
    p_new_food_id: newFoodId,
    p_note: note,
  });
  if (error) return NextResponse.json(dbError("client-nutrition/change", error), { status: 400 });
  return NextResponse.json({ id: changeId });
}
