import { GlobalLink } from "@/components/shared/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard } from "@/components/core/StatCard";
import { EmptyState } from "@/components/core/EmptyState";
import { StatusBadge, statusTone } from "@/components/core/StatusBadge";

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

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { t, fmt } = await getI18n();
  const statusLabel = (status: string) => (STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status);
  const params = await searchParams;
  const filter = params.status;
  // 1-based page; the pager clamps out-of-range values below
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const user = await getCurrentUser();

  let rows: Array<{
    id: string;
    status: string;
    start_date: string;
    plan?: { name: string } | null;
    client?: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  }> = [];
  let total: number | null = null;
  let error: string | null = null;
  let kpis: { active: number; trialing: number; pastDue: number } | null = null;

  if (user) {
    // subscriptions.coach_id references coaches.id, not the auth uid
    const coachId = await resolveCoachId(supabase, user.id);
    const query = supabase
      .from("subscriptions")
      .select(
        `
        id, status, start_date,
        plan:subscription_plans(name),
        client:profiles(full_name, email, avatar_url)
        `,
        { count: "exact" }
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false })
      .range(from, to);

    if (filter) query.eq("status", filter);

    // Roster KPIs for the Stitch stat row — head-counts only, no rows shipped.
    const [res, activeC, trialC, dueC] = await Promise.all([
      query,
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "active"),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "trialing"),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "past_due"),
    ]);

    if (res.error) {
      // S-mask: never surface DB internals to the coach (remediation-log rule).
      error = res.error.message;
    } else {
      rows = (res.data ?? []) as unknown as typeof rows;
      total = res.count;
    }
    kpis = { active: activeC.count ?? 0, trialing: trialC.count ?? 0, pastDue: dueC.count ?? 0 };
  }

  const statuses = ["active", "cancelled", "past_due", "trialing", "expired", "paused"] as const;
  const totalPages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (filter) q.set("status", filter);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/dashboard/subscribers?${qs}` : "/dashboard/subscribers";
  };
  const shownFrom = total === 0 ? 0 : from + 1;
  const shownTo = Math.min(from + rows.length, total ?? from + rows.length);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("subscribers.list.pageTitle")}
        description={t("subscribers.list.pageDesc")}
      />

      {error && (
        <Badge variant="destructive" className="w-fit">
          {t("subscribers.list.loadError")}
        </Badge>
      )}

      {kpis && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label={t("subscribers.kpi.active")}
            icon={Users}
            value={fmt.num(kpis.active)}
            footer={
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                {t("subscribers.kpi.activeHint")}
              </span>
            }
          />
          <StatCard
            label={t("subscribers.kpi.trialing")}
            icon={Users}
            value={fmt.num(kpis.trialing)}
            footer={
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#68dfa6]" />
                {t("subscribers.kpi.trialingHint")}
              </span>
            }
          />
          <StatCard
            label={t("subscribers.kpi.pastDue")}
            icon={Users}
            value={fmt.num(kpis.pastDue)}
            footer={
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ea7a72]" />
                {t("subscribers.kpi.pastDueHint")}
              </span>
            }
          />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <GlobalLink href="/dashboard/subscribers">
          <Button variant={!filter ? "default" : "secondary"} size="sm" className="rounded-full">
            {t("common.state.all")}
          </Button>
        </GlobalLink>
        {statuses.map((s) => (
          <GlobalLink key={s} href={`/dashboard/subscribers?status=${s}`}>
            <Button variant={filter === s ? "default" : "secondary"} size="sm" className="rounded-full">
              {statusLabel(s)}
            </Button>
          </GlobalLink>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-headline-md">{t("subscribers.list.cardTitle")}</CardTitle>
          {total != null && total > 0 && (
            <CardDescription>
              {t("subscribers.list.showing", { from: shownFrom, to: shownTo, total: fmt.num(total) })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.list.client")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.list.plan")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("common.table.status")}</TableHead>
                <TableHead className="text-label-sm uppercase tracking-wider text-faint">{t("subscribers.list.startDate")}</TableHead>
                <TableHead className="text-end text-label-sm uppercase tracking-wider text-faint">{t("common.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const name = r.client?.full_name ?? r.client?.email ?? t("common.state.unknown");
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {r.client?.avatar_url ? <AvatarImage src={r.client.avatar_url} alt="" /> : null}
                          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-body-md font-medium">{name}</p>
                          <p className="truncate text-body-sm text-faint">{r.client?.email ?? ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-body-md">{r.plan?.name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-body-sm tabular-nums text-muted-foreground">{fmt.date(r.start_date)}</TableCell>
                    <TableCell className="text-end">
                      <GlobalLink href={`/dashboard/subscribers/${r.id}`}>
                        <Button variant="secondary" size="sm">{t("common.actions.view")}</Button>
                      </GlobalLink>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    <EmptyState
                      icon={Users}
                      title={t("subscribers.list.empty")}
                      action={
                        <GlobalLink href="/dashboard/plans" className="text-body-sm text-primary underline-offset-4 hover:underline">
                          {t("common.nav.plans")}
                        </GlobalLink>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {total != null && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <p className="text-body-sm text-faint">
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
        )}
      </Card>
    </div>
  );
}
