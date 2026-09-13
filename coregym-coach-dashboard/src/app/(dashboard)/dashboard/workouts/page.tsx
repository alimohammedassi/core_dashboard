import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients, loadExerciseCatalog } from "@/lib/workouts";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";import { WorkoutsClient } from "@/components/workouts/WorkoutsClient";
import type { WorkoutTemplate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const coachId = await resolveCoachId(supabase, user.id);
  const hasCoachRow = coachId !== user.id;

  const [templatesRes, clients, catalog] = await Promise.all([
    hasCoachRow
      ? supabase
          .from("workout_templates")
          .select("*, exercises:workout_template_exercises(*)")
          .eq("coach_id", coachId)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    hasCoachRow ? loadActiveClients(coachId) : Promise.resolve([]),
    loadExerciseCatalog(),
  ]);

  const templates = ((templatesRes.data ?? []) as unknown as WorkoutTemplate[]).map((t) => ({
    ...t,
    exercises: (t.exercises ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  }));

  if (!hasCoachRow) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Workouts</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coach profile missing</CardTitle>
            <CardDescription>
              Workout templates are owned by your coach profile, which does not exist yet. Complete coach onboarding
              first, then come back to build your template library.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workouts</h1>
        <p className="text-sm text-muted-foreground">
          Your reusable workout templates. Build once, assign to any active client, then review their performance.
        </p>
      </div>
      <WorkoutsClient initialTemplates={templates} clients={clients} catalog={catalog} />
    </div>
  );
}
