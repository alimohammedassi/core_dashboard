import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// Simple status badge mapping
function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "active"
      ? "default"
      : status === "cancelled" || status === "canceled" || status === "expired"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = params.status;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: Array<{
    id: string;
    status: string;
    start_date: string;
    plan?: { name: string } | null;
    client?: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  }> = [];
  let error: string | null = null;

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
      `
      )
      .eq("coach_id", coachId)
      .order("start_date", { ascending: false });

    if (filter) query.eq("status", filter);

    const { data, error: qErr } = await query;
    if (qErr) {
      error = qErr.message;
    } else {
      rows = (data ?? []) as unknown as typeof rows;
    }
  }

  const statuses = ["active", "cancelled", "past_due", "trialing", "expired", "paused"] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
        {error && (
          <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
            {error}
          </Badge>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/dashboard/subscribers">
          <Button variant={!filter ? "default" : "outline"} size="sm">All</Button>
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/dashboard/subscribers?status=${s}`}>
            <Button variant={filter === s ? "default" : "outline"} size="sm">{s}</Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriber list — sortable/filterable by status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const name = r.client?.full_name ?? r.client?.email ?? "Unknown";
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">{r.client?.email ?? ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.plan?.name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm">{new Date(r.start_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/subscribers/${r.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No subscribers found.
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
