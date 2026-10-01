import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { dbError } from "@/lib/api-error";
import { csvSafeField } from "@/lib/csv";
import { rateLimit } from "@/lib/rate-limit";

// CSV export of the coach's OWN payment_intents rows (Revenue "Export" button).
// Auth pattern mirrors /api/plans: authenticated coach only, own-coach rows
// only (every read is .eq("coach_id", ...)), DB internals masked via dbError.
// API-02: bounded retrieval — rows stream in pages of 500 via .range() until
// exhausted, so a large tenant cannot blow the function's memory/time limits.
// Fees: this route reads the local DB only (no Stripe calls), so the platform
// fee / net columns are the 15% estimate and are LABELLED as such in the header.

const PAGE = 500;
const MAX_PAGES = 20; // 10k rows ceiling — the ledger UI reads the same bound
const DAY = 86_400_000;
const PLATFORM_FEE = 0.15;

type TxRow = {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  stripe_payment_id: string | null;
  created_at: string;
  client_id: string | null;
};

export async function GET(req: NextRequest) {
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
  if (rateLimit(`revenue-export:${coachId}`, 1, 60_000)) {
    return NextResponse.json({ error: "Export is rate-limited — try again in a minute" }, { status: 429 });
  }

  // ?range=30d|90d|all — same windows as the page. Invalid values fall back
  // to 30d so a crafted param can never widen the export.
  const raw = req.nextUrl.searchParams.get("range");
  const days = raw === "90d" ? 90 : raw === "all" ? null : 30;
  const start = days != null ? new Date(Date.now() - days * DAY) : null;

  // Athlete identities for the exported rows (own-coach clients only — ids
  // are filtered to the coach's payment rows below).
  const txs: TxRow[] = [];
  for (let from = 0; from < MAX_PAGES * PAGE; from += PAGE) {
    let q = supabase
      .from("payment_intents")
      .select("id, amount, currency, status, stripe_payment_id, created_at, client_id")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (start) q = q.gte("created_at", start.toISOString());
    const { data, error } = await q;
    if (error) return NextResponse.json(dbError("revenue/export", error), { status: 400 });
    const rows = (data ?? []) as unknown as TxRow[];
    txs.push(...rows);
    if (rows.length < PAGE) break;
  }

  const clientIds = [...new Set(txs.map((t) => t.client_id).filter(Boolean))] as string[];
  const { data: clientRows, error: clientErr } = clientIds.length
    ? await supabase.from("profiles").select("id, full_name, name, email").in("id", clientIds)
    : { data: [], error: null };
  if (clientErr) return NextResponse.json(dbError("revenue/export", clientErr), { status: 400 });
  const profileById = new Map(
    ((clientRows ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      name: string | null;
      email: string | null;
    }>).map((p) => [p.id, p]),
  );

  const header =
    "Transaction ID,Athlete,Email,Status,Gross (USD),Platform fee (est. 15%),Net (est.),Created";
  const lines = txs.map((t) => {
    const p = t.client_id ? profileById.get(t.client_id) : undefined;
    const amount = t.amount ?? 0;
    const fee = Math.round(amount * PLATFORM_FEE);
    return [
      t.id,
      p?.full_name ?? p?.name ?? "",
      p?.email ?? "",
      t.status ?? "",
      (amount / 100).toFixed(2),
      (fee / 100).toFixed(2),
      ((amount - fee) / 100).toFixed(2),
      t.created_at,
    ];
  });

  const csv = [header, ...lines.map((l) => l.map(csvSafeField).join(","))].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  const suffix = raw === "90d" || raw === "all" ? raw : "30d";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coregym-revenue-${suffix}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
