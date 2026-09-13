import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, MessageSquare, TrendingUp } from "lucide-react";
import type { ActivityItem } from "@/lib/supabase/types";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Real data is keyed by coaches.id (the mobile app's coach identity)
  const coachId = await resolveCoachId(supabase, user.id);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [subs, payments, convs] = await Promise.all([
    supabase.from("subscriptions").select("id").eq("coach_id", coachId).eq("status", "active"),
    supabase
      .from("payment_intents")
      .select("amount, created_at, status")
      .eq("coach_id", coachId)
      .eq("status", "succeeded")
      .gte("created_at", monthStart.toISOString()),
    // conversations.coach_id is the auth user id
    supabase.from("conversations").select("coach_unread").eq("coach_id", user.id),
  ]);

  const hadError = subs.error || payments.error || convs.error;

  const stats = {
    active: subs.data?.length ?? 0,
    revenue_cents: (payments.data ?? []).reduce(
      (s: number, r: { amount: number }) => s + (r.amount ?? 0),
      0
    ),
    unread: (convs.data ?? []).reduce(
      (s: number, r: { coach_unread: number | null }) => s + (r.coach_unread ?? 0),
      0
    ),
  };

  // Build the activity feed from real rows (best-effort)
  const [recentSubs, coachConvs] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, created_at, client:profiles(full_name)")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("conversations").select("id").eq("coach_id", user.id),
  ]);

  const convIds = (coachConvs.data ?? []).map((c: { id: string }) => c.id);
  const recentMsgs = convIds.length
    ? await supabase
        .from("messages")
        .select("id, content, created_at, sender:profiles(full_name)")
        .in("conversation_id", convIds)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as unknown[] };

  const built: ActivityItem[] = [];
  for (const raw of (recentSubs.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const s = raw as unknown as { id: string; status: string; created_at: string; client: unknown };
    const client = Array.isArray(s.client)
      ? (s.client[0] as { full_name?: string } | undefined)
      : (s.client as { full_name?: string } | undefined);
    const cancelled = s.status === "cancelled" || s.status === "canceled";
    built.push({
      id: `sub_${s.id}`,
      type: cancelled ? "canceled" : "new_subscription",
      title: `${cancelled ? "Cancellation" : "New subscription"}: ${client?.full_name ?? "Client"}`,
      description: `Status: ${s.status}`,
      created_at: s.created_at,
    });
  }
  for (const raw of (recentMsgs.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const m = raw as unknown as { id: string; content: string; created_at: string; sender: unknown };
    const sender = Array.isArray(m.sender)
      ? (m.sender[0] as { full_name?: string } | undefined)
      : (m.sender as { full_name?: string } | undefined);
    built.push({
      id: `msg_${m.id}`,
      type: "new_message",
      title: `Message from ${sender?.full_name ?? "client"}`,
      description: m.content.slice(0, 80),
      created_at: m.created_at,
    });
  }
  built.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const activity = built.slice(0, 6);

  const netCents = Math.round(stats.revenue_cents * 0.85); // 15% platform commission estimate when Stripe not configured
  const currency = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        {hadError && (
          <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
            Some data could not be loaded — check table permissions
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active subscribers</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Across all plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net revenue (this month)</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{currency(netCents)}</div>
            <p className="text-xs text-muted-foreground">Gross {currency(stats.revenue_cents)} · 15% fee deducted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unread messages</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold">{stats.unread}</div>
            <p className="text-xs text-muted-foreground">Realtime via Supabase</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <TrendingUp className="size-4" />
          <CardTitle className="text-base">Activity feed</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 border-b last:border-0 pb-3 last:pb-0">
                  <Badge
                    variant={
                      a.type === "new_subscription" ? "default" : a.type === "canceled" ? "destructive" : "secondary"
                    }
                    className="h-6 shrink-0"
                  >
                    {a.type.replace("_", " ")}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    {a.description && <p className="text-xs text-muted-foreground truncate">{a.description}</p>}
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
