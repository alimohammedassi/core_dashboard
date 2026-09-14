import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { TotalRevenueChart } from "@/components/dashboard/TotalRevenueChart";
import { CustomerSplitCard } from "@/components/dashboard/CustomerSplitCard";
import { TopProgramsTable } from "@/components/dashboard/TopProgramsTable";
import { WeeklyActivityChart } from "@/components/dashboard/WeeklyActivityChart";
import { RetentionGaugeCard } from "@/components/dashboard/RetentionGaugeCard";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const coachId = await resolveCoachId(supabase, user.id);

  // Date windows
  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevMonthEnd = new Date(monthStart);
  prevMonthEnd.setMilliseconds(-1);
  const last30Start = new Date(now);
  last30Start.setDate(now.getDate() - 30);
  const prev30Start = new Date(last30Start);
  prev30Start.setDate(prev30Start.getDate() - 30);

  let activeClients = 0;
  let activePrev = 0;
  let revenueThisMonthCents = 0;
  let revenuePrevMonthCents = 0;
  let sessionsCompleted = 0;
  let newEnrollments = 0;
  let newEnrollmentsPrev = 0;
  let weeklyPoints: { day: string; value: number }[] | undefined;
  let topRows: { id: string; name: string; sessions: number; revenue: string; rating: number }[] | undefined;
  let revenueChartPoints: { date: string; value: number; compare?: number }[] | undefined;
  let splitItems: { label: string; value: number; color: string }[] | undefined;
  let retention: number | null = null;
  let retentionTotal = 0;

  let hadError = false;

  // Only real data — no mock fallbacks. If table is empty, card shows empty state.
  try {
      const [
        subsActiveRes,
        subsLast30Res,
        subsPrev30Res,
        paymentsThisRes,
        paymentsPrevRes,
        assignmentsRes,
        plansRes,
        reviewsRes,
      ] = await Promise.all([
        supabase.from("subscriptions").select("id").eq("coach_id", coachId).eq("status", "active"),
        supabase.from("subscriptions").select("id").eq("coach_id", coachId).gte("created_at", last30Start.toISOString()),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("coach_id", coachId)
          .gte("created_at", prev30Start.toISOString())
          .lt("created_at", last30Start.toISOString()),
        supabase
          .from("payment_intents")
          .select("amount, created_at, status")
          .eq("coach_id", coachId)
          .eq("status", "succeeded")
          .gte("created_at", monthStart.toISOString()),
        supabase
          .from("payment_intents")
          .select("amount, created_at, status")
          .eq("coach_id", coachId)
          .eq("status", "succeeded")
          .gte("created_at", prevMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString()),
        supabase
          .from("workout_assignments")
          .select("id, status, scheduled_date")
          .eq("coach_id", coachId)
          .gte("scheduled_date", monthStart.toISOString().slice(0, 10))
          .eq("status", "completed"),
        supabase.from("subscription_plans").select("id, name, price_cents").eq("coach_id", coachId).limit(10),
        supabase.from("coach_reviews").select("rating, coach_id").eq("coach_id", coachId),
      ]);

      if (subsActiveRes.error) hadError = true;
      activeClients = subsActiveRes.data?.length ?? 0;
      activePrev = Math.max(0, activeClients - (subsLast30Res.data?.length ?? 0) + (subsPrev30Res.data?.length ?? 0));

      newEnrollments = subsLast30Res.data?.length ?? 0;
      newEnrollmentsPrev = subsPrev30Res.data?.length ?? 0;

      revenueThisMonthCents = (paymentsThisRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);
      revenuePrevMonthCents = (paymentsPrevRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0);

      sessionsCompleted = assignmentsRes.data?.length ?? 0;

      // Top programs: only real subscriptions — no invented sold/revenue. If a plan has 0 subscribers, sold=0.
      if (plansRes.data && plansRes.data.length > 0) {
        const planIds = plansRes.data.map((p: { id: string }) => p.id);
        const { data: subsByPlan } = await supabase.from("subscriptions").select("plan_id").in("plan_id", planIds).eq("coach_id", coachId);
        const counts: Record<string, number> = {};
        (subsByPlan ?? []).forEach((s: { plan_id: string | null }) => {
          if (s.plan_id) counts[s.plan_id] = (counts[s.plan_id] ?? 0) + 1;
        });
        // Only use real ratings; if no reviews, rating is 0 (will show as —)
        const avgRating =
          reviewsRes.data && reviewsRes.data.length
            ? (reviewsRes.data as { rating: number }[]).reduce((s, r) => s + r.rating, 0) / reviewsRes.data.length
            : 0;
        topRows = plansRes.data.slice(0, 8).map((p: { id: string; name: string; price_cents: number }) => {
          const sold = counts[p.id] ?? 0;
          const cents = sold * (p.price_cents ?? 0);
          // Rating: if avgRating is 0 (no reviews), keep 0; otherwise use avg
          const rating = avgRating ? Number(avgRating.toFixed(1)) : 0;
          return {
            id: p.id.slice(0, 6).toUpperCase(),
            name: p.name,
            sessions: sold,
            revenue: sold ? `$${(cents / 100).toLocaleString()}` : "$0",
            rating,
          };
        });
        // If no plan has any subscribers yet, keep rows but with 0 values — not fake inflated numbers.
      }

      // Weekly activity: real assignments per weekday last 7 days — no random filler
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      const { data: weekAssignments } = await supabase
        .from("workout_assignments")
        .select("scheduled_date")
        .eq("coach_id", coachId)
        .gte("scheduled_date", weekAgo.toISOString().slice(0, 10));
      if (weekAssignments && weekAssignments.length > 0) {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        (weekAssignments as { scheduled_date: string }[]).forEach((a) => {
          const d = new Date(a.scheduled_date);
          if (!isNaN(d.getTime())) counts[d.getDay()] += 1;
        });
        weeklyPoints = days.map((day, i) => ({ day, value: counts[i] }));
      }
      // else weeklyPoints stays undefined -> WeeklyActivityChart shows empty state

      // Retention: active / (active + cancelled) — only if there is at least one subscription
      const { data: cancelledSubs } = await supabase.from("subscriptions").select("id").eq("coach_id", coachId).in("status", ["cancelled", "canceled", "expired"]);
      const cancelledCount = cancelledSubs?.length ?? 0;
      retentionTotal = activeClients + cancelledCount;
      if (retentionTotal > 0) retention = Math.round((activeClients / retentionTotal) * 100);
      else retention = null; // no data — card will show empty state

      // Revenue chart: real daily sums. No synthetic value.
      const dailyThis: Record<string, number> = {};
      (paymentsThisRes.data ?? []).forEach((p: { amount: number; created_at: string }) => {
        const key = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        dailyThis[key] = (dailyThis[key] ?? 0) + (p.amount ?? 0) / 100;
      });
      const dailyPrev: Record<string, number> = {};
      (paymentsPrevRes.data ?? []).forEach((p: { amount: number; created_at: string }) => {
        const key = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        dailyPrev[key] = (dailyPrev[key] ?? 0) + (p.amount ?? 0) / 100;
      });
      if (Object.keys(dailyThis).length > 0) {
        const sortedKeys = Object.keys(dailyThis)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
          .slice(0, 10);
        revenueChartPoints = sortedKeys.map((k) => ({
          date: k,
          value: Math.round(dailyThis[k]),
          compare: dailyPrev[k] ?? 0,
        }));
      }
      // else revenueChartPoints stays undefined -> TotalRevenueChart shows empty state

      // Client breakdown: real counts by status (active / past_due / other)
      const { data: allSubsForSplit } = await supabase.from("subscriptions").select("status").eq("coach_id", coachId).limit(200);
      if (allSubsForSplit && allSubsForSplit.length > 0) {
        const active = allSubsForSplit.filter((s: { status: string }) => s.status === "active").length;
        const pastDue = allSubsForSplit.filter((s: { status: string }) => s.status === "past_due").length;
        const cancelled = allSubsForSplit.filter((s: { status: string }) => ["cancelled", "canceled", "expired"].includes(s.status)).length;
        const other = Math.max(0, allSubsForSplit.length - active - pastDue - cancelled);
        splitItems = [
          { label: "Active", value: active, color: "var(--primary)" },
          { label: "Past due", value: pastDue, color: "var(--accent-cyan)" },
          { label: "Cancelled", value: cancelled + other, color: "var(--accent-gold)" },
        ].filter((i) => i.value > 0);
        if (splitItems.length === 0) splitItems = undefined;
      }
    } catch (e) {
      console.error("[dashboard] data fetch failed", e);
      hadError = true;
    }

  // Trends — only if previous period exists, otherwise hide trend badge (no fake +XX%)
  const pct = (curr: number, prev: number): number | null => (prev === 0 ? null : ((curr - prev) / Math.max(prev, 1)) * 100);
  const trendActive = pct(activeClients, activePrev);
  const trendRevenue = pct(revenueThisMonthCents, revenuePrevMonthCents);
  const trendEnroll = pct(newEnrollments, newEnrollmentsPrev);

  const currency = (c: number) => `$${(c / 100).toLocaleString()}`;
  const revenueValue = currency(Math.round(revenueThisMonthCents * 0.85));
  const displayRevenue = revenueThisMonthCents ? revenueValue : "$0";

  // Real values only — zero means zero, not mocked 16 / 6.2K / 446.7K
  const displayActive = activeClients;
  const displaySessions = sessionsCompleted;
  const displaySessionsLabel = String(displaySessions);
  const displayEnroll = newEnrollments;

  // Helpers for empty-state text
  const trendLabel = (prev: number | null, curr: number) => {
    if (prev === null || prev === 0) return curr === 0 ? "No previous data" : "No previous period";
    return `vs. ${prev} last period`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" />
      {hadError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
          Some metrics could not be loaded. Showing real available data only.
        </div>
      )}

      {/* KPI row — real values only, trends hidden when no comparison */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active Clients"
          value={displayActive}
          trend={trendActive !== null ? Number(trendActive.toFixed(1)) : undefined}
          trendLabel={trendLabel(activePrev || null, activeClients)}
          icon="Users"
          iconBg="bg-[rgba(209,252,0,0.12)] text-[var(--primary)]"
        />
        <KpiCard
          label="Sessions Completed"
          value={displaySessionsLabel}
          trend={undefined}
          trendLabel="This month"
          icon="CalendarCheck"
          iconBg="bg-[rgba(79,209,197,0.12)] text-[var(--accent-cyan)]"
        />
        <KpiCard
          label="Revenue"
          value={displayRevenue}
          trend={trendRevenue !== null ? Number(trendRevenue.toFixed(1)) : undefined}
          trendLabel={trendLabel(revenuePrevMonthCents || null, revenueThisMonthCents)}
          icon="DollarSign"
          iconBg="bg-[rgba(232,196,104,0.12)] text-[var(--accent-gold)]"
        />
        <KpiCard
          label="New Enrollments"
          value={displayEnroll}
          trend={trendEnroll !== null ? Number(trendEnroll.toFixed(1)) : undefined}
          trendLabel={trendLabel(newEnrollmentsPrev || null, newEnrollments)}
          icon="UserPlus"
        />
      </div>

      {/* Main two-column grid — left spans 2 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column (spans 2) */}
        <div className="space-y-4 lg:col-span-2">
          <TotalRevenueChart
            title="Total Revenue"
            value={displayRevenue}
            trend={trendRevenue}
            points={revenueChartPoints}
          />

          {splitItems ? (
            <CustomerSplitCard title="Client Breakdown" items={splitItems as never} />
          ) : (
            <CustomerSplitCard title="Client Breakdown" items={undefined} />
          )}

          <TopProgramsTable title="Top Programs" rows={topRows} />
        </div>

        {/* Right column — only real-data cards */}
        <div className="space-y-4">
          <WeeklyActivityChart title="Most Active Day" points={weeklyPoints} />
          <RetentionGaugeCard value={retention} total={retentionTotal} />
        </div>
      </div>
    </div>
  );
}
