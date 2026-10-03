import { GlobalLink } from "@/components/shared/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext } from "@/lib/workouts";
import { loadEnrollmentProgress } from "@/lib/programs";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/core/StatusBadge";
import { Button } from "@/components/ui/button";
import { RegenerateButton } from "@/components/programs/RegenerateButton";
import { TrendingUp } from "lucide-react";

const STATUS_LABEL: Record<string, TKey> = {
  assigned: "subscribers.workoutStatus.assigned",
  started: "subscribers.workoutStatus.started",
  completed: "subscribers.workoutStatus.completed",
  skipped: "subscribers.workoutStatus.skipped",
};

const SUB_STATUS: Record<string, TKey> = {
  active: "subscribers.status.active",
  paused: "subscribers.status.paused",
  cancelled: "subscribers.status.cancelled",
  canceled: "subscribers.status.canceled",
  past_due: "subscribers.status.pastDue",
  trialing: "subscribers.status.trialing",
  expired: "subscribers.status.expired",
  completed: "subscribers.status.completed",
};

// Enrollment status → Stitch chip tone.
const ENROLLMENT_TONE: Record<string, StatusTone> = {
  active: "emerald",
  paused: "amber",
  cancelled: "coral",
  canceled: "coral",
  completed: "mint",
};

// Assignment status → chip tone for the progress-grid cells.
const CELL_TONE: Record<string, StatusTone> = {
  completed: "emerald",
  assigned: "volt",
  started: "amber",
  skipped: "neutral",
};

// coach_program_days.day_of_week is 1 (Mon) … 7 (Sun)
const WEEKDAY_KEYS: Record<number, TKey> = {
  1: "programs.weekdays.mon",
  2: "programs.weekdays.tue",
  3: "programs.weekdays.wed",
  4: "programs.weekdays.thu",
  5: "programs.weekdays.fri",
  6: "programs.weekdays.sat",
  7: "programs.weekdays.sun",
};

