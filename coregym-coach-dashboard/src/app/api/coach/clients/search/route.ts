import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { dbError } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

// Live search over the coach's subscribers (profiles joined through
// subscriptions). Results carry the subscription id because profile pages
// (/dashboard/subscribers/[id]) are keyed by subscription.
//
// API-10: this used to pull up to 500 joined rows per keystroke and filter in
// memory (embedded-column or() filters don't parse on the live PostgREST —
// verified by a prior session). It now runs two BOUNDED queries instead:
//   1. match up to 8 profiles by name/email (plain column ilike or(), same
//      pattern the foods search uses — parses fine on direct columns)
//   2. fetch this coach's subscriptions for exactly those client ids
// Rows belonging to other coaches can match step 1 when profiles RLS is off,
// but step 2's coach_id filter drops them, so the response stays tenant-safe.
// Note: plan-name matching was dropped — profile name/email is what the UI
// search box targets.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) return NextResponse.json({ results: [] }); // no coaches row yet

  // API-05: keystroke searches are cheap to spam; 30/min per coach/instance.
  if (rateLimit(`client-search:${coachId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many searches — slow down" }, { status: 429 });
  }

  const safe = q.replace(/[%_,()]/g, "");
  if (safe.length < 2) return NextResponse.json({ results: [] });

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, name, email, avatar_url")
    .or(`full_name.ilike.%${safe}%,name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(8);
  if (pErr) return NextResponse.json(dbError("coach/clients/search", pErr), { status: 400 });

  const profileRows = (profiles ?? []) as unknown as Array<{
    id: string;
    full_name: string | null;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>;
  if (profileRows.length === 0) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      `
      id, status, client_id,
      plan:subscription_plans(name)
      `
    )
    .eq("coach_id", coachId)
    .in("client_id", profileRows.map((p) => p.id))
    .order("start_date", { ascending: false })
    .limit(8);

  if (error) return NextResponse.json(dbError("coach/clients/search", error), { status: 400 });

  type Row = {
    id: string;
    status: string;
    client_id: string;
    plan: { name: string } | null | { name: string }[];
  };

  const results = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const c = profileRows.find((p) => p.id === r.client_id);
      const p = Array.isArray(r.plan) ? r.plan[0] : r.plan;
      return {
        id: r.id,
        status: r.status,
        name: c?.full_name || c?.name || c?.email || "Client",
        email: c?.email ?? null,
        plan: p?.name ?? null,
      };
    })
    .slice(0, 8);

  return NextResponse.json({ results });
}
