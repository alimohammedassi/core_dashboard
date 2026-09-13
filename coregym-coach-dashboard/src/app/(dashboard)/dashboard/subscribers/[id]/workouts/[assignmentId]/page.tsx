import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachContext, loadAssignmentPerformance, loadClientProgress } from "@/lib/workouts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FeedbackBox } from "@/components/workouts/FeedbackBox";
import { NextWorkoutEditor } from "@/components/workouts/NextWorkoutEditor";
import { Activity, Clock, MessageSquare, Timer, Trophy } from "lucide-react";
import type { ExercisePerformance } from "@/lib/workouts";

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
  const { id, assignmentId } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) notFound();

  const [performance, progress] = await Promise.all([
    loadAssignmentPerformance(ctx.coachId, id, assignmentId),
    loadClientProgress(ctx.coachId, id),
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
          ← Customer profile
        </Link>
        <span>/</span>
        <span className="text-foreground">Performance</span>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl font-bold">{template.name}</CardTitle>
            <Badge variant={assignment.status === "completed" ? "default" : "outline"}>
              {assignment.status === "started" ? "In progress" : assignment.status}
            </Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
            <span>Scheduled: {assignment.scheduled_date}</span>
            {session?.session_date && <span>Completed: {session.session_date}</span>}
            {performance.durationMin != null && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" /> {performance.durationMin} min
              </span>
            )}
            {session?.muscle_group && <span>Muscle group: {session.muscle_group}</span>}
          </CardDescription>
        </CardHeader>
      </Card>

      {!hasSession ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Timer className="mx-auto size-8 text-muted-foreground" />
            <p className="font-medium">Workout session data is not available yet.</p>
            <p className="text-sm text-muted-foreground">
              Once the mobile app links the completed workout
              <br />
              to this assignment, performance will appear here.
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
                  <Activity className="size-3.5" /> Sets completed
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
                <CardDescription>Total volume (working sets)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold">{performance.totalVolume.toLocaleString()} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Duration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold">
                  {performance.durationMin != null ? `${performance.durationMin} min` : "—"}
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
                      className="ml-auto"
                      variant={
                        ex.actualSets.length >= ex.targetSets
                          ? "default"
                          : ex.actualSets.length > 0
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {ex.actualSets.length} / {ex.targetSets} sets
                    </Badge>
                  </div>
                  <CardDescription>Target: {fmtTarget(ex)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ex.actualSets.length === 0 && ex.warmupSets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No sets logged for this exercise in the linked session.
                    </p>
                  ) : (
                    <>
                      {ex.actualSets.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Set</TableHead>
                              <TableHead>Weight</TableHead>
                              <TableHead>Reps</TableHead>
                              <TableHead>Volume</TableHead>
                              <TableHead>Rest</TableHead>
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
                                      <Badge variant="secondary" className="ml-2">
                                        best
                                      </Badge>
                                    )}
                                </TableCell>
                                <TableCell>{s.reps ?? "—"}</TableCell>
                                <TableCell>
                                  {s.weight_kg != null && s.reps != null
                                    ? `${(Number(s.weight_kg) * s.reps).toLocaleString()} kg`
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
                          Warmup sets: {ex.warmupSets.length}
                          {ex.warmupSets
                            .map(
                              (s) =>
                                ` · ${s.weight_kg != null ? `${Number(s.weight_kg)}kg` : "bodyweight"}${s.reps != null ? ` × ${s.reps}` : ""}`
                            )
                            .join("")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          Best:{" "}
                          <span className="font-medium text-foreground">
                            {ex.bestWeightKg != null
                              ? `${ex.bestWeightKg} kg${ex.bestReps != null ? ` × ${ex.bestReps}` : ""}`
                              : "—"}
                          </span>
                        </span>
                        <span>
                          Volume:{" "}
                          <span className="font-medium text-foreground">{ex.totalVolume.toLocaleString()} kg</span>
                        </span>
                        {ex.restSec != null && <span>Target rest: {ex.restSec}s</span>}
                        {ex.notes && <span>Coach note: {ex.notes}</span>}
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
                <CardDescription>Client note</CardDescription>
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
              <Trophy className="size-4" /> Personal records
            </CardTitle>
            <CardDescription>From the app&apos;s personal_records — best weight per exercise.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {relevantPrs.map((pr) => (
              <div key={pr.exercise_name} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{pr.exercise_name}</p>
                <p className="text-lg font-extrabold">
                  {pr.max_weight != null ? `${Number(pr.max_weight)} kg` : "—"}
                  {pr.reps != null ? (
                    <span className="text-xs font-normal text-muted-foreground"> × {pr.reps}</span>
                  ) : null}
                </p>
                {pr.achieved_date && <p className="text-xs text-muted-foreground">{pr.achieved_date}</p>}
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
              <MessageSquare className="size-4" /> Send feedback to client
            </CardTitle>
            <CardDescription>Goes through the existing chat — the client sees it in the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackBox clientId={id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adjust the next workout</CardTitle>
            <CardDescription>
              Duplicate this prescription as an editable next workout — the original template stays reusable.
            </CardDescription>
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
