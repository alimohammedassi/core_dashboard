import { GlobalLink } from "@/components/shared/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCoachContext, loadAssignmentPerformance, loadClientProgress } from "@/lib/workouts";
import { getI18n } from "@/lib/i18n/server";
import type { TKey } from "@/lib/i18n/dictionary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FeedbackBox } from "@/components/workouts/FeedbackBox";
import { NextWorkoutEditor } from "@/components/workouts/NextWorkoutEditor";
import { Activity, Clock, MessageSquare, Timer, Trophy } from "lucide-react";
import type { ExercisePerformance } from "@/lib/workouts";

const WORKOUT_STATUS: Record<string, TKey> = {
  assigned: "subscribers.workoutStatus.assigned",
  started: "subscribers.workoutStatus.started",
  completed: "subscribers.workoutStatus.completed",
  skipped: "subscribers.workoutStatus.skipped",
};

function fmtTarget(e: { targetSets: number; targetReps: number | null; targetWeightKg: number | null }): string {
  const reps = e.targetReps != null ? `${e.targetReps}` : "—";
  const weight = e.targetWeightKg != null ? ` @ ${e.targetWeightKg}kg` : "";
  return `${e.targetSets} × ${reps}${weight}`;
}

export default async function PerformancePage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { t, fmt } = await getI18n();
  const wsLabel = (s: string) => (WORKOUT_STATUS[s] ? t(WORKOUT_STATUS[s]) : s);
  const { id, assignmentId } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) notFound();

  // `id` is the SUBSCRIPTION id (matching the profile route's convention);
  // resolve the real client profile id from it.
  const supabase = await createClient();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("client_id")
    .eq("id", id)
    .eq("coach_id", ctx.coachId)
    .maybeSingle();
  if (!subRow) notFound();
  const clientId = (subRow as { client_id: string }).client_id;

  const [performance, progress] = await Promise.all([
    loadAssignmentPerformance(ctx.coachId, clientId, assignmentId),
    loadClientProgress(ctx.coachId, clientId),
  ]);
  if (!performance) notFound();

  const { assignment, template, exercises, session } = performance;
  const hasSession = session !== null;

  // PRs for the exercises in this template first, then the client's others.
  const templateNames = new Set(exercises.map((e) => e.exerciseName.toLowerCase()));
  const prs = progress?.prs ?? [];
  const relevantPrs = [
    ...prs.filter((p) => templateNames.has(p.exercise_name.toLowerCase())),
    ...prs.filter((p) => !templateNames.has(p.exercise_name.toLowerCase())),
  ].slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <GlobalLink href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
          {t("subscribers.shared.backToProfile")}
        </GlobalLink>
        <span>/</span>
        <span className="text-foreground">{t("subscribers.assignmentPage.crumb")}</span>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="font-display text-xl font-bold tracking-tight">{template.name}</CardTitle>
            <Badge variant={assignment.status === "completed" ? "default" : "outline"}>
              {wsLabel(assignment.status)}
            </Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
            <span>{t("subscribers.assignmentPage.scheduled", { date: fmt.date(assignment.scheduled_date) })}</span>
            {session?.session_date && (
              <span>{t("subscribers.assignmentPage.completedOn", { date: fmt.date(session.session_date) })}</span>
            )}
            {performance.durationMin != null && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" /> {t("subscribers.assignmentPage.duration", { n: performance.durationMin })}
              </span>
            )}
            {session?.muscle_group && (
              <span>{t("subscribers.assignmentPage.muscleGroup", { mg: session.muscle_group })}</span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {!hasSession ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Timer className="mx-auto size-8 text-muted-foreground" />
            <p className="font-medium">{t("subscribers.assignmentPage.noSessionTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("subscribers.assignmentPage.noSessionBody1")}
              <br />
              {t("subscribers.assignmentPage.noSessionBody2")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Activity className="size-3.5" /> {t("subscribers.assignmentPage.setsCompleted")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold">
                  {performance.completedSets} / {performance.targetSetsTotal}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("subscribers.assignmentPage.totalVolume")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold">{fmt.num(performance.totalVolume)} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> {t("subscribers.assignmentPage.durationLabel")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold">
                  {performance.durationMin != null
                    ? t("subscribers.assignmentPage.duration", { n: performance.durationMin })
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Exercise-by-exercise target vs actual */}
          <div className="space-y-4">
            {exercises.map((ex: ExercisePerformance, idx) => (
              <Card key={`${ex.exerciseName}-${idx}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">
                      {idx + 1}. {ex.exerciseName}
                    </CardTitle>
                    <Badge
                      className="ms-auto"
                      variant={
                        ex.actualSets.length >= ex.targetSets
                          ? "default"
                          : ex.actualSets.length > 0
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {t("subscribers.assignmentPage.setsBadge", { done: ex.actualSets.length, target: ex.targetSets })}
                    </Badge>
                  </div>
                  <CardDescription>
                    {t("subscribers.assignmentPage.target", { target: fmtTarget(ex) })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ex.actualSets.length === 0 && ex.warmupSets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("subscribers.assignmentPage.noSets")}
                    </p>
                  ) : (
                    <>
                      {ex.actualSets.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("subscribers.assignmentPage.set")}</TableHead>
                              <TableHead>{t("subscribers.assignmentPage.weight")}</TableHead>
                              <TableHead>{t("subscribers.assignmentPage.reps")}</TableHead>
                              <TableHead>{t("subscribers.assignmentPage.volume")}</TableHead>
                              <TableHead>{t("subscribers.assignmentPage.rest")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ex.actualSets.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell>{s.set_number ?? "—"}</TableCell>
                                <TableCell>
                                  {s.weight_kg != null ? `${Number(s.weight_kg)} kg` : "—"}
                                  {s.weight_kg != null &&
                                    ex.bestWeightKg != null &&
                                    Number(s.weight_kg) === ex.bestWeightKg && (
                                      <Badge variant="secondary" className="ms-2">
                                        {t("subscribers.assignmentPage.best")}
                                      </Badge>
                                    )}
                                </TableCell>
                                <TableCell>{s.reps ?? "—"}</TableCell>
                                <TableCell>
                                  {s.weight_kg != null && s.reps != null
                                    ? `${fmt.num(Number(s.weight_kg) * s.reps)} kg`
                                    : "—"}
                                </TableCell>
                                <TableCell>{s.rest_sec != null ? `${s.rest_sec}s` : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {ex.warmupSets.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t("subscribers.assignmentPage.warmup", { n: ex.warmupSets.length })}
                          {ex.warmupSets
                            .map((s) => {
                              const weight =
                                s.weight_kg != null
                                  ? `${Number(s.weight_kg)}kg`
                                  : t("subscribers.assignmentPage.warmupBodyweight");
                              const reps =
                                s.reps != null ? ` ${t("subscribers.assignmentPage.warmupReps", { n: s.reps })}` : "";
                              return ` · ${weight}${reps}`;
                            })
                            .join("")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          {t("subscribers.assignmentPage.bestLine", {
                            value:
                              ex.bestWeightKg != null
                                ? `${ex.bestWeightKg} kg${ex.bestReps != null ? ` × ${ex.bestReps}` : ""}`
                                : "—",
                          })}
                        </span>
                        <span>
                          {t("subscribers.assignmentPage.volumeLine", { value: fmt.num(ex.totalVolume) })}
                        </span>
                        {ex.restSec != null && (
                          <span>{t("subscribers.assignmentPage.targetRest", { n: ex.restSec })}</span>
                        )}
                        {ex.notes && <span>{t("subscribers.assignmentPage.coachNote", { notes: ex.notes })}</span>}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Client note */}
          {performance.clientNote && (
            <Card>
              <CardHeader>
                <CardDescription>{t("subscribers.assignmentPage.clientNote")}</CardDescription>
                <CardTitle className="text-base font-medium">“{performance.clientNote}”</CardTitle>
              </CardHeader>
            </Card>
          )}
        </>
      )}

      {/* PRs */}
      {relevantPrs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" /> {t("subscribers.assignmentPage.prTitle")}
            </CardTitle>
            <CardDescription>{t("subscribers.assignmentPage.prDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {relevantPrs.map((pr) => (
              <div key={pr.exercise_name} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-sm font-medium">{pr.exercise_name}</p>
                <p className="text-lg font-extrabold">
                  {pr.max_weight != null ? `${Number(pr.max_weight)} kg` : "—"}
                  {pr.reps != null ? (
                    <span className="text-xs font-normal text-muted-foreground"> × {pr.reps}</span>
                  ) : null}
                </p>
                {pr.achieved_date && (
                  <p className="text-xs text-muted-foreground">{fmt.date(pr.achieved_date)}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feedback + adjustment loop */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4" /> {t("subscribers.assignmentPage.feedbackTitle")}
            </CardTitle>
            <CardDescription>{t("subscribers.assignmentPage.feedbackDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackBox clientId={clientId} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("subscribers.assignmentPage.adjustNextTitle")}</CardTitle>
            <CardDescription>{t("subscribers.assignmentPage.adjustDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <NextWorkoutEditor
              sourceAssignmentId={assignment.id}
              templateName={template.name}
              templateMuscles={template.target_muscles ?? []}
              templateNotes={template.notes}
              exercises={exercises}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
