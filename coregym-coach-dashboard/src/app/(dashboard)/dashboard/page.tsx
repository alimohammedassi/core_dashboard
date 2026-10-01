import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getOverviewData, resolvePeriod, resolveRange, type RangeKey } from "@/lib/overview";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangeSelector } from "@/components/dashboard/overview/RangeSelector";
import { OverviewAreaChart, WeekdayBarChart, AdherenceGauge } from "@/components/dashboard/overview/OverviewCharts";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard, StatCardChip } from "@/components/core/StatCard";
import { ClipboardList, Dumbbell, Download, MessageSquare, PlusCircle, Users } from "lucide-react";
import { GlobalLink } from "@/components/shared/link";

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

const STATUS_LABELS: Record<string, TKey> = {
  active: "overview.status.active",
  trialing: "overview.status.trial",
  trial: "overview.status.trial",
  cancelled: "overview.status.cancelled",
  canceled: "overview.status.cancelled",
  past_due: "overview.status.pastDue",
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
  const statusLabel = (status: string) => (STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status);

  const breakdownTotal = data.breakdown.reduce((acc, b) => acc + b.count, 0) || 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Realtime activity strip — Stitch's telemetry marquee, fed with the
          real counters (today's check-ins, meals, active programs, unread). */}
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
          </>
        }
        actions={
          <>
            <RangeSelector current={range} rangeLabel={rangeLabel} />
            <Button render={<GlobalLink href="/dashboard/chat" />} variant="secondary" size="lg">
              <MessageSquare className="size-4 text-faint" />
              {t("common.nav.chat")}
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
        />
        <StatCard
          label={t("overview.kpi.netRevenue")}
          icon={Dumbbell}
          value={fmt.money(data.kpis.netRevenue.cents)}
          trend={data.kpis.netRevenue.tr.dir}
          trendLabel={trLabel(data.kpis.netRevenue.tr.label)}
          footer={
            <>
              <span className="truncate">{t("overview.kpi.gross", { amount: fmt.money(data.kpis.netRevenue.grossCents) })}</span>
            </>
          }
          progress={data.kpis.netRevenue.grossCents > 0 ? Math.round((data.kpis.netRevenue.cents / (data.kpis.netRevenue.grossCents as number)) * 100) : undefined}
        />
        <StatCard
          label={t("overview.kpi.unread")}
          icon={MessageSquare}
          badge={<StatCardChip tone="mint">RT</StatCardChip>}
          value={fmt.num(data.kpis.unread.count)}
          trend={data.kpis.unread.tr.dir}
          trendLabel={trLabel(data.kpis.unread.tr.label)}
          footer={<span className="truncate text-body-sm text-muted-foreground">{t("overview.kpi.realtime")}</span>}
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

      {/* Charts row: trend + adherence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="space-y-0.5">
              <p className="text-label-sm uppercase tracking-wider text-faint">
                {data.chart.mode === "revenue" ? t("overview.kpi.netRevenue") : t("common.nav.subscribers")}
              </p>
              <CardTitle className="font-display text-headline-md">
                {data.chart.mode === "revenue" ? t("overview.chart.revenueTitle") : t("overview.chart.subscribersTitle")}
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              {data.chart.mode === "revenue"
                ? t("overview.chart.totalMoney", { amount: fmt.money(data.chart.total) })
                : t("overview.chart.totalCount", { n: fmt.num(data.chart.total) })}
            </span>
          </CardHeader>
          <CardContent>
            {data.chart.points.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">{t("overview.chart.empty")}</p>
            ) : (
              <OverviewAreaChart points={data.chart.points} mode={data.chart.mode} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-0.5">
              <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.chart.adherenceTitle")}</p>
              <CardTitle className="font-display text-headline-md">{t("overview.chart.adherencePercent", { p: fmt.num(data.adherence.rate ?? 0) })}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AdherenceGauge rate={data.adherence.rate} />
            <p className="mt-1 text-center text-body-sm text-muted-foreground">
              {t("overview.chart.adherenceOnTrack", {
                on: fmt.num(data.adherence.onTrack),
                total: fmt.num(data.adherence.tracked),
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekday workouts + subscriber status cohort */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="space-y-0.5">
              <p className="text-label-sm uppercase tracking-wider text-faint">{t("overview.activity.title")}</p>
              <CardTitle className="font-display text-headline-md">{t("overview.chart.weekdayTitle")}</CardTitle>
            </div>
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
            {/* Real proportions of each status in one hairline segmented bar */}
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
          <CardContent className="space-y-2.5">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between text-body-md">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={`size-2 rounded-full ${BREAKDOWN_DOT[b.label] ?? "bg-muted-foreground"}`} />
                  {BREAKDOWN_LABELS[b.label] ? t(BREAKDOWN_LABELS[b.label]) : b.label}
                </span>
                <span className="font-label-lg tabular-nums text-foreground">{fmt.num(b.count)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-body-md">
              <span className="font-medium">{t("common.table.total")}</span>
              <span className="font-display font-bold tabular-nums">{fmt.num(data.statusCounts.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top clients */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CardTitle className="font-display text-headline-md">{t("overview.table.title")}</CardTitle>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-label-sm uppercase tracking-wider text-primary">
                {t("overview.realDataOnly")}
              </span>
            </div>
            <CardDescription>{t("overview.table.subtitle")}</CardDescription>
          </div>
          <Button render={<a href="/api/export/subscribers" download />} variant="secondary" size="sm">
            <Download className="me-1 size-3.5" /> {t("overview.table.exportCsv")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("overview.table.client")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("overview.table.plan")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.status")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("overview.table.started")}</TableHead>
                <TableHead className="text-end text-label-sm uppercase tracking-wider text-faint">{t("overview.table.paid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topSubscribers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="text-body-md font-medium">{s.name}</p>
                    {s.email && <p className="text-body-sm text-faint">{s.email}</p>}
                  </TableCell>
                  <TableCell className="text-body-md">{s.plan ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{statusLabel(s.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-body-sm tabular-nums text-muted-foreground">{s.startDate ? fmt.date(s.startDate) : "—"}</TableCell>
                  <TableCell className="text-end text-body-md font-medium tabular-nums">{fmt.money(s.revenueCents)}</TableCell>
                </TableRow>
              ))}
              {data.topSubscribers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-body-md text-muted-foreground">
                    {t("overview.table.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
