import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { dbError } from "@/lib/api-error";
import { csvSafeField } from "@/lib/csv";
import { rateLimit } from "@/lib/rate-limit";

// CSV export of the coach's subscribers (Overview "Export" button).
// API-02: bounded retrieval — subscriptions stream in pages of 500 via
// `.range()` until exhausted, and payments aggregate per client with the same
// pagination, so a large tenant cannot blow the function's memory/time limits
// or silently truncate at a PostgREST row cap.

const PAGE = 500;

type SubRow = {
  id: string;
  client_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  plan: { name: string; price_usd: number } | null | Array<{ name: string; price_usd: number }>;
  client:
    | { full_name: string | null; name: string | null; email: string | null }
    | null
    | Array<{ full_name: string | null; name: string | null; email: string | null }>;
};

type PaymentRow = { client_id: string | null; amount: number };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const coachId = await resolveCoachId(supabase, user.id);
  if (coachId === user.id) {
    return NextResponse.json({ error: "Coach profile not found" }, { status: 403 });
  }

  // API-05: one export per coach per minute (per instance; documented limit).
  if (rateLimit(`export:${coachId}`, 1, 60_000)) {
    return NextResponse.json({ error: "Export is rate-limited — try again in a minute" }, { status: 429 });
  }

  // Subscriptions, paged. Loop terminates when a page returns fewer rows than
  // the page size (or an explicit empty page). Safety ceiling of 200 pages
  // (100k rows) keeps a pathological loop bounded.
  const subs: SubRow[] = [];
  for (let from = 0; from < 200 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        `
        id, client_id, status, start_date, end_date,
        plan:subscription_plans(name, price_usd),
        client:profiles!subscriptions_client_id_fkey(full_name, name, email)
        `
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json(dbError("export/subscribers", error), { status: 400 });
    const rows = (data ?? []) as unknown as SubRow[];
    subs.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Per-client lifetime revenue from real succeeded payments, paged + reduced
  // as we go (only the aggregate survives, never the full result set).
  const paidByClient = new Map<string, number>();
  for (let from = 0; from < 200 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("payment_intents")
      .select("client_id, amount")
      .eq("coach_id", coachId)
      .eq("status", "succeeded")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json(dbError("export/subscribers", error), { status: 400 });
    const rows = (data ?? []) as unknown as PaymentRow[];
    for (const p of rows) {
      if (!p.client_id) continue;
      paidByClient.set(p.client_id, (paidByClient.get(p.client_id) ?? 0) + (p.amount ?? 0));
    }
    if (rows.length < PAGE) break;
  }

  const header = "Client,Email,Plan,Status,Started,Ends,Paid to date (USD)";
  const lines = subs.map((r) => {
    const c = Array.isArray(r.client) ? r.client[0] : r.client;
    const p = Array.isArray(r.plan) ? r.plan[0] : r.plan;
    return [
      c?.full_name ?? c?.name ?? "",
      c?.email ?? "",
      p?.name ?? "",
      r.status,
      r.start_date,
      r.end_date ?? "",
      ((paidByClient.get(r.client_id) ?? 0) / 100).toFixed(2),
    ];
  });

  const csv = [header, ...lines.map((l) => l.map(csvSafeField).join(","))].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coregym-subscribers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
