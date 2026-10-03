import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getOverviewData, resolvePeriod, resolveRange, type RangeKey } from "@/lib/overview";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlobalLink } from "@/components/shared/link";
import { RangeSelector } from "@/components/dashboard/overview/RangeSelector";
// P-06: lazy recharts wrappers — same components, async chunk on the client.
import {
  RevenueGrowthChart,
  WeekdayBarChart,
  AdherenceGauge,
} from "@/components/dashboard/overview/OverviewChartsLazy";
import { TopClientsTable } from "@/components/dashboard/overview/TopClientsTable";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard, StatCardChip } from "@/components/core/StatCard";
import {
  ClipboardList,
  Dumbbell,
  MessageSquare,
  PlusCircle,
  Target,
  Users,
} from "lucide-react";

// Localized labels for the English strings that arrive from lib/overview.ts
// (trend copy, breakdown labels, statuses, range presets) — that module is
// data-only, so the translation mapping lives here next to the rendering.
const RANGE_LABELS: Record<RangeKey, TKey> = {
  "30d": "overview.range.30d",
  month: "overview.range.month",
  "90d": "overview.range.90d",
};

const BREAKDOWN_LABELS: Record<string, TKey> = {
  Active: "overview.status.active",
  Trial: "overview.status.trial",
  Cancelled: "overview.status.cancelled",
};

