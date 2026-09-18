import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";

// CSV export of the coach's subscribers (Overview "Export" button).
function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  const [subsRes, paymentsRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        `
        id, client_id, status, start_date, end_date,
        plan:subscription_plans(name, price_usd),
        client:profiles!subscriptions_client_id_fkey(full_name, name, email)
        `
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false }),
    // Per-client lifetime revenue from real succeeded payments
    supabase.from("payment_intents").select("client_id, amount").eq("coach_id", coachId).eq("status", "succeeded"),
  ]);

  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 400 });

  const paidByClient = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as unknown as Array<{ client_id: string | null; amount: number }>) {
    if (!p.client_id) continue;
    paidByClient.set(p.client_id, (paidByClient.get(p.client_id) ?? 0) + (p.amount ?? 0));
  }

  type Row = {
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

  const header = "Client,Email,Plan,Status,Started,Ends,Paid to date (USD)";
  const lines = ((subsRes.data ?? []) as unknown as Row[]).map((r) => {
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

  const csv = [header, ...lines.map((l) => l.map(csvEscape).join(","))].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coregym-subscribers-${date}.csv"`,
    },
  });
}
