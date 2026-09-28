import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { PlansClient } from "@/components/plans/PlansClient";
import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/lib/i18n/server";
import type { SubscriptionPlan } from "@/lib/supabase/types";

export default async function PlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { t } = await getI18n();
  const supabase = await createClient();
  const user = await getCurrentUser();

  let plans: SubscriptionPlan[] = [];
  let coachId = "";
  let error: string | null = null;
  let page = 1;
  let total = 0;

  if (user) {
    // subscription_plans.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);
    // P3: exact total first (for clamp + pager), then the bounded page slice.
    const { count } = await supabase
      .from("subscription_plans")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId);
    total = count ?? 0;
    page = clampPage(parsePageParam((await searchParams)?.page), total);
    const { from, to } = pageRange(page);
    const { data, error: qErr } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (qErr) {
      error = qErr.message;
    } else {
      plans = (data ?? []) as unknown as SubscriptionPlan[];
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("plans.page.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("plans.page.subtitle")}{" "}
            <code className="font-mono">subscription_plans</code>
          </p>
        </div>
        {error && (
          <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
            {error}
          </Badge>
        )}
      </div>
      <PlansClient initialPlans={plans} coachId={coachId} />
      <Pager basePath="/dashboard/plans" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
