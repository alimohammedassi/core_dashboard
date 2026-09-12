import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, MessageSquare, TrendingUp } from "lucide-react";
import { mockActivity } from "@/lib/mock";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let stats = { active: 2, revenue_cents: 17800, unread: 2 };
  let activity = mockActivity;
  let isMock = true;

  if (user) {
    try {
      const coachId = user.id;
      const [subs, payments, convs] = await Promise.all([
        supabase.from("subscriptions").select("id").eq("coach_id", coachId).eq("status", "active"),
        supabase
          .from("payment_intents")
          .select("amount, created_at, status")
          .eq("coach_id", coachId)
          .eq("status", "succeeded")
          .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
        supabase.from("messages").select("id, read, conversation_id").eq("read", false).limit(100),
      ]);

      // Only switch off mock if at least one query succeeded without "table not found" error
      if (!subs.error && !payments.error) {
        isMock = false;
        stats = {
          active: subs.data?.length ?? 0,
          revenue_cents: (payments.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0),
          unread: convs.data?.length ?? 0,
        };

        // Build activity from real data (best-effort)
        const { data: recentSubs } = await supabase
          .from("subscriptions")
          .select("id, status, created_at, client:profiles!subscriptions_client_id_fkey(full_name)")
          .eq("coach_id", coachId)
          .order("created_at", { ascending: false })
          .limit(5);

        const { data: recentMsgs } = await supabase
          .from("messages")
          .select("id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name)")
          .order("created_at", { ascending: false })
          .limit(5);

        const built: typeof activity = [];
        for (const raw of (recentSubs ?? []) as unknown as Array<Record<string, unknown>>) {
          const s = raw as unknown as { id: string; status: string; created_at: string; client: unknown };
          const client = Array.isArray(s.client) ? (s.client[0] as { full_name?: string } | undefined) : (s.client as { full_name?: string } | undefined);
          built.push({
            id: `sub_${s.id}`,
            type: s.status === "canceled" ? "canceled" : "new_subscription",
            title: `${s.status === "canceled" ? "Canceled" : "New subscription"}: ${client?.full_name ?? "Client"}`,
            description: `Status: ${s.status}`,
            created_at: s.created_at,
          });
        }
        for (const raw of (recentMsgs ?? []) as unknown as Array<Record<string, unknown>>) {
          const m = raw as unknown as { id: string; content: string; created_at: string; sender: unknown };
          const sender = Array.isArray(m.sender) ? (m.sender[0] as { full_name?: string } | undefined) : (m.sender as { full_name?: string } | undefined);
          built.push({
            id: `msg_${m.id}`,
            type: "new_message",
            title: `Message from ${sender?.full_name ?? "client"}`,
            description: m.content.slice(0, 80),
            created_at: m.created_at,
          });
        }
        built.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        if (built.length) activity = built.slice(0, 6);
      }
    } catch {
      // keep mock
    }
  }

  const netCents = Math.round(stats.revenue_cents * 0.85); // 15% platform commission estimate when Stripe not configured
  const currency = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        {isMock && (
          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
            Mock data — connect Supabase to see live stats
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
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Across all plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net revenue (this month)</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currency(netCents)}</div>
            <p className="text-xs text-muted-foreground">Gross {currency(stats.revenue_cents)} · 15% fee deducted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unread messages</CardTitle>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unread}</div>
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
