import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { dbError } from "@/lib/api-error";

// PATCH /api/nutrition-enrollments/[id] — pause or resume a nutrition
// enrollment. Only active ↔ paused transitions, mirroring
// /api/program-enrollments/[id]. Frozen meal history is never touched; the AI
// proposal-apply flow needs this so the coach can free the client's one active
// nutrition slot without a service-role workaround.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Enrollment id is required" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = String(body?.status ?? "");
  if (status !== "paused" && status !== "active") {
    return NextResponse.json({ error: "Status must be paused or active" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: enrollment } = await svc
    .from("client_nutrition_enrollments")
    .select("id, status")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  const current = (enrollment as { status: string }).status;
  if (current !== "active" && current !== "paused") {
    return NextResponse.json(
      { error: `Only active or paused enrollments can be changed (current: ${current})` },
      { status: 400 }
    );
  }

  // API-04 pattern: update is ownership-scoped (defense in depth on top of the
  // coach_id-scoped pre-read above).
  const { error } = await svc
    .from("client_nutrition_enrollments")
    .update({ status })
    .eq("id", id)
    .eq("coach_id", ctx.coachId);
  if (error) return NextResponse.json(dbError("nutrition-enrollments/[id]", error), { status: 400 });
  return NextResponse.json({ ok: true, status });
}

// DELETE /api/nutrition-enrollments/[id] — remove a client from a nutrition
// program, history-safe like the workout route: once any meal was completed,
// skipped or client-modified, the enrollment is CANCELLED (kept for history)
// and only pristine future rows are pruned. If every row is still untouched
// (status assigned, in the future, no client change), the enrollment and its
// generated rows are removed entirely — which also unblocks deleting the
// nutrition program template itself.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Enrollment id is required" }, { status: 400 });

  const svc = await createServiceClient();
  const { data: enrollment } = await svc
    .from("client_nutrition_enrollments")
    .select("id, status")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });

  const { data: assignments } = await svc
    .from("nutrition_assignments")
    .select("id, status, scheduled_date")
    .eq("enrollment_id", id);
  const rows = (assignments ?? []) as unknown as { id: string; status: string; scheduled_date: string }[];

  // Same pristine rule as regenerate_remaining_nutrition_assignments: a row is
  // only prunable when it is still assigned, in the future, AND has no client
  // change on any of its foods. Everything else counts as real history.
  const today = new Date().toISOString().slice(0, 10);
  const futureIds = rows.filter((a) => a.status === "assigned" && a.scheduled_date > today).map((a) => a.id);
  let prunableIds = futureIds;
  if (futureIds.length > 0) {
    const { data: changed } = await svc
      .from("nutrition_assignment_foods")
      .select("assignment_id")
      .in("assignment_id", futureIds)
      .not("change_type", "is", null);
    const changedSet = new Set(((changed ?? []) as unknown as { assignment_id: string }[]).map((r) => r.assignment_id));
    prunableIds = futureIds.filter((aid) => !changedSet.has(aid));
  }
  const touched = rows.some((a) => !prunableIds.includes(a.id));

  if (touched) {
    // Real history exists — cancel, keep the record, prune only pristine rows.
    const { error: updErr } = await svc
      .from("client_nutrition_enrollments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("coach_id", ctx.coachId);
    if (updErr) return NextResponse.json(dbError("nutrition-enrollments/[id]", updErr), { status: 400 });
    let pruned = 0;
    for (let i = 0; i < prunableIds.length; i += 50) {
      const slice = prunableIds.slice(i, i + 50);
      await svc.from("nutrition_assignment_foods").delete().in("assignment_id", slice);
      const { error: delErr } = await svc.from("nutrition_assignments").delete().in("id", slice).eq("enrollment_id", id);
      if (delErr) return NextResponse.json(dbError("nutrition-enrollments/[id]", delErr), { status: 400 });
      pruned += slice.length;
    }
    return NextResponse.json({ ok: true, cancelled: true, pruned });
  }

  // Nothing ever happened — full removal (also unblocks program deletion).
  let removed = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50).map((a) => a.id);
    await svc.from("nutrition_assignment_foods").delete().in("assignment_id", slice);
    const { error: delErr } = await svc.from("nutrition_assignments").delete().in("id", slice).eq("enrollment_id", id);
    if (delErr) return NextResponse.json(dbError("nutrition-enrollments/[id]", delErr), { status: 400 });
    removed += slice.length;
  }
  const { error: enrErr } = await svc
    .from("client_nutrition_enrollments")
    .delete()
    .eq("id", id)
    .eq("coach_id", ctx.coachId);
  if (enrErr) return NextResponse.json(dbError("nutrition-enrollments/[id]", enrErr), { status: 400 });
  return NextResponse.json({ ok: true, removed: true, pruned: removed });
}
