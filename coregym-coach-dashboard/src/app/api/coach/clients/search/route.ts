import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";

// Live search over the coach's subscribers (profiles joined through
// subscriptions). Results carry the subscription id because profile pages
// (/dashboard/subscribers/[id]) are keyed by subscription. Filtering happens
// in memory — embedded-column or() filters don't parse on the live PostgREST.
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

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      `
      id, status,
      plan:subscription_plans(name),
      client:profiles!subscriptions_client_id_fkey(full_name, name, email, avatar_url)
      `
    )
    .eq("coach_id", coachId)
    .order("start_date", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  type Row = {
    id: string;
    status: string;
    plan: { name: string } | null | { name: string }[];
    client:
      | { full_name: string | null; name: string | null; email: string | null; avatar_url: string | null }
      | null
      | Array<{ full_name: string | null; name: string | null; email: string | null; avatar_url: string | null }>;
  };

  const results = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const c = Array.isArray(r.client) ? r.client[0] : r.client;
      const p = Array.isArray(r.plan) ? r.plan[0] : r.plan;
      const name = c?.full_name || c?.name || c?.email || "Client";
      return {
        id: r.id,
        status: r.status,
        name,
        email: c?.email ?? null,
        plan: p?.name ?? null,
      };
    })
    .filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.plan ?? "").toLowerCase().includes(q)
    )
    .slice(0, 8);

  return NextResponse.json({ results });
}
