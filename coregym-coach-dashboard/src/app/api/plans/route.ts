import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";

// subscription_plans is keyed by coaches.id but the live RLS policy compares
// coach_id against auth.uid(), so authenticated inserts can never pass.
// Writes go through the service role after verifying the caller's coach row,
// mirroring how the Stripe webhook writes.

async function requireCoach() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) return null; // no coaches row yet
  return { userId: user.id, coachId };
}

function pickPlanFields(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? "").trim(),
    price_usd: Number(body.price_usd ?? 0),
    duration_days: Number(body.duration_days ?? 30),
    max_clients: body.max_clients == null || body.max_clients === "" ? null : Number(body.max_clients),
  };
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach();
  if (!ctx) {
    return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const payload = { ...pickPlanFields(body), coach_id: ctx.coachId };
  if (!payload.name || payload.price_usd < 0) {
    return NextResponse.json({ error: "Name and valid price required" }, { status: 400 });
  }
  const svc = await createServiceClient();
  const { data, error } = await svc.from("subscription_plans").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCoach();
  if (!ctx) {
    return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const payload = pickPlanFields(body);
  if (!payload.name || payload.price_usd < 0) {
    return NextResponse.json({ error: "Name and valid price required" }, { status: 400 });
  }
  const svc = await createServiceClient();
  // scoped by coach_id so a coach can never touch another coach's plan
  const { data, error } = await svc
    .from("subscription_plans")
    .update(payload)
    .eq("id", body.id)
    .eq("coach_id", ctx.coachId)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
