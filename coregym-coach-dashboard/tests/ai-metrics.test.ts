import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisMetrics } from "../src/lib/ai/metrics.ts";
import type { AiAnalysisPayload } from "../src/lib/ai/payload.ts";

// Deterministic metrics tests: every number the UI visualizes comes from this
// module, computed ONLY from the payload (never from AI output). Covers the
// full counts/percent/series math plus empty, zero and boundary datasets.

function payloadFixture(): AiAnalysisPayload {
  return {
    generated_at: "2026-09-28",
    client: {
      display_name: "Jane Doe",
      age: 30,
      gender: "female",
      height_cm: 170,
      weight_kg_latest: 70,
      weight_trend_kg: -2.5,
      fitness_goal: "Lose weight",
      numeric_goals: { daily_calories: 2000, weekly_workouts: 4, target_weight_kg: 65, available: true },
    },
    subscription: { status: "active", plan_name: "Premium" },
    workout_program: {
      enrollment: null,
      weekly_schedule: [],
      status_summary: { completed: 6, started: 1, skipped: 1, missed: 2, upcoming: 4 },
      recent_performance: [],
      personal_records: [],
      weekly_volume_kg: [
        { week_start: "2026-09-07", volume: 10000, sessions: 3 },
        { week_start: "2026-09-14", volume: 0, sessions: 0 },
        { week_start: "2026-09-21", volume: 12500.5, sessions: 4 },
      ],
      sessions_last_30: 9,
      window: { since: "2026-09-01", until: "2026-09-28", truncated: false },
    },
    nutrition_program: {
      enrollment: null,
      weekly_schedule_prescribed: [],
      daily_totals_prescribed: [
        { day_of_week: 1, calories: 1800, protein_g: 130, carbs_g: 180, fat_g: 60 },
        { day_of_week: 2, calories: 2000, protein_g: 140, carbs_g: 200, fat_g: 65 },
      ],
    },
    nutrition_adherence: {
      overall: { planned: 40, completed: 30, skipped: 4, pct: 75 },
      weekly: [
        { week: 1, planned: 28, completed: 21, skipped: 3, pct: 75, prescribed: { calories: 1800, protein_g: 130, carbs_g: 180, fat_g: 60 }, current: { calories: 1750, protein_g: 128, carbs_g: 175, fat_g: 59 } },
      ],
      client_changes_summary: null,
    },
    data_notes: { measurements_included: false, prescription_truncated: false, heuristic_fields: [] },
  };
}

describe("buildAnalysisMetrics — workout", () => {
  it("counts statuses and derives completion % over elapsed assignments only", () => {
    const m = buildAnalysisMetrics(payloadFixture());
    // elapsed = completed + started + missed + skipped = 10; upcoming excluded
    assert.equal(m.workout.elapsed, 10);
    assert.equal(m.workout.completed, 6);
    assert.equal(m.workout.started, 1);
    assert.equal(m.workout.missed, 2);
    assert.equal(m.workout.skipped, 1);
    assert.equal(m.workout.upcoming, 4);
    assert.equal(m.workout.completion_pct, 60);
  });

  it("returns null completion % when nothing has elapsed yet", () => {
    const p = payloadFixture();
    p.workout_program.status_summary = { completed: 0, started: 0, skipped: 0, missed: 0, upcoming: 5 };
    const m = buildAnalysisMetrics(p);
    assert.equal(m.workout.elapsed, 0);
    assert.equal(m.workout.completion_pct, null);
  });

  it("treats an all-completed history as 100%", () => {
    const p = payloadFixture();
    p.workout_program.status_summary = { completed: 3, started: 0, skipped: 0, missed: 0, upcoming: 0 };
    assert.equal(buildAnalysisMetrics(p).workout.completion_pct, 100);
  });

  it("passes the weekly volume series and sessions-last-30 through untouched (incl. null)", () => {
    const m = buildAnalysisMetrics(payloadFixture());
    assert.equal(m.workout.sessions_last_30, 9);
    assert.deepEqual(m.workout.weekly_volume, [
      { week_start: "2026-09-07", volume: 10000, sessions: 3 },
      { week_start: "2026-09-14", volume: 0, sessions: 0 },
      { week_start: "2026-09-21", volume: 12500.5, sessions: 4 },
    ]);

    const p = payloadFixture();
    p.workout_program.sessions_last_30 = null;
    assert.equal(buildAnalysisMetrics(p).workout.sessions_last_30, null);
  });
});

describe("buildAnalysisMetrics — nutrition", () => {
  it("passes adherence overall and weekly series through", () => {
    const m = buildAnalysisMetrics(payloadFixture());
    assert.deepEqual(m.nutrition.overall, { planned: 40, completed: 30, skipped: 4, pct: 75 });
    assert.equal(m.nutrition.weekly.length, 1);
    assert.deepEqual(m.nutrition.weekly[0], { week: 1, planned: 28, completed: 21, skipped: 3, pct: 75 });
  });

  it("averages prescribed daily macros with sane rounding", () => {
    const m = buildAnalysisMetrics(payloadFixture());
    // mean of 1800/2000 kcal; protein mean 135; carbs 190; fat 62.5 → 62.5 rounds half-up? round1(62.5) = 62.5 exactly
    assert.deepEqual(m.nutrition.avg_daily, { calories: 1900, protein_g: 135, carbs_g: 190, fat_g: 62.5 });
  });

  it("returns null avg_daily when no prescribed days exist", () => {
    const p = payloadFixture();
    p.nutrition_program.daily_totals_prescribed = [];
    assert.equal(buildAnalysisMetrics(p).nutrition.avg_daily, null);
  });

  it("handles an all-zero adherence window without NaN", () => {
    const p = payloadFixture();
    p.nutrition_adherence.overall = { planned: 0, completed: 0, skipped: 0, pct: null };
    p.nutrition_adherence.weekly = [];
    const m = buildAnalysisMetrics(p);
    assert.equal(m.nutrition.overall.pct, null);
    assert.deepEqual(m.nutrition.weekly, []);
  });
});

describe("buildAnalysisMetrics — weight", () => {
  it("passes the latest weight and trend through", () => {
    const m = buildAnalysisMetrics(payloadFixture());
    assert.equal(m.weight.latest_kg, 70);
    assert.equal(m.weight.trend_kg, -2.5);
  });

  it("keeps nulls as nulls (missing weight data is never guessed)", () => {
    const p = payloadFixture();
    p.client.weight_kg_latest = null;
    p.client.weight_trend_kg = null;
    const m = buildAnalysisMetrics(p);
    assert.equal(m.weight.latest_kg, null);
    assert.equal(m.weight.trend_kg, null);
  });
});

describe("buildAnalysisMetrics — determinism", () => {
  it("produces identical output for identical input (no clock, no randomness)", () => {
    const a = buildAnalysisMetrics(payloadFixture());
    const b = buildAnalysisMetrics(payloadFixture());
    assert.deepEqual(a, b);
  });
});
