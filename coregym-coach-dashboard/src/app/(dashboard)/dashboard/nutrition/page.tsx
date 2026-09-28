import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadNutritionProgramsPage } from "@/lib/nutrition";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { NutritionClient } from "@/components/nutrition/NutritionClient";
import { Card, CardContent } from "@/components/ui/card";

export default async function NutritionPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
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

  const requestedPage = parsePageParam((await searchParams)?.page);
  // P3: exact total first (for clamp + pager), then the bounded page slice.
  const { count: programTotal } = await supabase
    .from("nutrition_programs")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId);
  const total = programTotal ?? 0;
  const page = clampPage(requestedPage, total);
  const { from, to } = pageRange(page);

  const [{ programs }, clients] = await Promise.all([
    loadNutritionProgramsPage(coachId, from, to),
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
      <Pager basePath="/dashboard/nutrition" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
