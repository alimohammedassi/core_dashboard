import type { SupabaseClient } from "@supabase/supabase-js";

// Overview aggregates — every number is computed from live rows scoped to the
// resolved coach id (subscriptions/plans/payments) or the auth uid (chat).
// No synthetic data: empty windows render as honest empty states.

export type RangeKey = "30d" | "month" | "90d";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "90d", label: "Last 90 days" },
];

export function resolveRange(raw?: string | null): RangeKey {
  return raw === "month" || raw === "90d" ? raw : "30d";
}

export interface Period {
  start: Date; // inclusive, local midnight
  end: Date; // exclusive
  prevStart: Date;
  prevEnd: Date;
  presetLabel: string;
  rangeLabel: string; // "Aug 16 – Sep 15 · Last 30 days"
  bucket: "day" | "week";
}

const DAY = 86400000;

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function resolvePeriod(range: RangeKey, now = new Date()): Period {
  const end = now;
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;
  let presetLabel: string;

  if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = start;
    presetLabel = "This month";
  } else {
    const days = range === "90d" ? 90 : 30;
    start = new Date(end.getTime() - days * DAY);
    prevEnd = start;
    prevStart = new Date(start.getTime() - days * DAY);
    presetLabel = range === "90d" ? "Last 90 days" : "Last 30 days";
  }

  const rangeLabel = `${fmtDay(start)} – ${fmtDay(end)} · ${presetLabel}`;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
  return { start, end, prevStart, prevEnd, presetLabel, rangeLabel, bucket: days <= 62 ? "day" : "week" };
}

