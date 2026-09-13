import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

type RouteContext = { params: Promise<{ id: string }> };

// Duplicate creates a fully independent template — "Name (Copy)" with its own
// exercise rows (created atomically). Editing the copy never touches the
// original.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const svc = await createServiceClient();
  const { data: template, error: tErr } = await svc
    .from("workout_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if ((template as { coach_id: string }).coach_id !== ctx.coachId) {
    return NextResponse.json({ error: "This template belongs to another coach" }, { status: 403 });
  }

  const { data: exercises, error: eErr } = await svc
    .from("workout_template_exercises")
    .select("exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes, order_index")
    .eq("template_id", id)
    .order("order_index");
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });

  const t = template as { name: string; target_muscles: string[]; notes: string | null };
  const { data: newId, error } = await svc.rpc("create_workout_template_atomic", {
    p_coach_id: ctx.coachId,
    p_name: `${t.name} (Copy)`,
    p_target_muscles: t.target_muscles ?? [],
    p_notes: t.notes,
    p_exercises: exercises ?? [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const [nt, ne] = await Promise.all([
    svc.from("workout_templates").select("*").eq("id", newId as string).single(),
    svc.from("workout_template_exercises").select("*").eq("template_id", newId as string).order("order_index"),
  ]);
  if (nt.error || !nt.data) {
    return NextResponse.json({ error: nt.error?.message ?? "Duplicated but could not be read back" }, { status: 500 });
  }
  return NextResponse.json({ ...nt.data, exercises: ne.data ?? [] });
}
