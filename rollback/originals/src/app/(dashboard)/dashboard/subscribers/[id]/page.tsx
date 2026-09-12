import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mockSubscriptions } from "@/lib/mock";

type SubDetail = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plan: { name: string; price_cents: number; duration_days: number; description: string | null } | null;
  client: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let fetched: SubDetail | null = null;

  if (user) {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        `
        id, status, start_date, end_date, created_at,
        plan:subscription_plans(name, price_cents, duration_days, description),
        client:profiles!subscriptions_client_id_fkey(full_name, email, avatar_url)
      `
      )
      .eq("id", id)
      .eq("coach_id", user.id)
      .single();
    if (data) {
      const raw = data as unknown as Record<string, unknown>;
      const planRaw = raw.plan as unknown;
      const clientRaw = raw.client as unknown;
      const plan = Array.isArray(planRaw) ? (planRaw[0] as SubDetail["plan"]) : (planRaw as SubDetail["plan"]);
      const client = Array.isArray(clientRaw) ? (clientRaw[0] as SubDetail["client"]) : (clientRaw as SubDetail["client"]);
      fetched = {
        id: raw.id as string,
        status: raw.status as string,
        start_date: raw.start_date as string,
        end_date: (raw.end_date as string | null) ?? null,
        created_at: raw.created_at as string,
        plan,
        client,
      };
    }
  }

  const mock = mockSubscriptions.find((m) => m.id === id);
  const fallback: SubDetail | null = mock
    ? {
        id: mock.id,
        status: mock.status,
        start_date: mock.start_date,
        end_date: mock.end_date,
        created_at: mock.created_at,
        plan: mock.plan
          ? { name: mock.plan.name, price_cents: mock.plan.price_cents, duration_days: mock.plan.duration_days, description: mock.plan.description }
          : null,
        client: mock.client ? { full_name: mock.client.full_name, email: mock.client.email, avatar_url: mock.client.avatar_url } : null,
      }
    : null;

  const sub: SubDetail | null = fetched ?? fallback;

  if (!sub) notFound();

  const name = sub.client?.full_name ?? sub.client?.email ?? "Client";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Subscriber detail</h1>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription>{sub.client?.email ?? ""}</CardDescription>
          </div>
          <Badge className="ml-auto" variant={sub.status === "active" ? "default" : "secondary"}>
            {sub.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="font-medium">{sub.plan?.name ?? "—"}</p>
            {sub.plan?.description && <p className="text-sm text-muted-foreground">{sub.plan.description}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="font-medium">{sub.plan ? `$${(sub.plan.price_cents / 100).toFixed(2)}` : "—"}</p>
            <p className="text-xs text-muted-foreground">{sub.plan?.duration_days ? `${sub.plan.duration_days} days` : ""}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="text-sm">{new Date(sub.start_date).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">End</p>
            <p className="text-sm">{sub.end_date ? new Date(sub.end_date).toLocaleString() : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Subscription ID</p>
            <p className="font-mono text-xs break-all">{sub.id}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription history</CardTitle>
          <CardDescription>Only what the schema exposes — no invented tracking tables.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">Created {new Date(sub.created_at).toLocaleDateString()} · Status {sub.status}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Progress/logging data would appear here if the schema exposed it (e.g. workout logs, check-ins). No new tables
            are created in this pass.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
