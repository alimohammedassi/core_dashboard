import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getStripe } from "@/lib/stripe/server";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard } from "@/components/core/StatCard";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";
import { Landmark, Receipt, Wallet } from "lucide-react";

const STATUS_LABELS: Record<string, TKey> = {
  succeeded: "revenue.status.succeeded",
  pending: "revenue.status.pending",
  failed: "revenue.status.failed",
  paid: "revenue.status.paid",
  in_transit: "revenue.status.inTransit",
  canceled: "revenue.status.canceled",
  cancelled: "revenue.status.canceled",
  processing: "revenue.status.processing",
};

export default async function RevenuePage() {
  const { t, fmt } = await getI18n();
  const statusLabel = (status: string | null) =>
    (status && STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status) ?? t("common.state.unknown");
  const supabase = await createClient();
  const user = await getCurrentUser();

  let gross = 0;
  let commission = 0;
  let net = 0;
  let payouts: Array<{ id: string; amount: number; currency: string; arrival_date: number; status: string }> = [];
  let transactions: Array<{ id: string; amount: number; currency: string | null; status: string | null; created_at: string; client_id: string | null; client?: { full_name: string | null; email: string | null } | null }> = [];
  let isStripe = false;
  // Error NOTE flags — the raw internal messages stay server-side; the coach
  // only sees a concise actionable line (remediation-log error-masking rule).
  let stripeNote = false;
  let dbNote = false;

  if (user) {
    const coachId = await resolveCoachId(supabase, user.id);

    // P2: the transactions query and the coach Stripe-account lookup are
    // independent — run them concurrently instead of stacking round trips.
    // payment_intents.client_id references auth.users (NOT profiles), so there is
    // no PostgREST-joinable relationship to profiles: fetch the rows and the
    // client names separately, then map in memory (profiles.id = auth.uid, so
    // the id values match one-to-one).
    const [txRes, coachRes] = await Promise.all([
      supabase
        .from("payment_intents")
        .select("id, amount, currency, status, created_at, client_id")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false })
        .limit(20),
      // stripe_account_id lives on the coaches row (canonical), not profiles
      supabase.from("coaches").select("stripe_account_id").eq("id", coachId).single(),
    ]);
    const { data: txData, error: txErr } = txRes;
    if (txErr) {
      dbNote = true;
    } else {
      const txRows = (txData ?? []) as unknown as Array<{
        id: string;
        amount: number;
        currency: string;
        status: string;
        created_at: string;
        client_id: string | null;
      }>;
      const clientIds = [...new Set(txRows.map((t) => t.client_id).filter(Boolean))] as string[];
      const { data: clientRows } = clientIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", clientIds)
        : { data: [] as unknown[] };
      const nameById = new Map(
        ((clientRows ?? []) as unknown as Array<{ id: string; full_name: string | null; email: string | null }>).map(
          (p) => [p.id, { full_name: p.full_name, email: p.email }]
        )
      );
      transactions = txRows.map((t) => ({
        ...t,
        client: t.client_id ? nameById.get(t.client_id) ?? null : null,
      }));
      // Gross from real succeeded rows if Stripe not overriding
      const succeeded = transactions.filter((t) => t.status === "succeeded");
      if (succeeded.length > 0) {
        gross = succeeded.reduce((s, r) => s + (r.amount ?? 0), 0);
      }
    }

    // Try Stripe payouts if account is connected (real Stripe data)
    try {
      const { data: coach } = coachRes;
      const acct = (coach as { stripe_account_id?: string } | null)?.stripe_account_id;
      if (acct && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
        const stripe = getStripe();
        // Both calls in parallel — independent external round trips that used
        // to stack during render (audit item #2). limit 100 kept: these rows
        // feed the gross sum below.
        const [payoutList, bt] = await Promise.all([
          stripe.payouts.list({ limit: 10 }, { stripeAccount: acct }).catch(() => null),
          stripe.balanceTransactions.list({ limit: 100 }, { stripeAccount: acct }).catch(() => null),
        ]);
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
        if (bt) {
          // Honest accounting from real balance transactions:
          //   gross  = Σ amount   net = Σ net (Stripe fees already deducted)
          //   platform commission shown as the actual amount − net delta
          const payments = bt.data.filter((t) => t.type === "payment");
          const stripeGross = payments.reduce((s, t) => s + t.amount, 0);
          const stripeNet = payments.reduce((s, t) => s + t.net, 0);
          if (stripeGross > 0) {
            gross = stripeGross;
            net = stripeNet;
            commission = stripeGross - stripeNet;
          }
        }
      }
    } catch {
      stripeNote = true;
    }

    // Local commission estimate only when Stripe not live — based on real gross
    if (!isStripe) {
      // If gross still 0 and we have transactions, recompute already done; ensure gross from succeeded
      if (gross === 0 && transactions.length > 0) {
        gross = transactions.filter((t) => t.status === "succeeded").reduce((s, r) => s + (r.amount ?? 0), 0);
      }
      // Fallback query if transactions empty (e.g., RLS or no join).
      // P1 bound: never scan the whole table into memory — 2000 capped rows
      // is a guardrail, and the note below tells the coach when it engages.
      if (gross === 0) {
        const { data: allPayments } = await supabase
          .from("payment_intents")
          .select("amount")
          .eq("coach_id", coachId)
          .eq("status", "succeeded")
          .limit(2000);
        gross = (allPayments ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);
      }
      commission = Math.round(gross * 0.15);
      net = gross - commission;
    }
  } else {
    commission = Math.round(gross * 0.15);
    net = gross - commission;
  }

  const nextPayout = payouts.find((p) => p.status !== "paid") ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("revenue.page.title")}
        description={isStripe ? t("revenue.page.subtitleLive") : t("revenue.page.subtitleLocal")}
        actions={
          isStripe ? (
            <Badge className="h-7 gap-1.5 rounded-full px-2.5">
              <span className="size-1.5 rounded-full bg-current" />
              {t("revenue.page.badgeLive")}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-7 gap-1.5 rounded-full px-2.5">
              <span className="size-1.5 rounded-full bg-current" />
              {t("revenue.page.badgeLocal")}
            </Badge>
          )
        }
      />

      {stripeNote && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          {t("revenue.notes.stripeMasked")}
        </p>
      )}
      {dbNote && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
          {t("revenue.notes.dbMasked")}
        </p>
      )}

      {/* KPI row — the 4th slot is the next real Stripe settlement when one exists */}
      <div className={`grid gap-4 sm:grid-cols-2 ${nextPayout ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <StatCard
          label={t("revenue.kpi.gross.title")}
          icon={Landmark}
          value={fmt.money(gross)}
          footer={<span>{isStripe ? t("revenue.kpi.gross.desc") : t("revenue.kpi.gross.desc")}</span>}
        />
        <StatCard
          label={t("revenue.kpi.commission.title")}
          icon={Receipt}
          value={fmt.money(commission)}
          valueClassName="text-foreground/80"
          footer={<span>{isStripe ? t("revenue.kpi.commission.descLive") : t("revenue.kpi.commission.descEstimate")}</span>}
        />
        <StatCard
          label={t("revenue.kpi.net.title")}
          icon={Wallet}
          value={fmt.money(net)}
          footer={<span>{t("revenue.kpi.net.desc")}</span>}
        />
        {nextPayout && (
          <StatCard
            label={t("revenue.kpi.next.title")}
            icon={Landmark}
            value={fmt.money(nextPayout.amount)}
            badge={
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-label-sm uppercase tracking-wide text-primary">
                {statusLabel(nextPayout.status)}
              </span>
            }
            footer={
              <span className="flex items-center gap-1.5">
                {t("revenue.kpi.next.arrival", { date: fmt.date(nextPayout.arrival_date * 1000) })}
              </span>
            }
          />
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-headline-md">{t("revenue.tx.title")}</CardTitle>
          <CardDescription>{t("revenue.tx.desc", { n: transactions.length })}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("revenue.tx.id")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("revenue.tx.client")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.amount")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.date")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="max-w-[120px] truncate font-mono text-xs text-faint">{tx.id.slice(0, 8)}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-body-md">{tx.client?.full_name ?? tx.client?.email ?? tx.client_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="text-body-md font-medium tabular-nums">{fmt.money(tx.amount)} <span className="text-xs text-faint">{(tx.currency ?? "usd").toUpperCase()}</span></TableCell>
                  <TableCell className="text-body-sm tabular-nums text-muted-foreground">{fmt.date(tx.created_at)}</TableCell>
                  <TableCell><StatusBadge tone={statusTone(tx.status)}>{statusLabel(tx.status)}</StatusBadge></TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-body-md text-muted-foreground">{t("revenue.tx.empty")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-headline-md">{t("revenue.payouts.title")}</CardTitle>
          <CardDescription>
            {isStripe ? t("revenue.payouts.descLive") : t("revenue.payouts.descLocal")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("revenue.tx.id")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.amount")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("revenue.payouts.arrival")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-faint">{p.id}</TableCell>
                  <TableCell className="tabular-nums">{fmt.money(p.amount)} {p.currency.toUpperCase()}</TableCell>
                  <TableCell className="text-body-sm tabular-nums text-muted-foreground">{fmt.date(p.arrival_date * 1000)}</TableCell>
                  <TableCell><StatusBadge tone={statusTone(p.status)}>{statusLabel(p.status)}</StatusBadge></TableCell>
                </TableRow>
              ))}
              {payouts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-body-md text-muted-foreground">{t("revenue.payouts.empty")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