// Stitch roster-cohort dots: active = volt, trial = mint, cancelled = coral.
const BREAKDOWN_DOT: Record<string, string> = {
  Active: "bg-primary",
  Trial: "bg-[#68dfa6]",
  Cancelled: "bg-[#ea7a72]",
};

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const params = (await searchParams) ?? {};
  const range: RangeKey = resolveRange(params.range);
  const period = resolvePeriod(range);

  // Real data is keyed by coaches.id (the mobile app's coach identity)
  const coachId = await resolveCoachId(supabase, user.id);
  const data = await getOverviewData(supabase, user.id, coachId, period);

  const { t, fmt } = await getI18n();

  // "Aug 16 – Sep 15 · Last 30 days" — rebuilt here so the dates and the preset
  // label follow the active language (lib/overview formats it in English only).
  const dayOpts = { month: "short", day: "numeric" } as const;
  const rangeLabel = `${fmt.date(period.start, dayOpts)} – ${fmt.date(period.end, dayOpts)} · ${t(RANGE_LABELS[range])}`;

  // trend() in lib/overview returns "New" for a from-zero jump (translate it);
  // the other labels are signed percentages, which read the same in Arabic.
  const trLabel = (label: string) => (label === "New" ? t("overview.trend.new") : label);
  // vs copy is "vs. {n} last period" — pull the number out and re-render it
  // through the dictionary so the sentence is localized too.
  const trVs = (vs: string) => {
    const m = /^vs\. (\d+) last period$/.exec(vs);
    return m ? t("overview.trend.vs", { n: m[1] }) : vs;
  };

  const breakdownTotal = data.breakdown.reduce((acc, b) => acc + b.count, 0) || 1;

  // Localized dates for the clients table (server-formatted, client renders)
  const tableDates: Record<string, string> = {};
  for (const r of data.topSubscribers) {
    if (r.lastCheckIn) tableDates[r.lastCheckIn] = fmt.date(r.lastCheckIn);
  }

  // Stitch gauge status band (thresholds applied to real adherence data)
  const rate = data.adherence.rate;
  const band = rate == null ? null : rate > 85 ? "high" : rate >= 70 ? "moderate" : "low";

  return (
    <div className="flex flex-col gap-5">
      {/* Telemetry strip — Stitch's marquee with real counters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-label-sm uppercase tracking-wider">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-bold text-primary">{t("overview.kpi.realtime")}</span>
          </span>
          <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <Users className="size-4 text-primary" />
            <span>
              <strong className="font-label-lg text-foreground">{t("overview.today.checkInsValue", { n: fmt.num(data.today.checkIns) })}</strong>{" "}
              {t("overview.today.checkInsLabel")}
            </span>
          </span>
          <span className="hidden h-3 w-px bg-border sm:block" />
          <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <ClipboardList className="size-4 text-[#68dfa6]" />
            <span>
              <strong className="font-label-lg text-foreground">{t("overview.today.mealsValue", { n: fmt.num(data.today.meals) })}</strong>{" "}
              {t("overview.today.mealsLabel")}
            </span>
          </span>
          <span className="hidden h-3 w-px bg-border md:block" />
          <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <Dumbbell className="size-4 text-gold" />
            <span>
              <strong className="font-label-lg text-foreground">{t("overview.today.programsValue", { n: fmt.num(data.activePrograms) })}</strong>{" "}
              {t("overview.today.programsLabel")}
            </span>
          </span>
        </div>
      </div>

      <PageHeader
        title={t("overview.pageTitle")}
        chip="PRO"
        meta={
          <>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-label-md text-foreground">{rangeLabel}</span>
            <span className="text-faint">•</span>
            <span>{t("overview.chart.weekdaySubtitle")}</span>
          </>
        }
        actions={
          <>
            <RangeSelector current={range} rangeLabel={rangeLabel} />
            <Button render={<GlobalLink href="/dashboard/chat" />} variant="secondary" size="lg">
              <MessageSquare className="size-4 text-faint" />
              {t("overview.header.newMessage")}
            </Button>
            <Button render={<GlobalLink href="/dashboard/workouts" />} size="lg">
              <PlusCircle className="size-4" />
              {t("overview.header.createWorkout")}
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("overview.kpi.activeClients")}
          icon={Users}
          value={fmt.num(data.kpis.active.current)}
          trend={data.kpis.active.tr.dir}
          trendLabel={trLabel(data.kpis.active.tr.label)}
          footer={<span>{trVs(data.kpis.active.tr.vs)}</span>}
          progress={data.statusCounts.total > 0 ? Math.round((data.kpis.active.current / data.statusCounts.total) * 100) : undefined}
        />
        <StatCard
          label={t("overview.kpi.netRevenue")}
          icon={Dumbbell}
          value={fmt.money(data.kpis.netRevenue.cents)}
          trend={data.kpis.netRevenue.tr.dir}
          trendLabel={trLabel(data.kpis.netRevenue.tr.label)}
          footer={<span className="truncate">{t("overview.kpi.gross", { amount: fmt.money(data.kpis.netRevenue.grossCents) })}</span>}
          progress={data.kpis.netRevenue.grossCents > 0 ? Math.round((data.kpis.netRevenue.cents / (data.kpis.netRevenue.grossCents as number)) * 100) : undefined}
        />
        <StatCard
          label={t("overview.kpi.unread")}
          icon={MessageSquare}
          badge={<StatCardChip tone="mint">LIVE</StatCardChip>}
          value={fmt.num(data.kpis.unread.count)}
          trend={data.kpis.unread.tr.dir}
          trendLabel={trLabel(data.kpis.unread.tr.label)}
          footer={<span className="truncate">{t("overview.kpi.realtime")}</span>}
        />
        <StatCard
          label={t("overview.kpi.workouts", { range: rangeLabel })}
          icon={ClipboardList}
          value={fmt.num(data.kpis.workouts.current)}
          trend={data.kpis.workouts.tr.dir}
          trendLabel={trLabel(data.kpis.workouts.tr.label)}
          footer={<span>{trVs(data.kpis.workouts.tr.vs)}</span>}
        />
      </div>

      {/* Analytics row 1 — Revenue & Growth Velocity | Overall Client Adherence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-1">
            <RevenueGrowthChart
              revenue={data.chart.weekly.revenue}
              subscribers={data.chart.weekly.subscribers}
              defaultMode={data.chart.mode}
              totalCents={data.chart.total}
              peakWeeklyNetCents={data.chart.peakWeeklyNetCents}
              projectedMrrCents={data.chart.projectedMrrCents}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <div className="space-y-0.5">
              <p className="text-label-sm uppercase tracking-wider text-faint">
                {t("overview.chart.adherencePercent", { p: fmt.num(data.adherence.rate ?? 0) })}
              </p>
              <CardTitle className="font-display text-headline-md">{t("overview.chart.adherenceTitle")}</CardTitle>
            </div>
            <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-label-sm font-semibold text-primary">
              <Target className="size-3" />
              {t("overview.chart.target", { p: 85 })}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <AdherenceGauge rate={data.adherence.rate} />
            {band ? (
              <span className="text-label-sm font-bold uppercase tracking-widest text-primary">
                {band === "high" ? t("overview.adherence.high") : band === "moderate" ? t("overview.adherence.moderate") : t("overview.adherence.low")}
              </span>
            ) : (
              <span className="text-center text-body-sm text-faint">{t("overview.adherence.noData")}</span>
            )}
            <div className="grid w-full grid-cols-3 gap-2">
              {[
                { label: t("overview.adherence.onTrack"), th: t("overview.adherence.onTrackTh"), count: data.adherence.onTrack, cls: "text-primary" },
                { label: t("overview.adherence.atRisk"), th: t("overview.adherence.atRiskTh"), count: data.adherence.atRisk, cls: "text-[#f5a623]" },
                { label: t("overview.adherence.critical"), th: t("overview.adherence.criticalTh"), count: data.adherence.critical, cls: "text-[#ea7a72]" },
              ].map((b) => (
                <div key={b.label} className="rounded-lg bg-secondary/60 p-2.5 text-center">
                  <p className="text-label-sm uppercase tracking-wide text-faint">{b.label}</p>
                  <p className={`font-display text-headline-md font-bold tabular-nums ${b.cls}`}>{fmt.num(b.count)}</p>
                  <p className="text-[11px] tabular-nums text-faint">{b.th}</p>
                </div>
              ))}
            </div>
            <Button render={<GlobalLink href="/dashboard/subscribers" />} variant="secondary" className="w-full">
              {t("overview.adherence.viewNonCompliant")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Analytics row 2 — Workout Activity by Day | Subscriber Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1">
            <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.activity.title")}</p>
            <CardTitle className="font-display text-headline-md">{t("overview.chart.weekdayTitle")}</CardTitle>
            <CardDescription>{t("overview.chart.weekdaySubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeekdayBarChart data={data.weekday} peakIndex={data.peakDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-label-sm uppercase tracking-wider text-faint">{t("common.nav.subscribers")}</p>
                <CardTitle className="font-display text-headline-md">{t("overview.status.title")}</CardTitle>
              </div>
              <span className="text-body-sm text-faint">
                {fmt.num(data.statusCounts.total)} {t("overview.status.totalSuffix")}
              </span>
            </div>
            <div className="mt-2 flex h-2 w-full gap-px overflow-hidden rounded-full">
              {data.breakdown.map((b) => (
                <div
                  key={b.label}
                  className={BREAKDOWN_DOT[b.label] ?? "bg-muted-foreground"}
                  style={{ width: `${(b.count / breakdownTotal) * 100}%` }}
                />
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-body-md text-muted-foreground">
                  <span className={`size-2 rounded-full ${BREAKDOWN_DOT[b.label] ?? "bg-muted-foreground"}`} />
                  {BREAKDOWN_LABELS[b.label] ? t(BREAKDOWN_LABELS[b.label]) : b.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-body-sm tabular-nums text-faint">
                    {Math.round((b.count / breakdownTotal) * 100)}%
                  </span>
                  <span className="font-label-lg tabular-nums text-foreground">{fmt.num(b.count)}</span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-body-md">
              <span className="font-medium">{t("common.table.total")}</span>
              <span className="font-display font-bold tabular-nums">{fmt.num(data.statusCounts.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Active Clients */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="font-display text-headline-md">{t("overview.table.title")}</CardTitle>
            <span className="rounded bg-[#68dfa6]/15 px-1.5 py-0.5 text-label-sm font-semibold uppercase tracking-wider text-[#68dfa6]">
              {t("overview.table.highEngagement")}
            </span>
          </div>
          <CardDescription>{t("overview.table.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TopClientsTable rows={data.topSubscribers} totalActive={data.kpis.active.current} fmtDate={tableDates} />
        </CardContent>
      </Card>
    </div>
  );
}
