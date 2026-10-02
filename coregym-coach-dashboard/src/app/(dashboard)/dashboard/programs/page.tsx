import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadCoachProgramsPage, loadProgramsLibraryStats, type ProgramsLibraryStats } from "@/lib/programs";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { StatCard, StatCardChip } from "@/components/core/StatCard";
import { ProgramsClient } from "@/components/programs/ProgramsClient";
import { getI18n } from "@/lib/i18n/server";
import { CalendarCheck2, Dumbbell, Target, Users } from "lucide-react";
import type { WorkoutTemplate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { t, fmt } = await getI18n();

  if (!user) return null;

  const coachId = await resolveCoachId(supabase, user.id);
  const hasCoachRow = coachId !== user.id;
  const requestedPage = parsePageParam((await searchParams)?.page);

  // Programs page slice first — its ids scope the per-program athlete counts.
  const [programsRes, clients] = await Promise.all([
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
  ]);
  const { programs, total, page } = programsRes;

  const [templatesRes, stats] = await Promise.all([
    hasCoachRow
      ? supabase.from("workout_templates").select("id, name").eq("coach_id", coachId).order("name")
      : Promise.resolve({ data: [] as unknown[], error: null }),
    hasCoachRow
      ? loadProgramsLibraryStats(coachId, programs.map((p) => p.id))
      : Promise.resolve({
          activeEnrolledAthletes: 0,
          activeEnrollments: 0,
          nextStart: null,
          completedAssignments: 0,
          totalAssignments: 0,
          athletesPerProgram: {},
        } satisfies ProgramsLibraryStats),
  ]);

  const templates = (templatesRes.data ?? []) as unknown as Pick<WorkoutTemplate, "id" | "name">[];

  if (!hasCoachRow) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-[1.5rem] font-bold leading-8 tracking-tight text-foreground lg:text-[2.5rem] lg:leading-[2.75rem]">{t("common.nav.programs")}</h1>
        <div className="rounded-xl bg-card p-5 ring-1 ring-border">
          <p className="font-display text-headline-sm text-foreground">
            {t("programs.page.coachProfileMissing")}
          </p>
          <p className="mt-1 text-body-md text-muted-foreground">
            {t("programs.page.coachProfileMissingBody")}
          </p>
        </div>
      </div>
    );
  }

  // KPI 3: mean completion over every assignment generated for this coach's
  // enrollments ("—" until any enrollment exists).
  const completionPct =
    stats.totalAssignments > 0 ? (stats.completedAssignments / stats.totalAssignments) * 100 : null;
  // KPI 4 footer: library is ordered by updated_at desc, so the first loaded
  // row carries the latest update. Only honest when the page slice is non-empty.
  const latestUpdated = programs[0]?.updated_at;

  const kpis = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t("programs.page.kpiActiveAthletes")}
        icon={Users}
        value={fmt.num(stats.activeEnrolledAthletes)}
        footer={<span>{t("programs.page.ofClients", { n: fmt.num(clients.length) })}</span>}
        progress={
          clients.length > 0 ? Math.round((stats.activeEnrolledAthletes / clients.length) * 100) : undefined
        }
      />
      <StatCard
        label={t("programs.page.kpiActiveEnrollments")}
        icon={CalendarCheck2}
        value={fmt.num(stats.activeEnrollments)}
        suffix={t("programs.page.ofPrograms", { n: fmt.num(total) })}
        footer={
          <span>
            {stats.nextStart
              ? t("programs.page.nextStart", { date: fmt.date(stats.nextStart) })
              : t("programs.page.noScheduledStarts")}
          </span>
        }
      />
      <StatCard
        label={t("programs.page.kpiCompletionRate")}
        icon={Target}
        value={completionPct != null ? fmt.percent(completionPct) : "—"}
        valueClassName="text-primary"
        footer={
          <span>
            {t("programs.page.completedOf", {
              completed: fmt.num(stats.completedAssignments),
              total: fmt.num(stats.totalAssignments),
            })}
          </span>
        }
      />
      <StatCard
        label={t("programs.page.kpiLibrary")}
        icon={Dumbbell}
        value={fmt.num(total)}
        badge={<StatCardChip tone="mint">{t("programs.page.activeCount", { n: fmt.num(stats.activeEnrollments) })}</StatCardChip>}
        footer={
          latestUpdated ? (
            <span>{t("programs.list.updated", { date: fmt.date(latestUpdated) })}</span>
          ) : undefined
        }
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <ProgramsClient
        initialPrograms={programs}
        clients={clients}
        templates={templates}
        total={total}
        kpis={kpis}
        athletesByProgram={stats.athletesPerProgram}
      />
      <Pager basePath="/dashboard/programs" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
