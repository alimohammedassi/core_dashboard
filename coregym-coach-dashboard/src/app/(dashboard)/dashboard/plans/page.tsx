import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { PlansClient } from "@/components/plans/PlansClient";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionPlan } from "@/lib/supabase/types";

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let plans: SubscriptionPlan[] = [];
  let coachId = "";
  let error: string | null = null;

  if (user) {
    // subscription_plans.coach_id references coaches.id, not the auth uid
    coachId = await resolveCoachId(supabase, user.id);
    const { data, error: qErr } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (qErr) {
      error = qErr.message;
    } else {
      plans = (data ?? []) as unknown as SubscriptionPlan[];
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscription plans</h1>
          <p className="text-sm text-muted-foreground">Create and edit your coaching plans. Writes go to <code className="font-mono">subscription_plans</code>.</p>
        </div>
        {error && (
          <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
            {error}
          </Badge>
        )}
      </div>
      <PlansClient initialPlans={plans} coachId={coachId} />
    </div>
  );
}
