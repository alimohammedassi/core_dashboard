import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getOverviewData, resolvePeriod, resolveRange, type RangeKey } from "@/lib/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangeSelector } from "@/components/dashboard/overview/RangeSelector";
import { OverviewAreaChart, WeekdayBarChart, AdherenceGauge } from "@/components/dashboard/overview/OverviewCharts";
import { Users, DollarSign, MessageSquare, Dumbbell, Download, TrendingUp, TrendingDown, Minus, ClipboardList } from "lucide-react";

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

  const rangeLabel = `${period.rangeLabel}`;
  const currency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const trendIcon = (dir: "up" | "down" | "flat") =>
    dir === "up" ? <TrendingUp className="size-3.5" /> : dir === "down" ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <RangeSelector current={range} rangeLabel={rangeLabel} />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active subscribers</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{data.kpis.active.current}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.active.tr.dir)} {data.kpis.active.tr.label} · {data.kpis.active.tr.vs}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net revenue</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{currency(data.kpis.netRevenue.cents)}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.netRevenue.tr.dir)} {data.kpis.netRevenue.tr.label} · gross {currency(data.kpis.netRevenue.grossCents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unread messages</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{data.kpis.unread.count}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.unread.tr.dir)} {data.kpis.unread.tr.label} · Realtime via Supabase
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Workouts ({rangeLabel})</CardTitle>
            <Dumbbell className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{data.kpis.workouts.current}</div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendIcon(data.kpis.workouts.tr.dir)} {data.kpis.workouts.tr.label} · {data.kpis.workouts.tr.vs}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today engagement + active programs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="size-4" /></span>
            <div><p className="text-sm font-semibold">{data.today.checkIns} today</p><p className="text-xs text-muted-foreground">Client check-ins</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="size-4" /></span>
            <div><p className="text-sm font-semibold">{data.today.meals} logged</p><p className="text-xs text-muted-foreground">Meals today</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><TrendingUp className="size-4" /></span>
            <div><p className="text-sm font-semibold">{data.activePrograms} active</p><p className="text-xs text-muted-foreground">Programs in progress</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row: trend + adherence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {data.chart.mode === "revenue" ? "Net revenue trend" : "New subscribers"}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {data.chart.mode === "revenue" ? `${currency(data.chart.total)} in window` : `${data.chart.total} in window`}
            </span>
          </CardHeader>
          <CardContent>
            {data.chart.points.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No data in this window yet.</p>
            ) : (
              <OverviewAreaChart points={data.chart.points} mode={data.chart.mode} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nutrition adherence</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AdherenceGauge rate={data.adherence.rate} />
            <p className="text-xs text-muted-foreground mt-1">
              {data.adherence.onTrack} / {data.adherence.tracked} clients on track
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekday workouts + status breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Workouts by weekday</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekdayBarChart data={data.weekday} peakIndex={data.peakDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Subscribers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-semibold">{b.count}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span className="font-medium">Total</span>
              <span className="font-bold">{data.statusCounts.total}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Top clients</CardTitle>
          <Button render={<a href="/api/export/subscribers" download />} variant="outline" size="sm">
            <Download className="mr-1 size-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Paid to date</TableHead>
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
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{s.startDate ? new Date(s.startDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{currency(s.revenueCents)}</TableCell>
                </TableRow>
              ))}
              {data.topSubscribers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No subscribers yet — they appear here as clients subscribe.
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