const inWindow = (iso: string | null | undefined, from: Date, to: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

export function trend(current: number, previous: number): { dir: "up" | "down" | "flat"; label: string; vs: string } {
  if (previous === 0) {
    return current === 0
      ? { dir: "flat", label: "0%", vs: "vs. 0 last period" }
      : { dir: "up", label: "New", vs: "vs. 0 last period" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { dir: "flat", label: "0%", vs: `vs. ${previous} last period` };
  return {
    dir: pct > 0 ? "up" : "down",
    label: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`,
    vs: `vs. ${previous} last period`,
  };
}

export interface BucketPoint {
  label: string;
  value: number;
}

// Bucket the window by day (short windows) or ISO week (90d), producing a
// dense zero-filled series so the area chart never shows a shifted timeline.
export function buildBuckets(period: Period): { key: number; label: string; end: number }[] {
  const points: { key: number; label: string; end: number }[] = [];
  if (period.bucket === "day") {
    const cursor = new Date(period.start);
    while (cursor < period.end) {
      const next = new Date(cursor.getTime() + DAY);
      points.push({ key: cursor.getTime(), label: fmtDay(cursor), end: next.getTime() });
      cursor.setTime(next.getTime());
    }
  } else {
    const cursor = new Date(period.start);
    while (cursor < period.end) {
      const next = new Date(Math.min(cursor.getTime() + 7 * DAY, period.end.getTime()));
      points.push({ key: cursor.getTime(), label: `Wk of ${fmtDay(cursor)}`, end: next.getTime() });
      cursor.setTime(next.getTime());
    }
  }
  return points;
}

export function bucketize(
  rows: { ts: string | null }[],
  buckets: { key: number; end: number }[]
): number[] {
  const sums = buckets.map(() => 0);
  for (const r of rows) {
    if (!r.ts) continue;
    const t = new Date(r.ts).getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].key && t < buckets[i].end) {
        sums[i] += 1;
        break;
      }
    }
  }
  return sums;
}

export interface SubRow {
  id: string;
  client_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plan: { name: string; price_usd: number } | null;
  client: { full_name: string | null; name: string | null; email: string | null; avatar_url: string | null } | null;
}

export interface OverviewData {
  period: Period;
  kpis: {
    active: { current: number; tr: ReturnType<typeof trend> };
    netRevenue: { cents: number; grossCents: number; tr: ReturnType<typeof trend>; hasPayments: boolean };
    unread: { count: number; tr: ReturnType<typeof trend> };
    workouts: { current: number; tr: ReturnType<typeof trend> };
  };
  chart: {
    mode: "revenue" | "subscribers";
    points: BucketPoint[];
    total: number; // total across window (net cents or subscriber count)
  };
  breakdown: { label: string; count: number; tone: "lime" | "teal" | "coral" }[];
  weekday: { day: string; count: number }[];
  peakDay: number; // index into weekday, -1 when all zero
  adherence: { rate: number | null; onTrack: number; tracked: number };
  topSubscribers: {
    id: string;
    name: string;
    email: string | null;
    plan: string | null;
    status: string;
    startDate: string;
    revenueCents: number;
  }[];
  statusCounts: { active: number; trial: number; cancelled: number; total: number };
  today: { checkIns: number; meals: number };
  activePrograms: number;
}

export async function getOverviewData(
  supabase: SupabaseClient,
  userId: string,
  coachId: string,
  period: Period
): Promise<OverviewData> {
  const isos = {
    start: period.start.toISOString(),
    end: period.end.toISOString(),
    prevStart: period.prevStart.toISOString(),
    prevEnd: period.prevEnd.toISOString(),
  };

  // Round 1 — independent queries
  const [subsRes, paysRes, convRes, payCountRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        `id, client_id, status, start_date, end_date, created_at,
         plan:subscription_plans(name, price_usd),
         client:profiles!subscriptions_client_id_fkey(full_name, name, email, avatar_url)`
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false }),
    // All-time succeeded payments: chart + KPI + per-client revenue in one read
    supabase
      .from("payment_intents")
      .select("amount, created_at, client_id")
      .eq("coach_id", coachId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase.from("conversations").select("id, coach_unread").eq("coach_id", userId),
    supabase
      .from("payment_intents")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("status", "succeeded"),
  ]);

  const subs = ((subsRes.data ?? []) as unknown as SubRow[]).map((s) => ({
    ...s,
    plan: Array.isArray(s.plan) ? s.plan[0] ?? null : s.plan,
    client: Array.isArray(s.client) ? s.client[0] ?? null : s.client,
  }));

  const payments = (paysRes.data ?? []) as unknown as Array<{ amount: number; created_at: string; client_id: string | null }>;
  const hasPayments = (payCountRes.count ?? 0) > 0;

  // KPI 1 — active subscribers now vs live at the end of the previous window
  const activeNow = subs.filter((s) => s.status === "active").length;
  const activePrev = subs.filter((s) => {
    if (s.start_date && new Date(s.start_date).getTime() >= period.prevEnd.getTime()) return false;
    if (s.end_date && new Date(s.end_date).getTime() <= period.prevEnd.getTime()) return false;
    return true;
  }).length;

  // KPI 2 — net revenue in window vs previous window (15% platform fee)
  const netOf = (rows: typeof payments, from: Date, to: Date) =>
    rows.filter((p) => inWindow(p.created_at, from, to)).reduce((s, p) => s + (p.amount ?? 0), 0);
  const grossCur = netOf(payments, period.start, period.end);
  const grossPrev = netOf(payments, period.prevStart, period.prevEnd);
  const netCur = Math.round(grossCur * 0.85);

  // KPI 3 — unread now (state) + message flow delta (received, period vs prev)
  const unread = (convRes.data ?? []).reduce(
    (s: number, r: { coach_unread: number | null }) => s + (r.coach_unread ?? 0),
    0
  );

  // Round 2 — queries that depend on the coach's client ids / conversation ids
  const convIds = (convRes.data ?? []).map((c: { id: string }) => c.id);
  const clientIds = Array.from(new Set(subs.map((s) => s.client_id).filter(Boolean))) as string[];
  const activeIds = Array.from(
    new Set(subs.filter((s) => s.status === "active").map((s) => s.client_id).filter(Boolean))
  ) as string[];

  const [msgRes, sessionsRes, goalsRes, summariesRes] = await Promise.all([
    convIds.length
      ? supabase
          .from("messages")
          .select("created_at, sender_id")
          .in("conversation_id", convIds)
          .neq("sender_id", userId)
          .gte("created_at", isos.prevStart)
          .order("created_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    clientIds.length
      ? supabase
          .from("workout_sessions")
          .select("ended_at, session_date")
          .in("user_id", clientIds)
          .gte("ended_at", isos.prevStart)
          .order("ended_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    activeIds.length
      ? supabase.from("user_goals").select("user_id, daily_calories").in("user_id", activeIds)
      : Promise.resolve({ data: [] as unknown[] }),
    activeIds.length
      ? supabase
          .from("daily_summary")
          .select("user_id, summary_date, calories_consumed")
          .in("user_id", activeIds)
          .gte("summary_date", period.start.toISOString().slice(0, 10))
          .order("summary_date", { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

    // Round 3 — today-level engagement + active program counts (independent)
  const [checkinsRes, mealsRes, enrollmentsRes] = await Promise.all([
    activeIds.length ? supabase.from('daily_summary').select('user_id, summary_date').in('user_id', activeIds).eq('summary_date', new Date().toISOString().slice(0, 10)).limit(500) : Promise.resolve({ data: [] as unknown[] }),
    activeIds.length ? supabase.from('nutrition_logs').select('id, user_id').in('user_id', activeIds).eq('logged_date', new Date().toISOString().slice(0, 10)).limit(500) : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('client_program_enrollments').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'active'),
  ]);
  const todayCheckIns = new Set(((checkinsRes.data ?? []) as unknown as Array<{ user_id: string }>).map((r) => r.user_id)).size;
  const todayMeals = (mealsRes.data ?? []).length;
  const activePrograms = enrollmentsRes.count ?? 0;
const msgs = (msgRes.data ?? []) as unknown as Array<{ created_at: string; sender_id: string }>;
  const msgsCur = msgs.filter((m) => inWindow(m.created_at, period.start, period.end)).length;
  const msgsPrev = msgs.filter((m) => inWindow(m.created_at, period.prevStart, period.prevEnd)).length;

  const sessions = (sessionsRes.data ?? []) as unknown as Array<{ ended_at: string | null; session_date: string | null }>;
  const inCur = sessions.filter((s) => inWindow(s.ended_at, period.start, period.end));
  const inPrev = sessions.filter((s) => inWindow(s.ended_at, period.prevStart, period.prevEnd));

  // Chart — revenue per bucket, falling back to new subscriptions per bucket
  // when the coach has no succeeded payments at all (never fake zeros).
  const buckets = buildBuckets(period);
  let chartMode: "revenue" | "subscribers" = "revenue";
  let series: number[];
  let chartTotal: number;
  if (hasPayments) {
    series = buckets.map((b) => {
      const from = new Date(b.key);
      const to = new Date(b.end);
      return Math.round(netOf(payments, from, to) * 0.85);
    });
    chartTotal = netCur;
  } else {
    chartMode = "subscribers";
    series = bucketize(
      subs.map((s) => ({ ts: s.created_at })),
      buckets
    );
    chartTotal = series.reduce((a, b) => a + b, 0);
  }
  const chartPoints = buckets.map((b, i) => ({ label: b.label, value: series[i] }));

  // Breakdown strip — current status mix across all of the coach's subscriptions
  const statusCounts = {
    active: subs.filter((s) => s.status === "active").length,
    trial: subs.filter((s) => s.status === "trialing").length,
    cancelled: subs.filter((s) => s.status === "cancelled" || s.status === "canceled").length,
    total: subs.length,
  };
  const breakdown = [
    { label: "Active", count: statusCounts.active, tone: "lime" as const },
    { label: "Trial", count: statusCounts.trial, tone: "teal" as const },
    { label: "Cancelled", count: statusCounts.cancelled, tone: "coral" as const },
  ];

  // Most active day — sessions in the window by client-local weekday
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
  for (const s of inCur) {
    const dateStr = s.session_date ?? (s.ended_at ? s.ended_at.slice(0, 10) : null);
    if (!dateStr) continue;
    const dow = (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
    weekdayCounts[dow] += 1;
  }
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({
    day,
    count: weekdayCounts[i],
  }));
  const peakDay = weekdayCounts.some((c) => c > 0) ? weekdayCounts.indexOf(Math.max(...weekdayCounts)) : -1;

  // Goal adherence — active clients whose latest in-period daily_summary lands
  // within ±10% of their calorie goal
  const goals = (goalsRes.data ?? []) as unknown as Array<{ user_id: string; daily_calories: number | null }>;
  const goalByUser = new Map(goals.map((g) => [g.user_id, g.daily_calories]));
  const latestByUser = new Map<string, number | null>();
  for (const s of (summariesRes.data ?? []) as unknown as Array<{
    user_id: string;
    summary_date: string;
    calories_consumed: number | null;
  }>) {
    if (!latestByUser.has(s.user_id)) latestByUser.set(s.user_id, s.calories_consumed);
  }
  let onTrack = 0;
  let tracked = 0;
  for (const id of activeIds) {
    const goal = goalByUser.get(id);
    const consumed = latestByUser.get(id);
    if (goal == null || goal <= 0 || consumed == null || consumed <= 0) continue;
    tracked += 1;
    if (Math.abs(consumed - goal) / goal <= 0.1) onTrack += 1;
  }
  const adherenceRate = activeIds.length > 0 && tracked > 0 ? Math.round((onTrack / activeIds.length) * 100) : null;

  // Top subscribers — latest 6 by start date with lifetime paid per client
  const paidByClient = new Map<string, number>();
  for (const p of payments) {
    if (!p.client_id) continue;
    paidByClient.set(p.client_id, (paidByClient.get(p.client_id) ?? 0) + (p.amount ?? 0));
  }
  const topSubscribers = subs.slice(0, 6).map((s) => ({
    id: s.id,
    name: s.client?.full_name || s.client?.name || s.client?.email || "Client",
    email: s.client?.email ?? null,
    plan: s.plan?.name ?? null,
    status: s.status,
    startDate: s.start_date,
    revenueCents: paidByClient.get(s.client_id) ?? 0,
  }));

  return {
    period,
    kpis: {
      active: { current: activeNow, tr: trend(activeNow, activePrev) },
      netRevenue: { cents: netCur, grossCents: grossCur, tr: trend(netCur, Math.round(grossPrev * 0.85)), hasPayments },
      unread: { count: unread, tr: trend(msgsCur, msgsPrev) },
      workouts: { current: inCur.length, tr: trend(inCur.length, inPrev.length) },
    },
    chart: { mode: chartMode, points: chartPoints, total: chartTotal },
    breakdown,
    weekday,
    peakDay,
    adherence: { rate: adherenceRate, onTrack, tracked },
    topSubscribers,
    statusCounts,
    today: { checkIns: todayCheckIns, meals: todayMeals },
    activePrograms,
  };
}
