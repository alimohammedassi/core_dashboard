import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { parseNutritionPayload } from "@/lib/nutrition-input";

// Nutrition program writes go through the service role after the caller is
// authenticated and resolved to their coach row (mirrors /api/coach-programs).
// Atomicity comes from upsert_nutrition_program_atomic — program + full
// day/meal/food tree commits together or not at all.
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = parseNutritionPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const { data: programId, error } = await svc.rpc("upsert_nutrition_program_atomic", {
    p_program_id: null,
    p_coach_id: ctx.coachId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_tree: parsed.data.days,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: programId });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Program id is required" }, { status: 400 });
  }
  const parsed = parseNutritionPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const { data: programId, error } = await svc.rpc("upsert_nutrition_program_atomic", {
    p_program_id: body.id,
    p_coach_id: ctx.coachId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_tree: parsed.data.days,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: programId });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Program id is required" }, { status: 400 });

  const svc = await createServiceClient();
  // Protect enrollment history — same pattern as program deletion.
  const { count } = await svc
    .from("client_nutrition_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("program_id", id)
    .eq("coach_id", ctx.coachId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This program has client enrollments, so it cannot be deleted. It stays to protect their history." },
      { status: 409 }
    );
  }

  const { error } = await svc.from("nutrition_programs").delete().eq("id", id).eq("coach_id", ctx.coachId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
