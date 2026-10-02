import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { PlansClient } from "@/components/plans/PlansClient";
import { getI18n } from "@/lib/i18n/server";
import { StatCard } from "@/components/core/StatCard";
import type { SubscriptionPlan } from "@/lib/supabase/types";

export default async function PlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { t, fmt } = await getI18n();
  const supabase = await createClient();
  const user = await getCurrentUser();

  let plans: SubscriptionPlan[] = [];
  let coachId = "";
  let error: string | null = null;
  let page = 1;
  let total = 0;
  let activeSubs = 0;
  let avgPrice: number | null = null;
  let avgPlans = 0;
  // Capacity ceiling = Σ max_clients, known only when EVERY loaded plan is
  // capped (one unlimited plan makes the fleet cap meaningless → omit rail).
  let capTotal: number | null = null;
  // Active subscriptions per plan id (roster-load meters + "Most popular").
  const counts: Record<string, number> = {};

  if (user) {
    // subscription_plans.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);
    // P3: exact total first (for clamp + pager), then the bounded page slice.
    const [{ count }, activeRes, pricesRes, planSubsRes] = await Promise.all([
      supabase.from("subscription_plans").select("id", { count: "exact", head: true }).eq("coach_id", coachId),
      // Roster KPI: coaches' active subscriptions (head-count only)
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "active"),
      // Price list for the real average (plans are a small bounded set —
      // capped defensively so a data anomaly can never unbounded-scan here)
      supabase.from("subscription_plans").select("price_usd, max_clients").eq("coach_id", coachId).limit(500),
      // Per-plan distribution for the roster-load meters — head-count rows only,
      // reduced in JS (bounded at 2000 like every aggregate read here)
      supabase.from("subscriptions").select("plan_id").eq("coach_id", coachId).eq("status", "active").limit(2000),
    ]);
    total = count ?? 0;
    activeSubs = activeRes.count ?? 0;
    const priceRows = (pricesRes.data ?? []) as unknown as Array<{ price_usd: number | null; max_clients: number | null }>;
    const prices = priceRows
      .map((r) => Number(r.price_usd ?? 0))
      .filter((v) => !Number.isNaN(v));
    avgPlans = prices.length;
    avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    if (priceRows.length > 0 && priceRows.every((r) => r.max_clients != null)) {
      capTotal = priceRows.reduce((s, r) => s + (r.max_clients ?? 0), 0);
    }
    for (const row of (planSubsRes.data ?? []) as unknown as Array<{ plan_id: string | null }>) {
      if (!row.plan_id) continue;
      counts[row.plan_id] = (counts[row.plan_id] ?? 0) + 1;
    }

    page = clampPage(parsePageParam((await searchParams)?.page), total);
    const { from, to } = pageRange(page);
    const { data, error: qErr } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (qErr) {
      // Masked: DB internals never reach the UI (remediation-log rule)
      error = "load-failed";
    } else {
      plans = (data ?? []) as unknown as SubscriptionPlan[];
    }
  }

  const loadPct = capTotal && capTotal > 0 ? Math.round((activeSubs / capTotal) * 100) : null;
  const seatsLeft = capTotal != null ? Math.max(0, capTotal - activeSubs) : null;

  const kpis = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t("plans.kpi.published")}
        value={fmt.num(total)}
        footer={<span>{t("plans.kpi.activeSubsFooter", { n: activeSubs })}</span>}
      />
      <StatCard
        label={t("plans.kpi.avgPrice")}
        value={avgPrice != null ? fmt.money(Math.round(avgPrice * 100)) : "—"}
        footer={<span>{t("plans.kpi.avgAcross", { n: avgPlans })}</span>}
      />
      <StatCard
        label={t("plans.kpi.subscribed")}
        value={fmt.num(activeSubs)}
        suffix={capTotal != null ? t("plans.kpi.capSuffix", { n: capTotal }) : undefined}
        progress={loadPct ?? undefined}
        footer={
          <span>{loadPct != null ? t("plans.kpi.loaded", { p: loadPct }) : t("plans.kpi.subscribedHint")}</span>
        }
      />
      <StatCard
        label={t("plans.kpi.availableSeats")}
        value={seatsLeft != null ? fmt.num(seatsLeft) : "—"}
        valueClassName="text-primary"
        suffix={seatsLeft != null ? t("plans.kpi.seatsLeft") : undefined}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive"
        >
          {t("plans.page.loadError")}
        </div>
      )}

      <PlansClient
        initialPlans={plans}
        coachId={coachId}
        kpis={kpis}
        counts={counts}
        section={{ count: total, activeSubs }}
      />
      <Pager basePath="/dashboard/plans" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
