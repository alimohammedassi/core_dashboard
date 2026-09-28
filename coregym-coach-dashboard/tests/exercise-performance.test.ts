import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeExerciseStats, resolveSessionDurationMin } from "../src/lib/performance-math.ts";
import type { WorkoutSetLog } from "../src/lib/supabase/types.ts";

const tpl = { target_sets: 4 };

const set = (over: Record<string, unknown> = {}) =>
  ({
    exercise_name: "Bench Press",
    reps: 8,
    weight_kg: 60,
    is_warmup: false,
    ...over,
  }) as unknown as WorkoutSetLog;

describe("computeExerciseStats", () => {
  it("excludes warmup sets from volume and completion", () => {
    const s = computeExerciseStats(tpl, [
      set({ is_warmup: true, weight_kg: 100, reps: 10 }),
      set({ weight_kg: 60, reps: 8 }),
      set({ weight_kg: 60, reps: 8 }),
    ]);
    assert.equal(s.volume, 960);
    assert.equal(s.actualSets.length, 2);
    assert.equal(s.warmupSets.length, 1);
    assert.equal(s.completionPct, 50);
  });

  it("tracks best weight, breaking ties by reps", () => {
    const s = computeExerciseStats(tpl, [
      set({ weight_kg: 60, reps: 8 }),
      set({ weight_kg: 70, reps: 5 }),
      set({ weight_kg: 70, reps: 6 }),
    ]);
    assert.equal(s.bestWeightKg, 70);
    assert.equal(s.bestReps, 6);
  });

  it("returns null completion when target sets is zero", () => {
    const s = computeExerciseStats({ target_sets: 0 }, [set()]);
    assert.equal(s.completionPct, null);
  });

  it("handles empty logs as zeros and nulls", () => {
    const s = computeExerciseStats(tpl, []);
    assert.equal(s.volume, 0);
    assert.equal(s.bestWeightKg, null);
    assert.equal(s.bestReps, null);
    assert.equal(s.completionPct, 0);
  });
});

describe("resolveSessionDurationMin", () => {
  it("trusts a logged duration", () => {
    assert.equal(
      resolveSessionDurationMin({ duration_min: 45, started_at: null, ended_at: null }),
      45
    );
  });

  it("falls back to started/ended timestamps when missing or zero", () => {
    assert.equal(
      resolveSessionDurationMin({
        duration_min: null,
        started_at: "2026-09-20T10:00:00Z",
        ended_at: "2026-09-20T10:32:30Z",
      }),
      33
    );
    assert.equal(
      resolveSessionDurationMin({
        duration_min: 0,
        started_at: "2026-09-20T10:00:00Z",
        ended_at: "2026-09-20T11:00:00Z",
      }),
      60
    );
  });

  it("returns null without usable data", () => {
    assert.equal(resolveSessionDurationMin(null), null);
    assert.equal(
      resolveSessionDurationMin({ duration_min: null, started_at: null, ended_at: null }),
      null
    );
  });
});
