import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveCoachId } from "@/lib/coach";
import { loadActiveClients } from "@/lib/workouts";
import { loadNutritionProgramsPage } from "@/lib/nutrition";
import { averageProgramDayMacros } from "@/lib/nutrition-math";
import { loadNutritionLibraryMetrics } from "@/lib/nutrition-metrics";
import { clampPage, LIB_PAGE_SIZE, pageCount, pageRange, parsePageParam } from "@/lib/pagination";
import { Pager } from "@/components/dashboard/Pager";
import { NutritionClient } from "@/components/nutrition/NutritionClient";
import { PageHeader } from "@/components/core/PageHeader";
import { StatCard } from "@/components/core/StatCard";
import { EmptyState } from "@/components/core/EmptyState";
import { Apple, ArrowLeftRight, Flame, UserX, UtensilsCrossed } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

export default async function NutritionPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const { t, fmt } = await getI18n();
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const coachId = await resolveCoachId(supabase, user.id);

  if (coachId === user.id) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("common.nav.nutrition")} description={t("nutrition.page.subtitle")} />
        <EmptyState icon={UserX} title={t("nutrition.page.coachMissing")} />
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

  const [{ programs }, clients, metrics] = await Promise.all([
    loadNutritionProgramsPage(coachId, from, to),
    loadActiveClients(coachId),
    loadNutritionLibraryMetrics(coachId),
  ]);

  // Mean prescribed day energy/macros — computed from the tree already in
  // memory (this page's programs), no extra query.
  const avgDay = averageProgramDayMacros(programs);

  const kpis = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t("nutrition.metrics.avgEnergyLabel")}
        icon={Flame}
        value={avgDay != null ? fmt.num(avgDay.calories) : "—"}
      />
      <StatCard
        label={t("nutrition.metrics.programsLabel")}
        icon={Apple}
        value={fmt.num(total)}
        footer={
          <span>
            {t("nutrition.metrics.assignmentsFooter", {
              n: fmt.num(metrics.activeAssignments),
              m: fmt.num(metrics.assignmentClients),
            })}
          </span>
        }
      />
      <StatCard
        label={t("nutrition.metrics.adherenceLabel")}
        icon={UtensilsCrossed}
        value={metrics.adherence ? fmt.percent(metrics.adherence.pct) : "—"}
        footer={
          <span>
            {metrics.adherence
              ? t("nutrition.metrics.adherenceFooter", {
                  completed: fmt.num(metrics.adherence.completed),
                  planned: fmt.num(metrics.adherence.planned),
                })
              : t("nutrition.metrics.noData")}
          </span>
        }
      />
      <StatCard
        label={t("nutrition.metrics.swapsLabel")}
        icon={ArrowLeftRight}
        value={fmt.num(metrics.swaps7d)}
        footer={<span>{t("nutrition.metrics.swapsFooter")}</span>}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <NutritionClient initialPrograms={programs} clients={clients} kpis={kpis} />
      <Pager basePath="/dashboard/nutrition" page={page} totalPages={pageCount(total, LIB_PAGE_SIZE)} />
    </div>
  );
}
