import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getStripe } from "@/lib/stripe/server";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { clampPage, parsePageParam, pageRange, pageCount } from "@/lib/pagination";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard, StatCardChip } from "@/components/core/StatCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlobalLink } from "@/components/shared/link";
import { RevenueRangeSelector, resolveRevRange } from "@/components/revenue/RevenueRangeSelector";
import { RevenueVelocityChart, type VelocityWeek } from "@/components/revenue/RevenueVelocityChart";
import { TransactionsLedger, type LedgerRow } from "@/components/revenue/TransactionsLedger";
import { PayoutCards, type PayoutCardData } from "@/components/revenue/PayoutCards";
import { Download, ExternalLink, Landmark } from "lucide-react";

const DAY = 86_400_000;
// 15% platform commission — the constant every local estimate here, on
// /api/revenue/export and in the plans payout preview must agree with.
const PLATFORM_FEE = 0.15;
// Bounded-read guardrail: aggregate reads never scan past 2000 rows
// (remediation P1 rule — the ledger count surfaces truncation honestly).
const MAX_ROWS = 2000;

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

type TxRow = {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
  client_id: string | null;
  stripe_payment_id: string | null;
};

type PayoutRow = {
  id: string;
  amount: number;
  currency: string;
  arrival_date: number;
  status: string;
  method: string | null;
};

