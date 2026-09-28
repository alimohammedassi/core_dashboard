import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";

// Duplicate a nutrition program with its full tree as an independent copy.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Program id is required" }, { status: 400 });

  const svc = await createServiceClient();
  const { data: src, error: srcErr } = await svc
    .from("nutrition_programs")
    .select(
      "id, name, description, days:nutrition_program_days(id, day_of_week, notes, meals:nutrition_program_meals(id, name, order_index, foods:nutrition_program_foods(food_id, quantity, order_index)))"
    )
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (srcErr || !src) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const s = src as unknown as {
    name: string;
    description: string | null;
    days: { day_of_week: number; notes: string | null; meals: { name: string; foods: { food_id: string; quantity: number }[] }[] }[];
  };
  const tree = (s.days ?? []).map((d) => ({
    day_of_week: d.day_of_week,
    notes: d.notes,
    meals: (d.meals ?? []).map((m) => ({
      name: m.name,
      foods: (m.foods ?? []).map((f) => ({ food_id: f.food_id, quantity: f.quantity })),
    })),
  }));

  const { data: newId, error } = await svc.rpc("upsert_nutrition_program_atomic", {
    p_program_id: null,
    p_coach_id: ctx.coachId,
    p_name: `${s.name} (Copy)`,
    p_description: s.description,
    p_tree: tree,
  });
  if (error) return NextResponse.json(dbError("nutrition-programs/[id]/duplicate", error), { status: 400 });
  return NextResponse.json({ id: newId });
}
