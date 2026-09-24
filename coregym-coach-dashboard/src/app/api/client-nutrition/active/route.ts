import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// GET /api/client-nutrition/active?date=YYYY-MM-DD — mobile read contract.
// The client is identified by their own JWT (client_id = auth.uid()). Returns
// the active enrollment + that date's meals with frozen prescribed values.
// No date param defaults to today (server UTC date).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = user.id;

  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: enrollment } = await svc
    .from("client_nutrition_enrollments")
    .select("id, program_id, start_date, duration_weeks, status, program:nutrition_programs(name)")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ enrollment: null, date, meals: [] });

  const e = enrollment as unknown as {
    id: string;
    program_id: string;
    start_date: string;
    duration_weeks: number;
    status: string;
    program: { name: string } | { name: string }[] | null;
  };
  const prog = Array.isArray(e.program) ? e.program[0] : e.program;

  const { data: meals } = await svc
    .from("nutrition_assignments")
    .select(
      "id, meal_name, order_index, status, week_number, foods:nutrition_assignment_foods(id, food_id, food_name, serving_unit, serving_size, original_quantity, original_calories, original_protein_g, original_carbs_g, original_fat_g, current_food_id, current_quantity, current_calories, current_protein_g, current_carbs_g, current_fat_g, change_type, order_index)"
    )
    .eq("enrollment_id", e.id)
    .eq("scheduled_date", date)
    .order("order_index");

  return NextResponse.json({
    enrollment: {
      id: e.id,
      program_id: e.program_id,
      program_name: prog?.name ?? "Nutrition program",
      start_date: e.start_date,
      duration_weeks: e.duration_weeks,
      status: e.status,
    },
    date,
    meals: (meals ?? []).map((m) => {
      const row = m as unknown as Record<string, unknown>;
      const foods = ((row.foods ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
        assignment_food_id: f.id,
        food_id: (f.current_food_id as string | null) ?? (f.food_id as string),
        prescribed_food_id: f.food_id,
        food_name: f.food_name,
        serving_unit: f.serving_unit,
        serving_size: f.serving_size,
        prescribed_quantity: f.original_quantity,
        quantity: (f.current_quantity as number | null) ?? f.original_quantity,
        calories: (f.current_calories as number | null) ?? f.original_calories,
        protein_g: (f.current_protein_g as number | null) ?? f.original_protein_g,
        carbs_g: (f.current_carbs_g as number | null) ?? f.original_carbs_g,
        fat_g: (f.current_fat_g as number | null) ?? f.original_fat_g,
        change_type: f.change_type,
      }));
      const totals = foods.reduce(
        (t, f) => ({
          calories: t.calories + Number(f.calories ?? 0),
          protein_g: t.protein_g + Number(f.protein_g ?? 0),
          carbs_g: t.carbs_g + Number(f.carbs_g ?? 0),
          fat_g: t.fat_g + Number(f.fat_g ?? 0),
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      );
      return {
        assignment_id: row.id,
        meal_name: row.meal_name,
        order_index: row.order_index,
        status: row.status,
        week_number: row.week_number,
        totals: {
          calories: Math.round(totals.calories),
          protein_g: Math.round(totals.protein_g * 10) / 10,
          carbs_g: Math.round(totals.carbs_g * 10) / 10,
          fat_g: Math.round(totals.fat_g * 10) / 10,
        },
        foods,
      };
    }),
  });
}
