import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";
import { copyTemplateName } from "@/lib/workout-input";
import { rateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// Duplicate creates a fully independent template — "Name (Copy)" with its own
// exercise rows (created atomically). Editing the copy never touches the
// original.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  // API-05: duplicates copy the full exercise tree — 10/min per coach/instance.
  if (rateLimit(`dup-tpl:${ctx.coachId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many duplicates — please wait a moment" }, { status: 429 });
  }

  const svc = await createServiceClient();
  const { data: template, error: tErr } = await svc
    .from("workout_templates")
    .select("*")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (tErr) return NextResponse.json(dbError("workout-templates/[id]/duplicate", tErr), { status: 400 });
  // API-03: scoped read — foreign-owned and missing ids are both 404.
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: exercises, error: eErr } = await svc
    .from("workout_template_exercises")
    .select("exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes, order_index")
    .eq("template_id", id)
    .order("order_index");
  if (eErr) return NextResponse.json(dbError("workout-templates/[id]/duplicate", eErr), { status: 400 });

  const t = template as { name: string; target_muscles: string[]; notes: string | null };
  // F-17: "<name> (Copy)" must respect the same 200-char cap create/update
  // enforce — the base name is truncated first so the copy is always editable
  // afterwards (copyTemplateName is unit-tested in tests/workout-input.test.ts).
  const { data: newId, error } = await svc.rpc("create_workout_template_atomic", {
    p_coach_id: ctx.coachId,
    p_name: copyTemplateName(t.name),
    p_target_muscles: t.target_muscles ?? [],
    p_notes: t.notes,
    p_exercises: exercises ?? [],
  });
  if (error) return NextResponse.json(dbError("workout-templates/[id]/duplicate", error), { status: 400 });

  const [nt, ne] = await Promise.all([
    svc.from("workout_templates").select("*").eq("id", newId as string).single(),
    svc.from("workout_template_exercises").select("*").eq("template_id", newId as string).order("order_index"),
  ]);
  if (nt.error || !nt.data) {
    return NextResponse.json(dbError("workout-templates/[id]/duplicate", nt.error), { status: 500 });
  }
  return NextResponse.json({ ...nt.data, exercises: ne.data ?? [] });
}
