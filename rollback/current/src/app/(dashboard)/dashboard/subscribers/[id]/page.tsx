import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type SubDetail = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plan: { name: string; price_usd: number; duration_days: number } | null;
  client: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let sub: SubDetail | null = null;

  if (user) {
    // subscriptions.coach_id references coaches.id, not the auth uid
    const coachId = await resolveCoachId(supabase, user.id);
    const { data } = await supabase
      .from("subscriptions")
      .select(
        `
        id, status, start_date, end_date, created_at,
        plan:subscription_plans(name, price_usd, duration_days),
        client:profiles(full_name, email, avatar_url)
      `
      )
      .eq("id", id)
      .eq("coach_id", coachId)
      .maybeSingle();
    if (data) {
      const raw = data as unknown as Record<string, unknown>;
      const planRaw = raw.plan as unknown;
      const clientRaw = raw.client as unknown;
      const plan = Array.isArray(planRaw) ? (planRaw[0] as SubDetail["plan"]) : (planRaw as SubDetail["plan"]);
      const client = Array.isArray(clientRaw) ? (clientRaw[0] as SubDetail["client"]) : (clientRaw as SubDetail["client"]);
      sub = {
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
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="font-medium">{sub.plan?.price_usd != null ? `$${sub.plan.price_usd.toFixed(2)}` : "—"}</p>
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
          <CardDescription>Straight from the live subscriptions table.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">Created {new Date(sub.created_at).toLocaleDateString()} · Status {sub.status}</p>
        </CardContent>
      </Card>
    </div>
  );
}
