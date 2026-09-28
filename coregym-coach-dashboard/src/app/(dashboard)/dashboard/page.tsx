import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getOverviewData, resolvePeriod, resolveRange, type RangeKey } from "@/lib/overview";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangeSelector } from "@/components/dashboard/overview/RangeSelector";
import { OverviewAreaChart, WeekdayBarChart, AdherenceGauge } from "@/components/dashboard/overview/OverviewCharts";
import { Users, DollarSign, MessageSquare, Dumbbell, Download, TrendingUp, TrendingDown, Minus, ClipboardList } from "lucide-react";

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

  const trendIcon = (dir: "up" | "down" | "flat") =>
    dir === "up" ? <TrendingUp className="size-3.5" /> : dir === "down" ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("common.nav.overview")}</h1>
        <RangeSelector current={range} rangeLabel={rangeLabel} />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("overview.kpi.activeClients")}</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{fmt.num(data.kpis.active.current)}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.active.tr.dir)} {trLabel(data.kpis.active.tr.label)} · {trVs(data.kpis.active.tr.vs)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("overview.kpi.netRevenue")}</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{fmt.money(data.kpis.netRevenue.cents)}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.netRevenue.tr.dir)} {trLabel(data.kpis.netRevenue.tr.label)} ·{" "}
              {t("overview.kpi.gross", { amount: fmt.money(data.kpis.netRevenue.grossCents) })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("overview.kpi.unread")}</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{fmt.num(data.kpis.unread.count)}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.unread.tr.dir)} {trLabel(data.kpis.unread.tr.label)} · {t("overview.kpi.realtime")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("overview.kpi.workouts", { range: rangeLabel })}</CardTitle>
            <Dumbbell className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{fmt.num(data.kpis.workouts.current)}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.workouts.tr.dir)} {trLabel(data.kpis.workouts.tr.label)} · {trVs(data.kpis.workouts.tr.vs)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today engagement + active programs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="size-4" /></span>
            <div><p className="text-sm font-semibold">{t("overview.today.checkInsValue", { n: fmt.num(data.today.checkIns) })}</p><p className="text-xs text-muted-foreground">{t("overview.today.checkInsLabel")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="size-4" /></span>
            <div><p className="text-sm font-semibold">{t("overview.today.mealsValue", { n: fmt.num(data.today.meals) })}</p><p className="text-xs text-muted-foreground">{t("overview.today.mealsLabel")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><TrendingUp className="size-4" /></span>
            <div><p className="text-sm font-semibold">{t("overview.today.programsValue", { n: fmt.num(data.activePrograms) })}</p><p className="text-xs text-muted-foreground">{t("overview.today.programsLabel")}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row: trend + adherence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {data.chart.mode === "revenue" ? t("overview.chart.revenueTitle") : t("overview.chart.subscribersTitle")}
            </CardTitle>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("overview.chart.adherenceTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AdherenceGauge rate={data.adherence.rate} />
            <p className="text-xs text-muted-foreground mt-1">
              {t("overview.chart.adherenceOnTrack", {
                on: fmt.num(data.adherence.onTrack),
                total: fmt.num(data.adherence.tracked),
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekday workouts + status breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("overview.chart.weekdayTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekdayBarChart data={data.weekday} peakIndex={data.peakDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("common.nav.subscribers")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {BREAKDOWN_LABELS[b.label] ? t(BREAKDOWN_LABELS[b.label]) : b.label}
                </span>
                <span className="font-semibold">{fmt.num(b.count)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span className="font-medium">{t("common.table.total")}</span>
              <span className="font-bold">{fmt.num(data.statusCounts.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t("overview.table.title")}</CardTitle>
          <Button render={<a href="/api/export/subscribers" download />} variant="outline" size="sm">
            <Download className="me-1 size-3.5" /> {t("overview.table.exportCsv")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.table.client")}</TableHead>
                <TableHead>{t("overview.table.plan")}</TableHead>
                <TableHead>{t("common.table.status")}</TableHead>
                <TableHead>{t("overview.table.started")}</TableHead>
                <TableHead className="text-right">{t("overview.table.paid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topSubscribers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.email && <p className="text-xs text-muted-foreground">{s.email}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{s.plan ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{statusLabel(s.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{s.startDate ? fmt.date(s.startDate) : "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt.money(s.revenueCents)}</TableCell>
                </TableRow>
              ))}
              {data.topSubscribers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
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