export default async function RevenuePage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; page?: string }>;
}) {
  const { t, fmt } = await getI18n();
  const params = (await searchParams) ?? {};
  const range = resolveRevRange(params.range);
  const now = new Date();
  const nowMs = now.getTime();
  const windowDays = range === "90d" ? 90 : 30;
  const start = range === "all" ? null : new Date(nowMs - windowDays * DAY);
  const prevStart = start ? new Date(start.getTime() - windowDays * DAY) : null;

  const statusLabel = (status: string | null) =>
    (status && STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status) ?? t("common.state.unknown");

  const supabase = await createClient();
  const user = await getCurrentUser();

  let gross = 0;
  let commission = 0;
  let net = 0;
  let prevGross = 0;
  let txTotal = 0;
  let page = 1;
  let payouts: PayoutRow[] = [];
  let transactions: TxRow[] = [];
  let ledgerRows: LedgerRow[] = [];
  let isStripe = false;
  let acctId: string | null = null;
  // Live Stripe balance (settlement routing card) — null = unavailable.
  let balance: { available: number; pending: number } | null = null;
  // Real fee per Stripe payment id, matched into the ledger (bt.source).
  const feeBySource = new Map<string, number>();
  // Weekly velocity rows — live bt payments (real fees) or db rows (15% est.).
  let velocityRows: { ts: number; amount: number; fee: number }[] = [];
  let velocityLive = false;
  // Error NOTE flags — raw internals stay server-side (error-masking rule).
  let stripeNote = false;
  let dbNote = false;

  if (user) {
    const coachId = await resolveCoachId(supabase, user.id);

    // Round 1 — independent bounded reads. `start` scopes every read to the
    // selected range (?range=30d|90d|all); "all" has no lower bound.
    const [countRes, coachRes, chartRes, prevRes] = await Promise.all([
      (async () => {
        let q = supabase
          .from("payment_intents")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", coachId);
        if (start) q = q.gte("created_at", start.toISOString());
        return q;
      })(),
      // stripe_account_id lives on the coaches row (canonical), not profiles
      supabase.from("coaches").select("stripe_account_id").eq("id", coachId).single(),
      (async () => {
        let q = supabase
          .from("payment_intents")
          .select("amount, created_at")
          .eq("coach_id", coachId)
          .eq("status", "succeeded");
        if (start) q = q.gte("created_at", start.toISOString());
        return q.order("created_at", { ascending: true }).limit(MAX_ROWS);
      })(),
      prevStart && start
        ? supabase
            .from("payment_intents")
            .select("amount")
            .eq("coach_id", coachId)
            .eq("status", "succeeded")
            .gte("created_at", prevStart.toISOString())
            .lt("created_at", start.toISOString())
            .limit(MAX_ROWS)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    txTotal = countRes.count ?? 0;
    const succeededRows = (chartRes.data ?? []) as unknown as Array<{ amount: number | null; created_at: string }>;
    prevGross = ((prevRes.data ?? []) as unknown as Array<{ amount: number | null }>).reduce(
      (s, r) => s + (r.amount ?? 0),
      0,
    );

    // Gross/net precedence (unchanged): live Stripe balanceTransactions win →
    // succeeded payment_intents (bounded at MAX_ROWS) → 0. The db aggregate
    // also feeds the weekly chart when Stripe isn't live.
    gross = succeededRows.reduce((s, r) => s + (r.amount ?? 0), 0);

    page = clampPage(parsePageParam(params.page), txTotal);
    const { from, to } = pageRange(page);

    // Round 2 — the ledger page slice (range-scoped, newest first).
    let txQuery = supabase
      .from("payment_intents")
      .select("id, amount, currency, status, created_at, client_id, stripe_payment_id")
      .eq("coach_id", coachId);
    if (start) txQuery = txQuery.gte("created_at", start.toISOString());
    const { data: txData, error: txErr } = await txQuery
      .order("created_at", { ascending: false })
      .range(from, to);
    if (txErr) {
      dbNote = true;
    } else {
      transactions = (txData ?? []) as unknown as TxRow[];
    }

    // Round 3 — athlete identities + plan tiers for the page rows.
    // payment_intents.client_id references auth.users (NOT profiles), so rows
    // and profiles are fetched separately and mapped in memory (ids match 1:1).
    const clientIds = [...new Set(transactions.map((x) => x.client_id).filter(Boolean))] as string[];
    const txIds = transactions.map((x) => x.id);
    const [profilesRes, tiersRes] = await Promise.all([
      clientIds.length
        ? supabase.from("profiles").select("id, full_name, name, email, avatar_url").in("id", clientIds)
        : Promise.resolve({ data: [] as unknown[] }),
      // tier is a newer column — a legacy schema without it must only hide the
      // chip, never blank the ledger, so this lookup degrades silently.
      txIds.length
        ? supabase.from("payment_intents").select("id, tier").in("id", txIds).limit(100)
        : Promise.resolve({ data: [] as unknown[], error: null as unknown }),
    ]);
    const profileById = new Map(
      ((profilesRes.data ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
      }>).map((p) => [p.id, p]),
    );
    const tierById = new Map<string, string>();
    if (!tiersRes.error) {
      for (const r of (tiersRes.data ?? []) as unknown as Array<{ id: string; tier: string | null }>) {
        if (r.tier) tierById.set(r.id, r.tier);
      }
    }

    // Live Stripe reads — every call .catch()-guarded so a Stripe failure can
    // never throw into render; the masked note tells the coach instead.
    try {
      const acct = (coachRes.data as { stripe_account_id?: string } | null)?.stripe_account_id ?? null;
      if (acct && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
        acctId = acct;
        const stripe = getStripe();
        const [payoutList, bt, bal] = await Promise.all([
          stripe.payouts.list({ limit: 10 }, { stripeAccount: acct }).catch(() => null),
          stripe.balanceTransactions.list({ limit: 100 }, { stripeAccount: acct }).catch(() => null),
          stripe.balance.retrieve({}, { stripeAccount: acct }).catch(() => null),
        ]);
        if (payoutList) {
          payouts = payoutList.data.map((p) => ({
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            arrival_date: p.arrival_date,
            status: p.status,
            method: typeof p.method === "string" ? p.method : null,
          }));
          isStripe = true;
        }
        if (bal) {
          balance = {
            available: bal.available.reduce((s, x) => s + x.amount, 0),
            pending: bal.pending.reduce((s, x) => s + x.amount, 0),
          };
        }
        if (bt) {
          // Honest accounting from real balance transactions:
          //   gross = Σ amount, net = Σ net (Stripe fees already deducted),
          //   platform commission = the actual amount − net delta.
          const startMs = start ? start.getTime() : null;
          const payments = bt.data.filter(
            (x) => x.type === "payment" && (startMs == null || x.created * 1000 >= startMs),
          );
          for (const x of bt.data) {
            feeBySource.set(String(x.source), x.amount - x.net);
          }
          const stripeGross = payments.reduce((s, x) => s + x.amount, 0);
          const stripeNet = payments.reduce((s, x) => s + x.net, 0);
          if (stripeGross > 0) {
            gross = stripeGross;
            net = stripeNet;
            commission = stripeGross - stripeNet;
          }
          velocityRows = payments.map((x) => ({
            ts: x.created * 1000,
            amount: x.amount,
            fee: x.amount - x.net,
          }));
          velocityLive = true;
        }
      }
    } catch {
      stripeNote = true;
    }

    if (!isStripe) {
      // Local commission estimate only when Stripe isn't live — 15% of real gross
      commission = Math.round(gross * PLATFORM_FEE);
      net = gross - commission;
    }
    if (!velocityLive) {
      velocityRows = succeededRows.map((r) => ({
        ts: new Date(r.created_at).getTime(),
        amount: r.amount ?? 0,
        fee: Math.round((r.amount ?? 0) * PLATFORM_FEE),
      }));
    }

    // Ledger rows — fees matched to real Stripe balance transactions by
    // bt.source → payment_intents.stripe_payment_id, else the 15% estimate
    // (labelled "est." in the UI; never presented as an actual Stripe fee).
    ledgerRows = transactions.map((tx) => {
      const profile = tx.client_id ? profileById.get(tx.client_id) : undefined;
      const matchedFee = tx.stripe_payment_id ? feeBySource.get(tx.stripe_payment_id) : undefined;
      const fee = matchedFee != null ? matchedFee : Math.round((tx.amount ?? 0) * PLATFORM_FEE);
      return {
        id: tx.id,
        name:
          profile?.full_name ?? profile?.name ?? profile?.email ?? (tx.client_id ? tx.client_id.slice(0, 8) : null),
        email: profile?.email ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        tier: tierById.get(tx.id) ?? null,
        grossLabel: fmt.money(tx.amount ?? 0),
        feeLabel: `−${fmt.money(fee)}`,
        feeEst: matchedFee == null,
        netLabel: fmt.money((tx.amount ?? 0) - fee),
        whenLabel: fmt.dateTime(tx.created_at),
        status: tx.status,
        statusLabel: statusLabel(tx.status),
      };
    });
  } else {
    commission = Math.round(gross * PLATFORM_FEE);
    net = gross - commission;
  }

  // Weekly buckets — 7-day steps from the window start ("all" starts at the
  // earliest loaded payment) to now; the last bucket holds the current week.
  const firstTs = velocityRows.length > 0 ? Math.min(...velocityRows.map((r) => r.ts)) : nowMs - DAY;
  const chartStartMs = start ? start.getTime() : Math.min(firstTs, nowMs);
  const weeks: VelocityWeek[] = [];
  {
    let cursor = chartStartMs;
    // Practical ceiling (260 weeks ≈ 5y) — rows are bounded at MAX_ROWS anyway.
    while (cursor < nowMs && weeks.length < 260) {
      const end = Math.min(cursor + 7 * DAY, nowMs);
      const inWeek = velocityRows.filter((r) => r.ts >= cursor && r.ts < end);
      const grossW = inWeek.reduce((s, r) => s + r.amount, 0);
      const feeW = inWeek.reduce((s, r) => s + r.fee, 0);
      const netW = Math.max(0, grossW - feeW);
      weeks.push({
        key: cursor,
        label: fmt.date(cursor, { month: "short", day: "numeric" }),
        netCents: netW,
        platformCents: grossW - netW,
        netLabel: fmt.money(netW),
        current: end >= nowMs,
      });
      cursor = end;
    }
  }
  const velocityGross = velocityRows.reduce((s, r) => s + r.amount, 0);
  const daysInRange = start ? windowDays : Math.max(1, Math.ceil((nowMs - chartStartMs) / DAY));
  const avgDaily = velocityGross > 0 ? fmt.money(Math.round(velocityGross / daysInRange)) : null;
  const chartFooter = avgDaily
    ? {
        avgDaily: t("revenue.chart.avgDaily", { money: avgDaily }),
        txCount: t("revenue.chart.txInRange", { n: velocityRows.length }),
      }
    : null;

  const nextPayout = payouts.find((p) => p.status !== "paid") ?? null;
  const liquidityTotal = balance ? balance.available + balance.pending : 0;
  const liquidityPct =
    balance && liquidityTotal > 0 ? Math.round((balance.available / liquidityTotal) * 100) : 0;

  const netRetainedPct = gross > 0 ? Math.round((net / gross) * 100) : null;
  const commissionPct = gross > 0 ? ((commission / gross) * 100).toFixed(1) : null;
  const grossPct = prevGross > 0 ? Math.round(((gross - prevGross) / prevGross) * 100) : null;

  const rangeLabel =
    range === "all" || !start
      ? t("revenue.range.all")
      : `${fmt.date(start, { month: "short", day: "numeric" })} – ${fmt.date(now, { month: "short", day: "numeric" })} · ${t(range === "90d" ? "revenue.range.90d" : "revenue.range.30d")}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("revenue.page.title")}
        description={isStripe ? t("revenue.page.subtitleLive") : t("revenue.page.subtitleLocal")}
        meta={
          isStripe && acctId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-label-sm text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {t("revenue.page.connectedAcct", { acct: acctId.slice(-6) })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-label-sm text-muted-foreground">
              <span className="size-1.5 rounded-full bg-current" />
              {t("revenue.page.badgeLocal")}
            </span>
          )
        }
        actions={
          <>
            <RevenueRangeSelector current={range} rangeLabel={rangeLabel} />
            {transactions.length > 0 && (
              <Button render={<a href={`/api/revenue/export?range=${range}`} download />} variant="secondary">
                <Download className="size-4" />
                {t("common.actions.export")}
              </Button>
            )}
            {isStripe && (
              <Button
                render={<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" />}
                className="shadow-md shadow-primary/20"
              >
                <Landmark className="size-4" />
                {t("revenue.page.portal")}
                <ExternalLink className="size-4" />
              </Button>
            )}
          </>
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
          value={fmt.money(gross)}
          trend={grossPct != null ? (grossPct > 0 ? "up" : grossPct < 0 ? "down" : "flat") : undefined}
          trendLabel={grossPct != null ? `${grossPct > 0 ? "+" : "−"}${Math.abs(grossPct)}%` : undefined}
          footer={
            <>
              <span>
                {prevGross > 0
                  ? t("revenue.kpi.gross.prev", { money: fmt.money(prevGross) })
                  : t("revenue.kpi.gross.desc")}
              </span>
              <span className="tabular-nums">{t("revenue.kpi.gross.billings", { n: txTotal })}</span>
            </>
          }
        />
        <StatCard
          label={t("revenue.kpi.commission.title")}
          value={`−${fmt.money(commission)}`}
          valueClassName="text-muted-foreground"
          badge={
            <StatCardChip>
              {isStripe && commissionPct != null
                ? t("revenue.kpi.commission.actualLive", { p: commissionPct })
                : t("revenue.kpi.commission.fixed")}
            </StatCardChip>
          }
          footer={
            <span>
              {isStripe ? t("revenue.kpi.commission.descLive") : t("revenue.kpi.commission.descEstimate")}
            </span>
          }
        />
        <StatCard
          label={t("revenue.kpi.net.title")}
          value={fmt.money(net)}
          valueClassName="text-primary"
          footer={
            <span>
              {netRetainedPct != null
                ? t("revenue.kpi.net.retained", { p: netRetainedPct })
                : t("revenue.kpi.net.desc")}
            </span>
          }
        />
        {nextPayout && (
          <StatCard
            label={<span className="text-primary">{t("revenue.kpi.next.title")}</span>}
            value={fmt.money(nextPayout.amount)}
            className="bg-secondary shadow-md ring-primary/20"
            badge={
              <StatCardChip>
                {nextPayout.method === "instant"
                  ? t("revenue.kpi.next.methodInstant")
                  : nextPayout.method === "standard"
                    ? t("revenue.kpi.next.methodStandard")
                    : statusLabel(nextPayout.status)}
              </StatCardChip>
            }
            footer={
              <span className="flex items-center gap-1.5">
                {t("revenue.kpi.next.arrival", { date: fmt.dateTime(nextPayout.arrival_date * 1000) })}
              </span>
            }
          />
        )}
      </div>

      {/* Weekly velocity bento — chart + settlement routing */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-8">
          <RevenueVelocityChart
            weeks={weeks}
            title={t("revenue.chart.title")}
            subtitle={t("revenue.chart.subtitle")}
            legendNet={t("revenue.chart.legendNet")}
            legendPlatform={t("revenue.chart.legendPlatform")}
            emptyLabel={t("revenue.chart.empty")}
            footer={chartFooter}
          />
        </div>
        <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-border lg:col-span-4">
          <div>
            <h2 className="font-display text-headline-sm text-foreground">{t("revenue.routing.title")}</h2>
            <p className="mt-0.5 text-body-sm text-faint">
              {isStripe ? t("revenue.routing.subtitle") : t("revenue.routing.connectHint")}
            </p>
          </div>
          {isStripe ? (
            balance ? (
              <div className="flex flex-1 flex-col justify-center gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm text-muted-foreground">{t("revenue.routing.available")}</span>
                  <span className="font-display text-headline-sm font-bold tabular-nums text-primary">
                    {fmt.money(balance.available)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm text-muted-foreground">{t("revenue.routing.pending")}</span>
                  <span className="font-semibold tabular-nums text-foreground">{fmt.money(balance.pending)}</span>
                </div>
                <div className="h-2 rounded-full bg-primary/20">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${liquidityPct}%` }}
                  />
                </div>
                <p className="text-label-sm text-faint">{t("revenue.routing.liquidity", { p: liquidityPct })}</p>
              </div>
            ) : (
              <p className="flex flex-1 items-center text-body-sm text-muted-foreground">
                {t("revenue.routing.unavailable")}
              </p>
            )
          ) : (
            <div className="flex flex-1 items-start justify-center">
              <GlobalLink
                href="/dashboard/settings"
                className={buttonVariants({ className: "shadow-md shadow-primary/20" })}
              >
                {t("revenue.routing.connectCta")}
              </GlobalLink>
            </div>
          )}
        </div>
      </div>

      <TransactionsLedger
        rows={ledgerRows}
        total={txTotal}
        page={page}
        totalPages={pageCount(txTotal)}
        range={range}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-headline-md">{t("revenue.payouts.title")}</CardTitle>
          <CardDescription>
            {isStripe ? t("revenue.payouts.descLive") : t("revenue.payouts.descLocal")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length > 0 ? (
            <PayoutCards
              payouts={payouts.map<PayoutCardData>((p) => ({
                id: p.id,
                amountLabel: fmt.money(p.amount),
                destinationLabel: t("revenue.payouts.destination", { v: p.currency.toUpperCase() }),
                statusLabel: statusLabel(p.status),
                status: p.status,
                methodLabel:
                  p.method === "instant"
                    ? t("revenue.kpi.next.methodInstant")
                    : p.method === "standard"
                      ? t("revenue.kpi.next.methodStandard")
                      : null,
                whenLabel:
                  p.status === "paid"
                    ? t("revenue.payouts.settled", { date: fmt.date(p.arrival_date * 1000) })
                    : t("revenue.payouts.estimated", { date: fmt.date(p.arrival_date * 1000) }),
              }))}
            />
          ) : (
            <p className="py-8 text-center text-body-md text-muted-foreground">{t("revenue.payouts.empty")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
