import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";

// GET /api/client-active-program?client_id=...
// Returns the client's active program (from the app's user_active_program →
// training_programs) so a template can be assigned with a real program_id.
// Service-role read happens only after the client is verified as an active
// subscriber of the resolved coach.
export async function GET(req: NextRequest) {
  const ctx = await requireCoachContext();
  if (!ctx) return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });

  const clientId = req.nextUrl.searchParams.get("client_id") ?? "";
  if (!clientId) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  const svc = await createServiceClient();
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id")
    .eq("coach_id", ctx.coachId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1);
  if (!sub || sub.length === 0) {
    return NextResponse.json({ error: "Client must be an active subscriber of yours" }, { status: 400 });
  }

  const { data: active } = await svc
    .from("user_active_program")
    .select("program_id")
    .eq("user_id", clientId)
    .maybeSingle();
  if (!active) return NextResponse.json({ program: null });

  const programId = (active as { program_id: string | null }).program_id;
  if (!programId) return NextResponse.json({ program: null });

  const { data: program } = await svc
    .from("training_programs")
    .select("id, name")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return NextResponse.json({ program: null });

  return NextResponse.json({
    program: { id: (program as { id: string }).id, name: (program as { name: string | null }).name },
  });
}
