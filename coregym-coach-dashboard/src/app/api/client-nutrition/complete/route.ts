import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// POST /api/client-nutrition/complete { assignment_id, status } — mobile meal
// completion. The client owns the row (client_id = auth.uid()); the
// column-scoped RLS grant also permits direct PATCH, this route is the
// validated equivalent that also appends a history row.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const assignmentId = String(body?.assignment_id ?? "");
  const status = String(body?.status ?? "");
  if (!assignmentId) return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
  if (status !== "completed" && status !== "skipped") {
    return NextResponse.json({ error: "status must be completed or skipped" }, { status: 400 });
  }

  const svc = await createServiceClient();
  const { data: row } = await svc
    .from("nutrition_assignments")
    .select("id, enrollment_id, coach_id, client_id, scheduled_date, meal_name, status")
    .eq("id", assignmentId)
    .eq("client_id", user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  const { error } = await svc
    .from("nutrition_assignments")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const r = row as unknown as {
    enrollment_id: string;
    coach_id: string;
    client_id: string;
    scheduled_date: string;
    meal_name: string;
  };
  await svc.from("nutrition_change_log").insert({
    assignment_id: assignmentId,
    enrollment_id: r.enrollment_id,
    coach_id: r.coach_id,
    client_id: r.client_id,
    plan_date: r.scheduled_date,
    meal_name: r.meal_name,
    change_type: "completion",
    source: "client_mobile",
    note: status,
  });

  return NextResponse.json({ ok: true, status });
}
