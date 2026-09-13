import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let stripeAccountId: string | null = null;

  if (user) {
    const { data } = await supabase.from("profiles").select("stripe_account_id, full_name, email").eq("id", user.id).single();
    if (data && (data as { stripe_account_id?: string }).stripe_account_id) {
      stripeAccountId = (data as { stripe_account_id: string }).stripe_account_id;
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Settings — Payouts</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stripe Connect (Express)</CardTitle>
          <CardDescription>
            Coach onboarding: creates an Express account and redirects through Stripe Account Link flow. Stores <code className="font-mono">stripe_account_id</code> on the coach row ([NEW] column if missing).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Status:</span>
            {stripeAccountId ? <Badge>Connected — {stripeAccountId.slice(0, 12)}…</Badge> : <Badge variant="secondary">Not connected</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Payment flow (when live): PaymentIntents are created with <code className="font-mono">application_fee_amount</code> (platform commission) and <code className="font-mono">transfer_data.destination = stripe_account_id</code>.
            Webhook at <code className="font-mono">/api/webhooks/stripe</code> handles <code>payment_intent.succeeded</code>, <code>account.updated</code> and subscription events.
          </p>
          <SettingsClient stripeAccountId={stripeAccountId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect flow (to be implemented with real Stripe keys)</CardTitle>
          <CardDescription>Steps per prompt §5.1-5.2 — flagged as future Stripe work per your “we will make it later” note.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>POST <code>/api/stripe/connect</code> → creates the Express account if missing plus an Account Link, and returns the onboarding URL.</li>
            <li>Route stores <code>stripe_account_id</code> on <code>profiles</code>.</li>
            <li>Checkout creates PaymentIntent with <code>application_fee_amount</code> + <code>transfer_data.destination</code> (to be implemented).</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
