import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients, loadExerciseCatalog } from "@/lib/workouts";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutsClient } from "@/components/workouts/WorkoutsClient";
import { getI18n } from "@/lib/i18n/server";
import type { WorkoutTemplate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { t } = await getI18n();

  if (!user) return null;

  const coachId = await resolveCoachId(supabase, user.id);
  const hasCoachRow = coachId !== user.id;
  const requestedPage = parsePageParam((await searchParams)?.page);

  // P3: exact total first (for clamp + pager), then the bounded page slice.
  const { count: templateTotal } = hasCoachRow
    ? await supabase
        .from("workout_templates")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
    : { count: 0 };
  const total = templateTotal ?? 0;
  const page = clampPage(requestedPage, total);
  const { from, to } = pageRange(page);

  const [templatesRes, clients, catalog] = await Promise.all([
    hasCoachRow
      ? supabase
          .from("workout_templates")
          .select("*, exercises:workout_template_exercises(*)")
          .eq("coach_id", coachId)
          .order("updated_at", { ascending: false })
          .range(from, to)
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
        <h1 className="text-2xl font-bold tracking-tight">{t("common.nav.workouts")}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("workouts.page.coachProfileMissing")}</CardTitle>
            <CardDescription>{t("workouts.page.coachProfileMissingBody")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("common.nav.workouts")}</h1>
        <p className="text-sm text-muted-foreground">{t("workouts.page.subtitle")}</p>
      </div>
      <WorkoutsClient initialTemplates={templates} clients={clients} catalog={catalog} />
      <Pager basePath="/dashboard/workouts" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
