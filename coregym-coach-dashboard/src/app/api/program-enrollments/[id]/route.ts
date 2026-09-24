import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

// PATCH /api/program-enrollments/[id] — pause or resume an enrollment.
// Only active ↔ paused transitions. Frozen history is never touched.
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
    .from("client_program_enrollments")
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

  const { error } = await svc.from("client_program_enrollments").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, status });
}

// DELETE /api/program-enrollments/[id] — remove a client from a program.
// History-safe: if the client already started/completed/skipped anything,
// the enrollment is CANCELLED (kept for history) and only pristine future
// rows are pruned. If nothing ever happened (every row still assigned),
// the enrollment and its generated rows are removed entirely — which also
// unblocks deleting the program template itself.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Enrollment id is required" }, { status: 400 });

  const svc = await createServiceClient();
  const { data: enrollment } = await svc
    .from("client_program_enrollments")
    .select("id, status")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });

  const { data: assignments } = await svc
    .from("workout_assignments")
    .select("id, status, scheduled_date")
    .eq("enrollment_id", id);
  const rows = (assignments ?? []) as unknown as { id: string; status: string; scheduled_date: string }[];
  const touched = rows.some((a) => a.status !== "assigned");

  const today = new Date().toISOString().slice(0, 10);
  const pristineFuture = rows.filter((a) => a.status === "assigned" && a.scheduled_date > today);

  if (touched) {
    // Real history exists — cancel, keep the record, prune only untouched future rows.
    const { error: updErr } = await svc
      .from("client_program_enrollments")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    if (pristineFuture.length > 0) {
      const { error: delErr } = await svc
        .from("workout_assignments")
        .delete()
        .eq("enrollment_id", id)
        .eq("status", "assigned")
        .gt("scheduled_date", today);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, cancelled: true, pruned: pristineFuture.length });
  }

  // Nothing ever happened — full removal (also unblocks program deletion).
  if (rows.length > 0) {
    const { error: delErr } = await svc.from("workout_assignments").delete().eq("enrollment_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
  }
  const { error: enrErr } = await svc.from("client_program_enrollments").delete().eq("id", id);
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, removed: true, pruned: rows.length });
}
