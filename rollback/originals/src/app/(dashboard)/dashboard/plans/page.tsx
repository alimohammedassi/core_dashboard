import { createClient } from "@/lib/supabase/server";
import { PlansClient } from "@/components/plans/PlansClient";
import { mockPlans } from "@/lib/mock";

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let plans: typeof mockPlans = [];
  let isMock = false;

  if (user) {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) {
      plans = mockPlans;
      isMock = true;
    } else {
      plans = data as unknown as typeof mockPlans;
    }
  } else {
    plans = mockPlans;
    isMock = true;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscription plans</h1>
          <p className="text-sm text-muted-foreground">Create and edit your coaching plans. Writes go to <code className="font-mono">subscription_plans</code>.</p>
        </div>
      </div>
      <PlansClient initialPlans={plans} isMock={isMock} coachId={user?.id ?? "mock_coach"} />
    </div>
  );
}
