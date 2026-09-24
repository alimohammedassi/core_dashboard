import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadNutritionPrograms } from "@/lib/nutrition";
import { NutritionClient } from "@/components/nutrition/NutritionClient";
import { Card, CardContent } from "@/components/ui/card";

export default async function NutritionPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const coachId = await resolveCoachId(supabase, user.id);

  if (coachId === user.id) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Nutrition</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Coach profile missing — complete onboarding to build nutrition programs.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [programs, clients] = await Promise.all([
    loadNutritionPrograms(coachId),
    loadActiveClients(coachId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nutrition</h1>
        <p className="text-sm text-muted-foreground">
          Build weekly meal plans from the food library, then assign them to clients.
        </p>
      </div>
      <NutritionClient initialPrograms={programs} clients={clients} />
    </div>
  );
}
