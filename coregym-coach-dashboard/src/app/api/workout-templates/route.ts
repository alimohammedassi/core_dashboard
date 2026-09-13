import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { parseTemplatePayload } from "@/lib/workout-input";

// Template writes go through the service role after the caller is
// authenticated and resolved to their coach row (mirrors /api/plans).
// Atomicity comes from the create_workout_template_atomic RPC — template plus
// exercises commit together or not at all.

export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = parseTemplatePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const { data: templateId, error } = await svc.rpc("create_workout_template_atomic", {
    p_coach_id: ctx.coachId,
    p_name: parsed.data.name,
    p_target_muscles: parsed.data.target_muscles,
    p_notes: parsed.data.notes,
    p_exercises: parsed.data.exercises,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const id = templateId as string;
  const [t, ex] = await Promise.all([
    svc.from("workout_templates").select("*").eq("id", id).single(),
    svc.from("workout_template_exercises").select("*").eq("template_id", id).order("order_index"),
  ]);
  if (t.error || !t.data) {
    return NextResponse.json({ error: t.error?.message ?? "Template created but could not be read back" }, { status: 500 });
  }
  return NextResponse.json({ ...t.data, exercises: ex.data ?? [] });
}
