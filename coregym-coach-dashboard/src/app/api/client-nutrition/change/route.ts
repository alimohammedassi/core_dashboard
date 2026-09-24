import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// POST /api/client-nutrition/change { assignment_food_id, new_quantity?,
// new_food_id?, note? } — mobile quantity change / substitution. Runs the
// atomic apply_nutrition_food_change RPC (update + history in one
// transaction). The RPC verifies client_id = auth.uid() ownership itself.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const assignmentFoodId = String(body?.assignment_food_id ?? "");
  if (!assignmentFoodId) {
    return NextResponse.json({ error: "assignment_food_id is required" }, { status: 400 });
  }
  const rawQty = body?.new_quantity;
  const newQuantity = rawQty == null || rawQty === "" ? null : Number(rawQty);
  if (newQuantity != null && (!Number.isFinite(newQuantity) || newQuantity <= 0)) {
    return NextResponse.json({ error: "new_quantity must be greater than 0" }, { status: 400 });
  }
  const rawFood = body?.new_food_id;
  const newFoodId = rawFood == null || rawFood === "" ? null : String(rawFood);
  const note = body?.note == null ? null : String(body.note).slice(0, 500);
  if (newQuantity == null && newFoodId == null) {
    return NextResponse.json({ error: "Provide new_quantity and/or new_food_id" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: changeId, error } = await svc.rpc("apply_nutrition_food_change", {
    p_assignment_food_id: assignmentFoodId,
    p_new_quantity: newQuantity,
    p_new_food_id: newFoodId,
    p_note: note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: changeId });
}
