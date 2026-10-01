import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadCoachProgramsPage } from "@/lib/programs";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramsClient } from "@/components/programs/ProgramsClient";
import { getI18n } from "@/lib/i18n/server";
import type { WorkoutTemplate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({
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

  const [programsRes, clients, templatesRes] = await Promise.all([
    hasCoachRow
      ? (async () => {
          // Two-step: exact total first so the requested page clamps, then
          // the bounded page slice (P3 — no more full-library loads).
          const { count } = await supabase
            .from("coach_programs")
            .select("id", { count: "exact", head: true })
            .eq("coach_id", coachId);
          const total = count ?? 0;
          const page = clampPage(requestedPage, total);
          const { from, to } = pageRange(page);
          const { programs } = await loadCoachProgramsPage(coachId, from, to);
          return { programs, total, page };
        })()
      : Promise.resolve({ programs: [], total: 0, page: 1 }),
    hasCoachRow ? loadActiveClients(coachId) : Promise.resolve([]),
    hasCoachRow
      ? supabase.from("workout_templates").select("id, name").eq("coach_id", coachId).order("name")
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  const { programs, total, page } = programsRes;

  const templates = (templatesRes.data ?? []) as unknown as Pick<WorkoutTemplate, "id" | "name">[];

  if (!hasCoachRow) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="font-display text-headline-lg tracking-tight">{t("common.nav.programs")}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("programs.page.coachProfileMissing")}</CardTitle>
            <CardDescription>{t("programs.page.coachProfileMissingBody")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-headline-lg tracking-tight">{t("programs.page.title")}</h1>
        <p className="mt-1 text-body-md text-muted-foreground">{t("programs.page.subtitle")}</p>
      </div>
      <ProgramsClient initialPrograms={programs} clients={clients} templates={templates} />
      <Pager basePath="/dashboard/programs" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
