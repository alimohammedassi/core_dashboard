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
  let isStripe = false;
  let errorNote: string | null = null;
  let dbError: string | null = null;

  if (user) {
    // payment_intents.coach_id references coaches.id, not the auth uid
    const coachId = await resolveCoachId(supabase, user.id);

    // Try Stripe first (real data for connected account)
    try {
      const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("id", user.id).single();
      const acct = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;
      if (acct && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
        const stripe = getStripe();
        // Balance transactions for connected account would be fetched via stripe.balanceTransactions.list with stripeAccount header
        // For platform-level demo, list payouts for the account
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
        // Also attempt balance transactions for gross
        const bt = await stripe.balanceTransactions.list({ limit: 100 }, { stripeAccount: acct }).catch(() => null);
        if (bt) {
          gross = bt.data.filter((t) => t.type === "payment").reduce((s, t) => s + t.net, 0);
          // commission would be platform fee; net is what coach received
          // For Express, gross is in balanceTransactions amount, net is available
          net = gross;
        }
      }
    } catch (e: unknown) {
      errorNote = e instanceof Error ? e.message : String(e);
    }

    // Local payment_intents when Stripe not configured — real rows or real zeros
    if (!isStripe) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data: allPayments, error: payErr } = await supabase
        .from("payment_intents")
        .select("amount")
        .eq("coach_id", coachId)
        .eq("status", "succeeded");

      if (payErr) {
        dbError = payErr.message;
      } else {
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
          <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
          <p className="text-sm text-muted-foreground">
            Sourced from Stripe ({isStripe ? "live" : "local estimate"}). Commission deducted, net payout shown.
          </p>
        </div>
        {isStripe ? <Badge>Live Stripe data</Badge> : <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">Local estimate — 15% fee</Badge>}
      </div>

      {errorNote && <p className="text-xs text-amber-600">Stripe note: {errorNote}</p>}
      {dbError && <p className="text-xs text-red-600">Database note: {dbError}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gross revenue</CardTitle>
            <CardDescription>All-time</CardDescription>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cents(gross)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Platform commission</CardTitle>
            <CardDescription>15% deducted</CardDescription>
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
          <CardTitle className="text-base">Payouts</CardTitle>
          <CardDescription>
            {isStripe ? "Transfers / payouts for your connected account (Stripe balanceTransactions/transfers)." : "Local estimate — connect Stripe to see real transfers."}
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
