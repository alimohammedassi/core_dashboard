import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { PlansClient } from "@/components/plans/PlansClient";
import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard } from "@/components/core/StatCard";
import { CreditCard, Users, Wallet } from "lucide-react";
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

  if (user) {
    // subscription_plans.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);
    // P3: exact total first (for clamp + pager), then the bounded page slice.
    const [{ count }, activeRes, pricesRes] = await Promise.all([
      supabase.from("subscription_plans").select("id", { count: "exact", head: true }).eq("coach_id", coachId),
      // Roster KPI: coaches' active subscriptions (head-count only)
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "active"),
      // Price list for the real average (plans are a small bounded set —
      // capped defensively so a data anomaly can never unbounded-scan here)
      supabase.from("subscription_plans").select("price_usd").eq("coach_id", coachId).limit(500),
    ]);
    total = count ?? 0;
    activeSubs = activeRes.count ?? 0;
    const prices = ((pricesRes.data ?? []) as unknown as Array<{ price_usd: number | null }>)
      .map((r) => Number(r.price_usd ?? 0))
      .filter((v) => !Number.isNaN(v));
    avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

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
      error = qErr.message;
    } else {
      plans = (data ?? []) as unknown as SubscriptionPlan[];
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("plans.page.title")} description={t("plans.page.subtitle")} />

      {error && (
        <Badge variant="destructive" className="w-fit">
          {t("plans.page.loadError")}
        </Badge>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("plans.kpi.published")}
          icon={CreditCard}
          value={fmt.num(total)}
          footer={<span>{t("plans.page.subtitleShort")}</span>}
        />
        <StatCard
          label={t("plans.kpi.subscribed")}
          icon={Users}
          value={fmt.num(activeSubs)}
          footer={<span>{t("plans.kpi.subscribedHint")}</span>}
        />
        <StatCard
          label={t("plans.kpi.avgPrice")}
          icon={Wallet}
          value={avgPrice != null ? fmt.money(Math.round(avgPrice * 100)) : "—"}
          footer={<span>{t("plans.kpi.avgPriceHint")}</span>}
        />
      </div>

      <PlansClient initialPlans={plans} coachId={coachId} />
      <Pager basePath="/dashboard/plans" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
