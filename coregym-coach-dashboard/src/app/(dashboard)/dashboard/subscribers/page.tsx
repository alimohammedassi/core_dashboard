import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { daysAgoISO } from "@/lib/workouts";
import { enrollmentWeekOf } from "@/lib/program-dates";
import { buildSubscribersHref, sanitizeSearchTerm } from "@/lib/pagination";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Users } from "lucide-react";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard, StatCardChip } from "@/components/core/StatCard";
import { EmptyState } from "@/components/core/EmptyState";
import { GlobalLink } from "@/components/shared/link";
import {
  SubscribersToolbar,
  type SubscriberRow,
} from "@/components/subscribers/SubscribersToolbar";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, TKey> = {
  active: "subscribers.status.active",
  paused: "subscribers.status.paused",
  cancelled: "subscribers.status.cancelled",
  canceled: "subscribers.status.canceled",
  past_due: "subscribers.status.pastDue",
  trialing: "subscribers.status.trialing",
  expired: "subscribers.status.expired",
  completed: "subscribers.status.completed",
};

// joined relation (subscription_plans / coach_programs) can land as object or
// single-element array
function joinOne(p: unknown): { name?: string; price_usd?: number } | null {
  const row = Array.isArray(p) ? p[0] : p;
  return (row as { name?: string; price_usd?: number } | null) ?? null;
}

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const { t, fmt } = await getI18n();
  const statusLabel = (status: string) => (STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status);
  const params = await searchParams;
  const filter = params.status?.trim() || null;
  // F-13: the search box is now a server-side query param. The old client-side
  // input only filtered the 25 rows on the current page, so a client on page 3
  // was unfindable. Sanitize before it touches any PostgREST filter.
  const q = sanitizeSearchTerm(params.q);
  // 1-based page; the pager clamps out-of-range values below
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const user = await getCurrentUser();

  type Row = {
    id: string;
    status: string;
    start_date: string;
    client_id: string;
    plan?: { name: string } | null;
    client?: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  };
  let rows: Row[] = [];
  let total: number | null = null;
  let error: string | null = null;
  let coachId: string | null = null;
  let kpis: { active: number; trialing: number; pastDue: number } | null = null;
  // Real roster totals for chips/card footers — independent of ?status= filter.
  let counts: Record<string, number> = {};
  let allTotal = 0;
  let mrrCents = 0;

  if (user) {
    // subscriptions.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);

    // F-13: resolve the search term to coach-scoped ids BEFORE the page query.
    // Embedded-column or() filters don't parse on the live PostgREST (verified
    // in a prior session — see /api/coach/clients/search), so the two-step
    // resolution is the established idiom: match profiles by name/email and
    // the coach's own plans by name, then filter subscriptions with a plain
    // or() over the FK columns. The coach_id filter on the main query drops
    // any foreign profile that matched step 1, so the result stays tenant-safe.
    let searchFilter: string | null = null;
    let searchMiss = false;
    if (q) {
      const [profRes, planRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id")
          .or(`full_name.ilike.%${q}%,name.ilike.%${q}%,email.ilike.%${q}%`)
          // Bounded like every roster search in the app; rosters this table
          // serves are far below the cap (page-1 KPI counts).
          .limit(500),
        supabase
          .from("subscription_plans")
          .select("id")
          .eq("coach_id", coachId)
          .ilike("name", `%${q}%`)
          .limit(100),
      ]);
      const matchedClientIds = ((profRes.data ?? []) as { id: string }[]).map((r) => r.id);
      const matchedPlanIds = ((planRes.data ?? []) as { id: string }[]).map((r) => r.id);
      const parts: string[] = [];
      if (matchedClientIds.length > 0) parts.push(`client_id.in.(${matchedClientIds.join(",")})`);
      if (matchedPlanIds.length > 0) parts.push(`plan_id.in.(${matchedPlanIds.join(",")})`);
      if (parts.length > 0) searchFilter = parts.join(",");
      else searchMiss = true; // nothing matches → empty page, correct "no results" UI
    }

    const query = supabase
      .from("subscriptions")
      .select(
        `
        id, status, start_date, client_id,
        plan:subscription_plans(name),
        client:profiles(full_name, email, avatar_url)
        `,
        { count: "exact" }
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false })
      .range(from, to);

    if (filter) query.eq("status", filter);
    if (searchFilter) query.or(searchFilter);

    const head = (status?: string) => {
      const q2 = supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId);
      return status ? q2.eq("status", status) : q2;
    };

    // Roster KPIs + chip counts + MRR aggregate — head-counts and prices only,
    // no rows shipped beyond the visible page. Independent of ?q=/?status=.
    const [res, allC, activeC, trialC, dueC, cancelledC, expiredC, pausedC, mrrRes] = await Promise.all([
      searchMiss ? Promise.resolve(null) : query,
      head(),
      head("active"),
      head("trialing"),
      head("past_due"),
      head("cancelled"),
      head("expired"),
      head("paused"),
      supabase
        .from("subscriptions")
        .select("plan:subscription_plans(price_usd)")
        .eq("coach_id", coachId)
        .eq("status", "active"),
    ]);

    if (searchMiss) {
      rows = [];
      total = 0;
    } else if (res) {
      if (res.error) {
        // S-mask: never surface DB internals to the coach (remediation-log rule).
        error = "load-failed";
      } else {
        rows = (res.data ?? []) as unknown as Row[];
        total = res.count;
      }
    }
    kpis = { active: activeC.count ?? 0, trialing: trialC.count ?? 0, pastDue: dueC.count ?? 0 };
    counts = {
      active: activeC.count ?? 0,
      cancelled: cancelledC.count ?? 0,
      past_due: dueC.count ?? 0,
      trialing: trialC.count ?? 0,
      expired: expiredC.count ?? 0,
      paused: pausedC.count ?? 0,
    };
    allTotal = allC.count ?? 0;
    mrrCents = ((mrrRes.data ?? []) as unknown as { plan: unknown }[]).reduce(
      (sum, r) => sum + (joinOne(r.plan)?.price_usd ?? 0) * 100,
      0
    );
  }

  // ── Per-row telemetry for the 25 visible clients (grouped reads, in-memory maps)
  const todayISO = new Date().toISOString().slice(0, 10);
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean)));
  const programByClient = new Map<string, { name: string; start_date: string; duration_weeks: number }>();
  const adherenceByClient = new Map<string, number | null>();
  const checkInByClient = new Map<string, string>();

  if (clientIds.length > 0 && coachId) {
    const since30 = daysAgoISO(30);
    // P-05: the daily-summary read is bounded to a 180-day window (previously
    // unbounded window at limit 10000). Prescribed dates never precede since30,
    // so the adherence pairing only needs recent rows; 25 visible clients ×
    // 180 days = 4500 rows max, so the 5000 cap can never truncate. The only
    // display edge: a client whose LAST-EVER check-in is older than 180 days
    // now shows "no check-in" instead of a stale date.
    const since180 = daysAgoISO(180);
    const [progRes, assignRes, summaryRes] = await Promise.all([
      // Active program enrollment per client (latest first — first row wins)
      supabase
        .from("client_program_enrollments")
        .select("client_id, start_date, duration_weeks, program:coach_programs(name)")
        .in("client_id", clientIds)
        .eq("coach_id", coachId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(250),
      // Prescribed calories per client/day (30-day window) — overview idiom
      supabase
        .from("nutrition_assignments")
        .select("id, client_id, scheduled_date")
        .in("client_id", clientIds)
        .eq("coach_id", coachId)
        .gte("scheduled_date", since30)
        .order("scheduled_date", { ascending: false })
        .limit(2000),
      // Latest check-in date + logged calories per client/day
      supabase
        .from("daily_summary")
        .select("user_id, summary_date, calories_consumed")
        .in("user_id", clientIds)
        .gte("summary_date", since180)
        .order("summary_date", { ascending: false })
        .limit(5000),
    ]);

    for (const raw of (progRes.data ?? []) as unknown as Record<string, unknown>[]) {
      const cid = raw.client_id as string;
      if (programByClient.has(cid)) continue;
      const p = joinOne(raw.program);
      programByClient.set(cid, {
        name: p?.name ?? "Program",
        start_date: raw.start_date as string,
        duration_weeks: (raw.duration_weeks as number) ?? 1,
      });
    }

    // Prescribed kcal per client/date (foods joined on the assignments above)
    const assignRows = (assignRes.data ?? []) as unknown as { id: string; client_id: string; scheduled_date: string }[];
    const assignIds = assignRows.map((a) => a.id);
    const foodsRes = assignIds.length
      ? await supabase
          .from("nutrition_assignment_foods")
          .select("assignment_id, original_calories")
          .in("assignment_id", assignIds)
          .limit(8000)
      : { data: [] as unknown[] };
    const kcalByAssignment = new Map<string, number>();
    for (const f of (foodsRes.data ?? []) as unknown as { assignment_id: string; original_calories: number | null }[]) {
      kcalByAssignment.set(f.assignment_id, (kcalByAssignment.get(f.assignment_id) ?? 0) + (f.original_calories ?? 0));
    }
    const prescribedByClientDate = new Map<string, Map<string, number>>();
    for (const a of assignRows) {
      const kcal = kcalByAssignment.get(a.id) ?? 0;
      if (kcal <= 0) continue;
      let perDate = prescribedByClientDate.get(a.client_id);
      if (!perDate) {
        perDate = new Map<string, number>();
        prescribedByClientDate.set(a.client_id, perDate);
      }
      perDate.set(a.scheduled_date, (perDate.get(a.scheduled_date) ?? 0) + kcal);
    }

    const consumedByClientDate = new Map<string, Map<string, number>>();
    for (const s of (summaryRes.data ?? []) as unknown as {
      user_id: string;
      summary_date: string;
      calories_consumed: number | null;
    }[]) {
      if (!checkInByClient.has(s.user_id)) checkInByClient.set(s.user_id, s.summary_date);
      let perDate = consumedByClientDate.get(s.user_id);
      if (!perDate) {
        perDate = new Map<string, number>();
        consumedByClientDate.set(s.user_id, perDate);
      }
      perDate.set(s.summary_date, s.calories_consumed ?? 0);
    }

    // Adherence — latest day with both a prescription and a log (lib/overview math)
    for (const cid of clientIds) {
      const prescribed = prescribedByClientDate.get(cid);
      const consumed = consumedByClientDate.get(cid);
      let latest: string | null = null;
      if (prescribed && consumed) {
        for (const d of prescribed.keys()) {
          if (consumed.has(d) && (latest === null || d > latest)) latest = d;
        }
      }
      const target = latest !== null ? (prescribed?.get(latest) ?? 0) : 0;
      const actual = latest !== null ? (consumed?.get(latest) ?? 0) : 0;
      if (target <= 0 || actual <= 0) {
        adherenceByClient.set(cid, null);
        continue;
      }
      adherenceByClient.set(cid, Math.max(0, Math.round((1 - Math.abs(actual - target) / target) * 100)));
    }
  }

  const toolbarRows: SubscriberRow[] = rows.map((r) => {
    const name = r.client?.full_name ?? r.client?.email ?? t("common.state.unknown");
    const prog = programByClient.get(r.client_id) ?? null;
    let weekLabel: string | null = null;
    if (prog) {
      // F-14: SQL week convention (enrollmentWeekOf) — matches the
      // week_number the enrollment RPCs stamp on every generated row.
      const week = enrollmentWeekOf(prog.start_date, todayISO, prog.duration_weeks);
      weekLabel = t("subscribers.enrollmentPage.weekShort", { n: week });
    }
    const checkIn = checkInByClient.get(r.client_id) ?? null;
    return {
      id: r.id,
      name,
      email: r.client?.email ?? "",
      plan: r.plan?.name ?? "",
      status: r.status,
      statusLabel: statusLabel(r.status),
      avatarUrl: r.client?.avatar_url ?? null,
      pastDue: r.status === "past_due",
      programName: prog?.name ?? null,
      weekLabel,
      startLabel: prog ? fmt.date(prog.start_date) : "",
      adherence: adherenceByClient.get(r.client_id) ?? null,
      checkInLabel: checkIn
        ? t("subscribers.list.checkedIn", { date: fmt.date(checkIn) })
        : t("subscribers.list.noCheckIn"),
      hasCheckIn: checkIn != null,
    };
  });

  const statuses = ["active", "cancelled", "past_due", "trialing", "expired", "paused"] as const;
  const totalPages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  // F-13: the pager must preserve the active search + status filter; only the
  // page number moves. Serializer is pure + unit-tested (lib/pagination).
  const pageHref = (p: number) => buildSubscribersHref({ status: filter, q, page: p });
  const shownFrom = total === 0 ? 0 : from + 1;
  const shownTo = Math.min(from + rows.length, total ?? from + rows.length);

  const chipClass = (isActive: boolean) =>
    `inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-label-md transition-colors ${
      isActive
        ? "bg-primary font-bold text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  // Stitch chip counts: the solid volt chip shows its count muted/regular,
  // inactive chips carry a semibold count tinted by the status color.
  const countTone: Record<string, string> = {
    active: "text-primary font-semibold",
    trialing: "text-mint font-semibold",
    past_due: "text-destructive font-semibold",
  };
  const chipCountClass = (status: string | null, isActive: boolean) =>
    isActive ? "tabular-nums font-normal opacity-80" : `tabular-nums ${status ? (countTone[status] ?? "text-faint") : "text-faint"}`;

  const labels = {
    searchPlaceholder: t("subscribers.list.searchPlaceholder"),
    colClient: t("subscribers.list.client"),
    colProgram: t("subscribers.list.programCol"),
    colAdherence: t("subscribers.adherence.label"),
    colCheckIn: t("subscribers.list.checkIn"),
    viewProfile: t("common.actions.view"),
    noProgram: t("subscribers.list.noProgram"),
    filterEmpty: t("subscribers.list.filterEmpty"),
    clearFilter: t("subscribers.list.clearFilter"),
    clearHref: "/dashboard/subscribers",
  };

  // F-13: filter chips compose with the search term (no page → resets to 1);
  // the "All" chip clears the status but keeps the search.
  const chipHref = (status: string | null) => buildSubscribersHref({ status, q });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("subscribers.list.pageTitle")}
        description={t("subscribers.list.pageDesc")}
        chip={t("subscribers.list.kicker")}
        actions={
          <Button variant="secondary" size="lg" render={<a href="/api/export/subscribers" download />}>
            <Download className="size-4 text-faint" />
            {t("subscribers.list.exportCsv")}
          </Button>
        }
      />

      {error && (
        <Badge variant="destructive" className="w-fit">
          {t("subscribers.list.loadError")}
        </Badge>
      )}

      {kpis && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("subscribers.kpi.active")}
            badge={<StatCardChip>{t("subscribers.kpi.liveChip")}</StatCardChip>}
            value={fmt.num(kpis.active)}
            suffix={
              <span className="text-body-sm text-muted-foreground">
                {t("subscribers.kpi.totalCount", { n: fmt.num(allTotal) })}
              </span>
            }
            progress={allTotal > 0 ? Math.round((kpis.active / allTotal) * 100) : 0}
          />
          <StatCard
            label={t("subscribers.kpi.trialing")}
            badge={<StatCardChip tone="mint">{t("subscribers.status.trialing")}</StatCardChip>}
            value={fmt.num(kpis.trialing)}
            suffix={
              <span className="text-body-sm text-muted-foreground">
                {t("subscribers.kpi.totalCount", { n: fmt.num(allTotal) })}
              </span>
            }
            progress={allTotal > 0 ? Math.round((kpis.trialing / allTotal) * 100) : 0}
            progressClassName="bg-mint"
          />
          <StatCard
            label={t("subscribers.kpi.pastDue")}
            badge={
              <span className="rounded px-1.5 py-0.5 text-label-sm uppercase tracking-wider bg-destructive/10 text-destructive">
                {t("subscribers.status.pastDue")}
              </span>
            }
            value={fmt.num(kpis.pastDue)}
            suffix={
              <span className="text-body-sm text-muted-foreground">
                {t("subscribers.kpi.totalCount", { n: fmt.num(allTotal) })}
              </span>
            }
            progress={allTotal > 0 ? Math.round((kpis.pastDue / allTotal) * 100) : 0}
            progressClassName="bg-destructive"
          />
          <StatCard
            label={t("subscribers.kpi.mrr")}
            value={fmt.money(mrrCents)}
            footer={t("subscribers.kpi.avgYield", {
              money: fmt.money(kpis.active > 0 ? Math.round(mrrCents / kpis.active) : 0),
            })}
          />
        </div>
      )}

      <SubscribersToolbar
        rows={toolbarRows}
        labels={labels}
        query={q}
        statusFilter={filter}
        clearSearchHref={buildSubscribersHref({ status: filter })}
        chips={
          <>
            <GlobalLink href={chipHref(null)} className={chipClass(!filter)}>
              {t("common.state.all")}
              <span className={chipCountClass(null, !filter)}>{fmt.num(allTotal)}</span>
            </GlobalLink>
            {statuses.map((s) => (
              <GlobalLink key={s} href={chipHref(s)} className={chipClass(filter === s)}>
                {statusLabel(s)}
                <span className={chipCountClass(s, filter === s)}>{fmt.num(counts[s] ?? 0)}</span>
              </GlobalLink>
            ))}
          </>
        }
        emptyAll={
          <EmptyState
            icon={Users}
            title={t("subscribers.list.empty")}
            action={
              <GlobalLink
                href="/dashboard/plans"
                className="text-body-sm text-primary underline-offset-4 hover:underline"
              >
                {t("common.nav.plans")}
              </GlobalLink>
            }
          />
        }
        pager={
          total != null && total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <p className="text-body-sm text-muted-foreground">
                {t("subscribers.list.showing", { from: shownFrom, to: shownTo, total: fmt.num(total) })}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <GlobalLink href={pageHref(page - 1)}>
                    <Button variant="secondary" size="sm">
                      <ChevronLeft className="size-3.5 rtl:rotate-180" /> {t("common.actions.previous")}
                    </Button>
                  </GlobalLink>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    <ChevronLeft className="size-3.5 rtl:rotate-180" /> {t("common.actions.previous")}
                  </Button>
                )}
                <span className="text-body-sm tabular-nums text-faint">
                  {t("subscribers.list.pageOf", { page: Math.min(page, totalPages), total: totalPages })}
                </span>
                {page < totalPages ? (
                  <GlobalLink href={pageHref(page + 1)}>
                    <Button variant="secondary" size="sm">
                      {t("common.actions.next")} <ChevronRight className="size-3.5 rtl:rotate-180" />
                    </Button>
                  </GlobalLink>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    {t("common.actions.next")} <ChevronRight className="size-3.5 rtl:rotate-180" />
                  </Button>
                )}
              </div>
            </div>
          ) : null
        }
      />
    </div>
  );
}
