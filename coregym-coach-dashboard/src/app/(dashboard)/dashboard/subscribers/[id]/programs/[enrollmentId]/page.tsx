import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachContext } from "@/lib/workouts";
import { loadEnrollmentProgress, weekdayLabel } from "@/lib/programs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RegenerateButton } from "@/components/programs/RegenerateButton";
import { TrendingUp } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  started: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

export default async function EnrollmentProgressPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { id, enrollmentId } = await params;
  const ctx = await requireCoachContext();
  if (!ctx) notFound();

  const progress = await loadEnrollmentProgress(ctx.coachId, id, enrollmentId);
  if (!progress) notFound();

  const { enrollment, programDays, grid, weeklyVolume } = progress;
  const weeks = Array.from({ length: enrollment.duration_weeks }, (_, i) => i + 1);
  const canRegenerate = enrollment.status === "active" && progress.futureAssignedCount > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/subscribers/${id}`} className="hover:text-foreground">
          ← Customer profile
        </Link>
        <span>/</span>
        <span className="text-foreground">Program progress</span>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl font-bold">{enrollment.program_name}</CardTitle>
            <Badge variant={enrollment.status === "active" ? "default" : "outline"}>{enrollment.status}</Badge>
          </div>
          <CardDescription className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
            <span>Starts: {enrollment.start_date}</span>
            <span>{enrollment.duration_weeks} weeks</span>
            <span>
              Adherence: {progress.completedAssignments} / {progress.totalAssignments} workouts completed
            </span>
            <span className="text-foreground">
              Training days: {programDays.map((d) => weekdayLabel(d.day_of_week)).join(", ") || "none"}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Weeks × days grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress grid</CardTitle>
          <CardDescription>
            Each cell is one workout generated from the program. Click a cell to open its performance review.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="w-14 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">Week</th>
                {programDays.map((d) => (
                  <th key={d.id} className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {weekdayLabel(d.day_of_week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week}>
                  <td className="align-middle text-xs font-semibold text-muted-foreground">W{week}</td>
                  {programDays.map((day) => {
                    const cell = grid.find((c) => c.week === week && c.dayOfWeek === day.day_of_week);
                    if (!cell || cell.status === null) {
                      return (
                        <td key={day.id} className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    const variant =
                      cell.status === "completed"
                        ? "default"
                        : cell.status === "assigned"
                          ? "outline"
                          : "secondary";
                    const inner = (
                      <Badge variant={variant} className="w-full justify-center">
                        {STATUS_LABEL[cell.status] ?? cell.status}
                      </Badge>
                    );
                    return (
                      <td key={day.id} className="p-0">
                        {cell.assignmentId ? (
                          <Button
                            render={
                              <Link href={`/dashboard/subscribers/${id}/workouts/${cell.assignmentId}`} />
                            }
                            variant="ghost"
                            className="w-full p-0.5"
                            aria-label={`${weekdayLabel(day.day_of_week)} week ${week}: ${cell.templateName}`}
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
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" /> Volume by week
          </CardTitle>
          <CardDescription>Working-set volume from sessions linked to this enrollment only.</CardDescription>
        </CardHeader>
        <CardContent>
          {weeklyVolume.every((w) => w.volume === 0) ? (
            <p className="text-sm text-muted-foreground">No logged volume for this enrollment yet.</p>
          ) : (
            <div className="flex h-32 items-end gap-2">
              {weeklyVolume.map((w) => {
                const max = Math.max(...weeklyVolume.map((x) => x.volume), 1);
                return (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {w.volume > 0 ? `${(w.volume / 1000).toFixed(1)}t` : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-primary/70"
                      style={{ height: `${Math.max((w.volume / max) * 100, w.volume > 0 ? 4 : 1)}%` }}
                      title={`Week ${w.week}: ${w.volume.toLocaleString()} kg · ${w.sessions} sessions`}
                    />
                    <span className="text-[10px] text-muted-foreground">W{w.week}</span>
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
          <CardTitle className="text-base">Adjust after program edits</CardTitle>
          <CardDescription>
            If the program&apos;s weekday mapping changed, this replaces only the future still-“Assigned” workouts with
            the new mapping. Completed, started, skipped and past workouts are never touched.
          </CardDescription>
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
