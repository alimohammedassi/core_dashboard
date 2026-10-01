import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients, loadExerciseCatalog, isWithinDays } from "@/lib/workouts";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutsClient } from "@/components/workouts/WorkoutsClient";
import { WorkoutsPager } from "@/components/workouts/WorkoutsPager";
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

  const [templatesRes, clients, catalog, assignments] = await Promise.all([
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
    // Data honesty: real per-template usage — one coach-scoped query,
    // aggregated below into a distinct-client count per template.
    hasCoachRow
      ? supabase.from("workout_assignments").select("template_id,client_id").eq("coach_id", coachId)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const clientsByTemplate = new Map<string, Set<string>>();
  for (const row of (assignments.data ?? []) as { template_id: string | null; client_id: string | null }[]) {
    if (!row?.template_id || !row?.client_id) continue;
    const seen = clientsByTemplate.get(row.template_id) ?? new Set<string>();
    seen.add(row.client_id);
    clientsByTemplate.set(row.template_id, seen);
  }
  const usedBy: Record<string, number> = {};
  for (const [templateId, seen] of clientsByTemplate) usedBy[templateId] = seen.size;

  const templates = ((templatesRes.data ?? []) as unknown as WorkoutTemplate[]).map((t) => ({
    ...t,
    exercises: (t.exercises ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  }));

  // Freshness dots are computed at request time on the server so the client
  // render stays pure (react-hooks/purity) — "updated this week" = volt.
  const freshTemplates: Record<string, boolean> = {};
  for (const tpl of templates) {
    freshTemplates[tpl.id] = isWithinDays(tpl.updated_at, 7);
  }

  if (!hasCoachRow) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="font-display text-headline-lg tracking-tight">{t("common.nav.workouts")}</h1>
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
    <div className="flex flex-col gap-5">
      <WorkoutsClient
        initialTemplates={templates}
        clients={clients}
        catalog={catalog}
        usedBy={usedBy}
        totalTemplates={total}
        freshTemplates={freshTemplates}
      />
      <WorkoutsPager
        basePath="/dashboard/workouts"
        page={page}
        totalPages={pageCount(total, LIB_PAGE_SIZE)}
        total={total}
        pageSize={LIB_PAGE_SIZE}
      />
    </div>
  );
}
