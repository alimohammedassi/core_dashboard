import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

// Create a Coach Program (name, description, weekday→template mapping) in one
// atomic call. Days arrive as [{day_of_week, template_id}]; the RPC re-checks
// weekday validity, duplicates and template ownership as defense in depth.
export async function POST(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = parseProgramPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const { data: programId, error } = await svc.rpc("upsert_coach_program_atomic", {
    p_program_id: null,
    p_coach_id: ctx.coachId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_days: parsed.data.days,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(await readBack(svc, programId as string));
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Program id is required" }, { status: 400 });
  }
  const parsed = parseProgramPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = await createServiceClient();
  const { data: programId, error } = await svc.rpc("upsert_coach_program_atomic", {
    p_program_id: body.id,
    p_coach_id: ctx.coachId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_days: parsed.data.days,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(await readBack(svc, programId as string));
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Program id is required" }, { status: 400 });

  const svc = await createServiceClient();
  // Protect enrollment history — same pattern as template deletion (§42).
  const { count } = await svc
    .from("client_program_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("program_id", id)
    .eq("coach_id", ctx.coachId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This program has client enrollments, so it cannot be deleted. It stays to protect their history." },
      { status: 409 }
    );
  }

  const { error } = await svc.from("coach_programs").delete().eq("id", id).eq("coach_id", ctx.coachId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

type ParseResult = { ok: true; data: { name: string; description: string | null; days: unknown[] } } | { ok: false; error: string };

function parseProgramPayload(body: Record<string, unknown>): ParseResult {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, error: "Program name is required" };

  const description =
    body.description == null || String(body.description).trim() === "" ? null : String(body.description).trim();

  if (!Array.isArray(body.days) || body.days.length === 0) {
    return { ok: false, error: "At least one weekday must have a template" };
  }
  const seen = new Set<number>();
  const days: unknown[] = [];
  for (const [i, raw] of (body.days as unknown[]).entries()) {
    const d = raw as Record<string, unknown>;
    const dayOfWeek = Number(d.day_of_week);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return { ok: false, error: `Day ${i + 1}: weekday must be Monday (1) .. Sunday (7)` };
    }
    if (seen.has(dayOfWeek)) return { ok: false, error: "Each weekday can only appear once" };
    seen.add(dayOfWeek);
    const templateId = String(d.template_id ?? "");
    if (!templateId) return { ok: false, error: `Day ${i + 1}: template is required` };
    days.push({ day_of_week: dayOfWeek, template_id: templateId, order_index: i });
  }
  return { ok: true, data: { name, description, days } };
}

async function readBack(svc: Awaited<ReturnType<typeof createServiceClient>>, id: string) {
  const [p, d] = await Promise.all([
    svc.from("coach_programs").select("*").eq("id", id).single(),
    svc
      .from("coach_program_days")
      .select("id, day_of_week, template_id, order_index, template:workout_templates(id, name)")
      .eq("program_id", id)
      .order("day_of_week"),
  ]);
  if (p.error || !p.data) {
    throw new Error(p.error?.message ?? "Saved but could not be read back");
  }
  return { ...p.data, days: d.data ?? [] };
}
