import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { parseTemplatePayload } from "@/lib/workout-input";

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedTemplate(svc: Awaited<ReturnType<typeof createServiceClient>>, id: string, coachId: string) {
  const { data, error } = await svc.from("workout_templates").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.message, status: 400 as const };
  if (!data) return { error: "Template not found", status: 404 as const };
  if ((data as { coach_id: string }).coach_id !== coachId) {
    return { error: "This template belongs to another coach", status: 403 as const };
  }
  return { template: data as { id: string; coach_id: string; name: string }, status: 200 as const };
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = parseTemplatePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const owned = await loadOwnedTemplate(svc, id, ctx.coachId);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  // Editing the reusable template must never touch historical client data —
  // only the template and its exercise rows are rewritten here.
  const { error } = await svc.rpc("update_workout_template_atomic", {
    p_template_id: id,
    p_name: parsed.data.name,
    p_target_muscles: parsed.data.target_muscles,
    p_notes: parsed.data.notes,
    p_exercises: parsed.data.exercises,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const [t, ex] = await Promise.all([
    svc.from("workout_templates").select("*").eq("id", id).single(),
    svc.from("workout_template_exercises").select("*").eq("template_id", id).order("order_index"),
  ]);
  if (t.error || !t.data) {
    return NextResponse.json({ error: t.error?.message ?? "Updated but could not be read back" }, { status: 500 });
  }
  return NextResponse.json({ ...t.data, exercises: ex.data ?? [] });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const svc = await createServiceClient();
  const owned = await loadOwnedTemplate(svc, id, ctx.coachId);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  // Never break historical workout records: a template that has assignments
  // (past or upcoming) is protected — the FK would also block this, but a
  // pre-check lets us return an understandable message.
  const { count } = await svc
    .from("workout_assignments")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This template has assigned workouts, so it cannot be deleted. It stays to preserve client history." },
      { status: 409 }
    );
  }

  const { error } = await svc.from("workout_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
