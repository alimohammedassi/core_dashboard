import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadCoachPrograms } from "@/lib/programs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramsClient } from "@/components/programs/ProgramsClient";
import type { WorkoutTemplate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const coachId = await resolveCoachId(supabase, user.id);
  const hasCoachRow = coachId !== user.id;

  const [programs, clients, templatesRes] = await Promise.all([
    hasCoachRow ? loadCoachPrograms(coachId) : Promise.resolve([]),
    hasCoachRow ? loadActiveClients(coachId) : Promise.resolve([]),
    hasCoachRow
      ? supabase.from("workout_templates").select("id, name").eq("coach_id", coachId).order("name")
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const templates = (templatesRes.data ?? []) as unknown as Pick<WorkoutTemplate, "id" | "name">[];

  if (!hasCoachRow) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coach profile missing</CardTitle>
            <CardDescription>
              Programs are owned by your coach profile, which does not exist yet. Complete coach onboarding first.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
        <p className="text-sm text-muted-foreground">
          Group your workout templates into a weekly schedule, then enroll clients — their daily workouts are generated
          for the whole duration automatically.
        </p>
      </div>
      <ProgramsClient initialPrograms={programs} clients={clients} templates={templates} />
    </div>
  );
}
