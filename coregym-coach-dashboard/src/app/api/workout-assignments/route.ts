import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { parseTemplatePayload } from "@/lib/workout-input";
import { dbError } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Creates a workout assignment. Two modes:
//  1. Direct:      { template_id, client_id, scheduled_date, program_id? }
//  2. Next workout: { source_assignment_id, scheduled_date, template: {...adjusted...} }
//     The adjusted configuration becomes a NEW template (the original reusable
//     template and the completed assignment stay untouched), assigned to the
//     same client on the chosen date.
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  // API-05: assignment creation can mint a template copy + per-date rows —
  // 30/min per coach/instance is far above deliberate use but caps scripted
  // floods.
  if (rateLimit(`assign:${ctx.coachId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please wait a moment" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const scheduledDate = String(body.scheduled_date ?? "");
  if (!DATE_RE.test(scheduledDate) || Number.isNaN(new Date(`${scheduledDate}T00:00:00Z`).getTime())) {
    return NextResponse.json({ error: "A valid scheduled date is required" }, { status: 400 });
  }

  const svc = await createServiceClient();

  // ── Mode 2: duplicate-as-next-workout ────────────────────────────────────────
  if (body.source_assignment_id) {
    const { data: source, error: sErr } = await svc
      .from("workout_assignments")
      .select("id, coach_id, client_id, program_id")
      .eq("id", String(body.source_assignment_id))
      .maybeSingle();
    if (sErr) return NextResponse.json(dbError("workout-assignments", sErr), { status: 400 });
    // API-03: foreign-owned and missing ids are indistinguishable (404).
    if (!source || (source as { coach_id: string }).coach_id !== ctx.coachId) {
      return NextResponse.json({ error: "Source assignment not found" }, { status: 404 });
    }

    const parsed = parseTemplatePayload(body.template);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: templateId, error } = await svc.rpc("create_workout_template_atomic", {
      p_coach_id: ctx.coachId,
      p_name: parsed.data.name,
      p_target_muscles: parsed.data.target_muscles,
      p_notes: parsed.data.notes,
      p_exercises: parsed.data.exercises,
    });
    if (error) return NextResponse.json(dbError("workout-assignments", error), { status: 400 });

    const { data: assignment, error: aErr } = await svc
      .from("workout_assignments")
      .insert({
        template_id: templateId as string,
        coach_id: ctx.coachId,
        client_id: (source as { client_id: string }).client_id,
        program_id: (source as { program_id: string | null }).program_id ?? null,
        scheduled_date: scheduledDate,
        status: "assigned",
      })
      .select("*")
      .single();
    if (aErr) return NextResponse.json(dbError("workout-assignments", aErr), { status: 400 });
    return NextResponse.json({ assignment, template_id: templateId });
  }

  // ── Mode 1: direct assignment ────────────────────────────────────────────────
  const templateId = String(body.template_id ?? "");
  const clientId = String(body.client_id ?? "");
  if (!templateId) return NextResponse.json({ error: "Template is required" }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "Client is required" }, { status: 400 });

  // Ownership: the template must belong to the resolved coach.
  const { data: template, error: tErr } = await svc
    .from("workout_templates")
    .select("id, coach_id, name")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr) return NextResponse.json(dbError("workout-assignments", tErr), { status: 400 });
  // API-03: scoped read — foreign-owned and missing ids are both 404.
  if (!template || (template as { coach_id: string }).coach_id !== ctx.coachId) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // The client must be one of this coach's ACTIVE subscribers.
  const { data: sub, error: subErr } = await svc
    .from("subscriptions")
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1);
  if (subErr) return NextResponse.json(dbError("workout-assignments", subErr), { status: 400 });
  if (!sub || sub.length === 0) {
    return NextResponse.json({ error: "Client must be an active subscriber of yours" }, { status: 400 });
  }

  // Program link is optional; when present it must reference a real program.
  // S4 boundary note (verified live 2026-09-27): training_programs is the
  // mobile app's GLOBAL catalog table — it has no coach_id column, so any
  // program id is linkable by design (same as catalog exercises). Tenant
  // isolation lives on the assignment row itself (coach_id = ctx.coachId,
  // coach-owned template, subscribed client — all checked above), not on
  // this link. The existence check below prevents dangling references.
  let programId: string | null = null;
  if (body.program_id != null && String(body.program_id).trim() !== "") {
    const pid = String(body.program_id);
    const { data: program } = await svc.from("training_programs").select("id").eq("id", pid).maybeSingle();
    if (!program) return NextResponse.json({ error: "Program not found" }, { status: 400 });
    programId = pid;
  }

  const { data: assignment, error: aErr } = await svc
    .from("workout_assignments")
    .insert({
      template_id: templateId,
      coach_id: ctx.coachId,
      client_id: clientId,
      program_id: programId,
      scheduled_date: scheduledDate,
      status: "assigned",
    })
    .select("*")
    .single();
  if (aErr) return NextResponse.json(dbError("workout-assignments", aErr), { status: 400 });

  return NextResponse.json({ assignment });
}
