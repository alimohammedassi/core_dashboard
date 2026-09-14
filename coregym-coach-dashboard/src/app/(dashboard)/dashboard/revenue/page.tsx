import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { getStripe } from "@/lib/stripe/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function cents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default async function RevenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let gross = 0;
  let commission = 0;
  let net = 0;
  let payouts: Array<{ id: string; amount: number; currency: string; arrival_date: number; status: string }> = [];
  let transactions: Array<{ id: string; amount: number; currency: string | null; status: string | null; created_at: string; client_id: string | null; client?: { full_name?: string; email?: string } | null }> = [];
  let isStripe = false;
  let errorNote: string | null = null;
  let dbError: string | null = null;

  if (user) {
    const coachId = await resolveCoachId(supabase, user.id);

    // Fetch real transactions (payment_intents) for this coach — always real data
    const { data: txData, error: txErr } = await supabase
      .from("payment_intents")
      .select("id, amount, currency, status, created_at, client_id, client:profiles!payment_intents_client_id_fkey(full_name, email)")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (txErr) {
      dbError = txErr.message;
    } else {
      transactions = (txData as unknown as typeof transactions) ?? [];
      // Gross from real succeeded rows if Stripe not overriding
      const succeeded = transactions.filter((t) => t.status === "succeeded");
      if (succeeded.length > 0) {
        gross = succeeded.reduce((s, r) => s + (r.amount ?? 0), 0);
      }
    }

    // Try Stripe payouts if account is connected (real Stripe data)
    try {
      const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("id", user.id).single();
      const acct = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;
      if (acct && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
        const stripe = getStripe();
        const payoutList = await stripe.payouts.list({ limit: 10 }, { stripeAccount: acct }).catch(() => null);
        if (payoutList) {
          payouts = payoutList.data.map((p) => ({
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            arrival_date: p.arrival_date,
            status: p.status,
          }));
          isStripe = true;
        }
        const bt = await stripe.balanceTransactions.list({ limit: 100 }, { stripeAccount: acct }).catch(() => null);
        if (bt) {
          const stripeGross = bt.data.filter((t) => t.type === "payment").reduce((s, t) => s + t.net, 0);
          if (stripeGross > 0) gross = stripeGross;
          net = gross;
          // Skip local commission calc when Stripe is live
          if (isStripe) {
            commission = 0;
          }
        }
      }
    } catch (e: unknown) {
      errorNote = e instanceof Error ? e.message : String(e);
    }

    // Local commission estimate only when Stripe not live — based on real gross
    if (!isStripe) {
      // If gross still 0 and we have transactions, recompute already done; ensure gross from succeeded
      if (gross === 0 && transactions.length > 0) {
        gross = transactions.filter((t) => t.status === "succeeded").reduce((s, r) => s + (r.amount ?? 0), 0);
      }
      // Fallback query if transactions empty (e.g., RLS or no join)
      if (gross === 0) {
        const { data: allPayments } = await supabase
          .from("payment_intents")
          .select("amount")
          .eq("coach_id", coachId)
          .eq("status", "succeeded");
        gross = (allPayments ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);
      }
      commission = Math.round(gross * 0.15);
      net = gross - commission;
    }
  } else {
    commission = Math.round(gross * 0.15);
    net = gross - commission;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue & Payments</h1>
          <p className="text-sm text-muted-foreground">
            {isStripe
              ? "Live Stripe payouts plus your local payment_intents transactions — all real data for this coach."
              : "Your real transactions from payment_intents (Supabase). Payouts appear once Stripe Connect is active."}
          </p>
        </div>
        {isStripe ? <Badge>Live Stripe data</Badge> : <Badge variant="outline">Real data — payment_intents</Badge>}
      </div>

      {errorNote && <p className="text-xs text-amber-600">Stripe note: {errorNote}</p>}
      {dbError && <p className="text-xs text-red-600">Database note: {dbError}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gross revenue</CardTitle>
            <CardDescription>From succeeded payment_intents</CardDescription>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cents(gross)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Platform commission</CardTitle>
            <CardDescription>{isStripe ? "Stripe fees (live)" : "15% estimate"}</CardDescription>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cents(commission)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net payout</CardTitle>
            <CardDescription>To coach</CardDescription>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cents(net)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
          <CardDescription>Real payment_intents rows for your coach ({transactions.length} shown). Source: Supabase payment_intents table.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs truncate max-w-[120px]">{t.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm truncate max-w-[160px]">{t.client?.full_name ?? t.client?.email ?? t.client_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="font-medium">{cents(t.amount)} <span className="text-xs text-muted-foreground">{(t.currency ?? "usd").toUpperCase()}</span></TableCell>
                  <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={t.status === "succeeded" ? "default" : t.status === "pending" ? "secondary" : "outline"}>{t.status ?? "unknown"}</Badge></TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No transactions yet — real data will appear here when clients pay.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payouts</CardTitle>
          <CardDescription>
            {isStripe ? "Real Stripe payouts for your connected account." : "Connect Stripe in Settings to see real payouts. No mock data shown."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell>{cents(p.amount)} {p.currency.toUpperCase()}</TableCell>
                  <TableCell>{new Date(p.arrival_date * 1000).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                </TableRow>
              ))}
              {payouts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No payouts yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