export default async function EnrollmentProgressPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { t, fmt } = await getI18n();
  const statusLabel = (s: string) => (STATUS_LABEL[s] ? t(STATUS_LABEL[s]) : s);
  const subLabel = (s: string) => (SUB_STATUS[s] ? t(SUB_STATUS[s]) : s);
  const weekday = (dow: number) => (WEEKDAY_KEYS[dow] ? t(WEEKDAY_KEYS[dow]) : t("programs.weekdays.fallback", { n: dow }));
  const { id, enrollmentId } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) notFound();

  // `id` is the SUBSCRIPTION id (matching the profile route's convention);
  // resolve the real client profile id from it.
  // F-03: query failure → error boundary; no row (missing/RLS-filtered) → 404.
  const supabase = await createClient();
  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .select("client_id")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (subErr) throw new Error(`subscriber lookup failed: ${subErr.message}`);
  if (!subRow) notFound();
  const clientId = (subRow as { client_id: string }).client_id;

  const progress = await loadEnrollmentProgress(ctx.coachId, clientId, enrollmentId);
  if (!progress) notFound();

  const { enrollment, programDays, grid, weeklyVolume } = progress;
  const weeks = Array.from({ length: enrollment.duration_weeks }, (_, i) => i + 1);
  const canRegenerate = enrollment.status === "active" && progress.futureAssignedCount > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header (PageHeader-style): display headline + status chip, back-link
          row, and the enrollment meta line. */}
      <div className="relative overflow-hidden rounded-xl bg-card p-5 ring-1 ring-border">
        <div className="pointer-events-none absolute -end-16 -top-16 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[1.5rem] font-bold leading-8 tracking-tight text-foreground lg:text-[2.5rem] lg:leading-[2.75rem]">
              {enrollment.program_name}
            </h1>
            <StatusBadge tone={ENROLLMENT_TONE[enrollment.status] ?? "neutral"}>
              {subLabel(enrollment.status)}
            </StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
            <GlobalLink href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
              {t("subscribers.shared.backToProfile")}
            </GlobalLink>
            <span>/</span>
            <span className="text-foreground">{t("subscribers.enrollmentPage.crumb")}</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-muted-foreground tabular-nums">
            <span>{t("subscribers.shared.starts", { date: fmt.date(enrollment.start_date) })}</span>
            <span>{t("subscribers.shared.weeks", { n: fmt.num(enrollment.duration_weeks) })}</span>
            <span>
              {t("subscribers.enrollmentPage.adherenceWorkouts", {
                completed: fmt.num(progress.completedAssignments),
                total: fmt.num(progress.totalAssignments),
              })}
            </span>
            <span className="text-foreground">
              {t("subscribers.enrollmentPage.trainingDays", {
                days:
                  programDays.map((d) => weekday(d.day_of_week)).join(", ") ||
                  t("subscribers.enrollmentPage.noTrainingDays"),
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Weeks × days grid */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subscribers.enrollmentPage.gridTitle")}</CardTitle>
          <CardDescription>{t("subscribers.enrollmentPage.gridDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="w-14 text-start text-label-sm uppercase text-faint">
                  {t("common.time.week")}
                </th>
                {programDays.map((d) => (
                  <th key={d.id} className="text-start text-label-sm uppercase text-faint">
                    {weekday(d.day_of_week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week}>
                  <td className="align-middle text-label-md text-muted-foreground tabular-nums">
                    {t("subscribers.enrollmentPage.weekShort", { n: week })}
                  </td>
                  {programDays.map((day) => {
                    const cell = grid.find((c) => c.week === week && c.dayOfWeek === day.day_of_week);
                    if (!cell || cell.status === null) {
                      return (
                        <td key={day.id} className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    const inner = (
                      <StatusBadge tone={CELL_TONE[cell.status] ?? "neutral"} className="w-full justify-center">
                        {statusLabel(cell.status)}
                      </StatusBadge>
                    );
                    return (
                      <td key={day.id} className="p-0">
                        {cell.assignmentId ? (
                          <Button
                            render={
                              <GlobalLink href={`/dashboard/subscribers/${id}/workouts/${cell.assignmentId}`} />
                            }
                            variant="ghost"
                            className="w-full p-0.5"
                            aria-label={t("subscribers.enrollmentPage.ariaCell", {
                              day: weekday(day.day_of_week),
                              week,
                              name: cell.templateName ?? t("subscribers.sessions.workoutFallback"),
                            })}
                          >
                            {inner}
                          </Button>
                        ) : (
                          inner
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Volume trend scoped to this enrollment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4" /> {t("subscribers.enrollmentPage.volumeTitle")}
          </CardTitle>
          <CardDescription>{t("subscribers.enrollmentPage.volumeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {weeklyVolume.every((w) => w.volume === 0) ? (
            <p className="text-body-md text-muted-foreground">{t("subscribers.enrollmentPage.noVolume")}</p>
          ) : (
            <div className="flex h-32 items-end gap-2">
              {weeklyVolume.map((w) => {
                const max = Math.max(...weeklyVolume.map((x) => x.volume), 1);
                return (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {w.volume > 0
                        ? `${fmt.num(w.volume / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}t`
                        : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-primary/70"
                      style={{ height: `${Math.max((w.volume / max) * 100, w.volume > 0 ? 4 : 1)}%` }}
                      title={t("subscribers.enrollmentPage.weekTip", {
                        week: w.week,
                        volume: fmt.num(w.volume),
                        sessions: w.sessions,
                      })}
                    />
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {t("subscribers.enrollmentPage.weekShort", { n: w.week })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Remaining Weeks */}
      <Card>
        <CardHeader>
          <CardTitle>{t("subscribers.shared.adjustTitle")}</CardTitle>
          <CardDescription>{t("subscribers.enrollmentPage.adjustDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RegenerateButton
            enrollmentId={enrollment.id}
            enabled={canRegenerate}
            futureCount={progress.futureAssignedCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
