// Pure performance-review math (framework-free: no Supabase imports, so
// node --test can import this directly). Extracted verbatim from
// loadAssignmentPerformance in ./workouts (which re-exports it).
// Rules: warmup sets never count toward volume/completion; best = heaviest
// working weight (ties broken by reps); completion = working / target sets.
import type {
  WorkoutSession,
  WorkoutSetLog,
  WorkoutTemplateExercise,
} from "./supabase/types";

export type ExerciseStats = {
  actualSets: WorkoutSetLog[];
  warmupSets: WorkoutSetLog[];
  volume: number;
  bestWeightKg: number | null;
  bestReps: number | null;
  completionPct: number | null;
};

export function computeExerciseStats(
  tpl: Pick<WorkoutTemplateExercise, "target_sets">,
  all: WorkoutSetLog[]
): ExerciseStats {
  const actualSets = all.filter((s) => !s.is_warmup);
  const warmupSets = all.filter((s) => s.is_warmup);

  let volume = 0;
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;
  for (const s of actualSets) {
    const w = s.weight_kg != null ? Number(s.weight_kg) : null;
    if (w != null && s.reps != null) volume += w * s.reps;
    if (w != null && (bestWeightKg == null || w > bestWeightKg)) {
      bestWeightKg = w;
      bestReps = s.reps;
    } else if (w != null && w === bestWeightKg && s.reps != null && (bestReps == null || s.reps > bestReps)) {
      bestReps = s.reps;
    }
  }

  return {
    actualSets,
    warmupSets,
    volume,
    bestWeightKg,
    bestReps,
    completionPct: tpl.target_sets > 0 ? Math.round((actualSets.length / tpl.target_sets) * 100) : null,
  };
}

// Duration fallback: trust the logged duration_min unless missing/zero, then
// derive from started/ended timestamps.
export function resolveSessionDurationMin(
  session: Pick<WorkoutSession, "duration_min" | "started_at" | "ended_at"> | null
): number | null {
  let durationMin = session?.duration_min ?? null;
  if ((durationMin == null || durationMin === 0) && session?.started_at && session?.ended_at) {
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (ms > 0) durationMin = Math.round(ms / 60000);
  }
  return durationMin;
}
