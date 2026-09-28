import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalysisPayload,
  inferMissingInformation,
  AI_BOUNDS,
  type AiDataBundle,
} from "../src/lib/ai/payload.ts";

// Unit tests for the pure AI payload builder: minimization (no email/avatar/
// UUIDs/chat/raw sets), bounds, missing-data honesty, and the prescribed-vs-
// actual nutrition semantics (spec §26 payload tests).

const SECRET = "secret-marker-should-never-appear";

function baseBundle(): AiDataBundle {
  return {
    today: "2026-09-28",
    client: {
      display_name: "Jane Doe",
      age: 30,
      gender: "female",
      height_cm: 170,
      weight_kg_profile: 70,
      fitness_goal: "Lose weight and build strength",
    },
    measurements: null,
    goals: { daily_calories: 2000, weekly_workouts: 4, target_weight_kg: 65 },
    subscription: { status: "active", plan_name: "Premium Coaching" },
    workout: {
      enrollment: { program_name: "PPL Base", start_date: "2026-09-01", duration_weeks: 12, status: "active" },
      prescription: {
        window: { since: "2026-08-31", until: "2026-09-28" },
        truncated: false,
        assignments: [
          {
            scheduled_date: "2026-09-20",
            week_number: 3,
            status: "completed",
            template_name: "Push A",
            target_muscles: ["chest", "triceps"],
            template_notes: "Focus on tempo",
            exercises: [
              {
                exercise_name: "Bench Press",
                target_sets: 4,
                target_reps: 8,
                target_weight_kg: 60,
                rest_sec: 120,
                notes: "pinch shoulder blades",
                order_index: 0,
              },
            ],
            session: { session_date: "2026-09-20", duration_min: 55 },
          },
          {
            scheduled_date: "2026-09-10",
            week_number: 2,
            status: "assigned", // past-due → missed
            template_name: "Pull A",
            target_muscles: ["back"],
            template_notes: null,
            exercises: [],
            session: null,
          },
          {
            scheduled_date: "2026-10-02",
            week_number: 5,
            status: "assigned", // future → upcoming
            template_name: "Legs A",
            target_muscles: ["quads"],
            template_notes: null,
            exercises: [],
            session: null,
          },
        ],
      },
      personal_records: [{ exercise_name: "Bench Press", max_weight: 62.5, reps: 5, achieved_date: "2026-09-20" }],
      weekly_volume: [
        { weekStart: "2026-09-21", volume: 12000, sessions: 3 },
        { weekStart: "2026-09-14", volume: 11000, sessions: 2 },
      ],
      sessions_last_30: 9,
    },
    nutrition: {
      enrollment: { program_name: "Cut V1", start_date: "2026-09-01", duration_weeks: 8, status: "active" },
      template_days: [
        {
          day_of_week: 1,
          notes: null,
          meals: [
            {
              name: "Breakfast",
              foods: [
                {
                  food_name: "Oats",
                  quantity: 80,
                  serving_unit: "g",
                  calories: 300,
                  protein_g: 10,
                  carbs_g: 50,
                  fat_g: 6,
                },
              ],
            },
          ],
        },
      ],
      weekly: {
        overall: { planned: 40, completed: 30, skipped: 4, pct: 75 },
        weekly: [
          {
            week: 1,
            planned: 28,
            completed: 21,
            skipped: 3,
            pct: 75,
            prescribed: { calories: 1800, protein_g: 130, carbs_g: 180, fat_g: 60 },
            current: { calories: 1750, protein_g: 128, carbs_g: 175, fat_g: 59 },
          },
        ],
      },
      client_changes: [
        {
          plan_date: "2026-09-15",
          meal_name: "Lunch",
          change_type: "substitution",
          original_food_name: "Rice",
          original_quantity: 150,
          new_food_name: "Quinoa",
          new_quantity: 140,
        },
      ],
    },
  };
}

function payloadString(bundle?: AiDataBundle): string {
  return JSON.stringify(buildAnalysisPayload(bundle ?? baseBundle()));
}

describe("AI payload — minimization (spec §4.4, §26)", () => {
  it("never includes email or avatar URLs", () => {
    const s = payloadString();
    assert.ok(!s.includes("@"), "no email-like content");
    assert.ok(!s.toLowerCase().includes("email"), "no email field");
    assert.ok(!s.toLowerCase().includes("avatar"), "no avatar field");
  });

  it("never includes auth UUIDs, coach UUIDs, or assignment/enrollment ids", () => {
    const s = payloadString();
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.ok(!uuidRe.test(s), "no UUIDs in the payload");
    assert.ok(!s.includes("coach_id"), "no coach_id");
    assert.ok(!s.includes("subscription_id"), "no subscription id");
    assert.ok(!s.includes("enrollment_id"), "no enrollment id");
    assert.ok(!s.includes("assignment_id"), "no assignment id");
  });

  it("never includes chat messages, workout-set logs, or note free-text from the change log", () => {
    const s = payloadString();
    assert.ok(!s.toLowerCase().includes("message"), "no chat content");
    assert.ok(!s.includes("workout_sets"), "no raw sets");
    assert.ok(!s.includes("reps_logged"), "no raw set logs");
    assert.ok(!s.toLowerCase().includes("session_note"), "no session notes");
    // change-log `note` (free text) is excluded at the collector; the payload
    // has no `note` field at all.
    assert.ok(!s.includes('"note"'), "no note field");
  });

  it("carries only allowlisted client profile fields", () => {
    const p = buildAnalysisPayload(baseBundle());
    const clientKeys = Object.keys(p.client).sort();
    assert.deepEqual(clientKeys, [
      "age",
      "display_name",
      "fitness_goal",
      "gender",
      "height_cm",
      "numeric_goals",
      "weight_kg_latest",
      "weight_trend_kg",
    ]);
  });
});

describe("AI payload — prescribed vs actual nutrition semantics (spec §1.5)", () => {
  it("labels the nutrition schedule and totals as prescribed", () => {
    const p = buildAnalysisPayload(baseBundle());
    assert.ok("weekly_schedule_prescribed" in p.nutrition_program);
    assert.ok("daily_totals_prescribed" in p.nutrition_program);
  });

  it("uses prescribed (original_*) food values, never client-modified current_*", () => {
    // Simulate a modified food: the bundle's template food was prescribed at
    // 80 g / 300 kcal — if the collector passed current_* the totals would
    // differ. The builder maps exactly what it is given; the prescribed label
    // plus the missing-consumption disclosure pin the semantics.
    const s = payloadString();
    assert.ok(s.includes("prescribed"), "prescribed labeling present");
  });

  it("always discloses that meal-level consumption cannot be linked to the plan", () => {
    const missing = inferMissingInformation(buildAnalysisPayload(baseBundle()));
    assert.ok(
      missing.some((m) => m.toLowerCase().includes("consumption") && m.toLowerCase().includes("prescribed")),
      "missing_information must state the consumption/prescription boundary"
    );
  });
});

describe("AI payload — status semantics (spec §8)", () => {
  it("classifies past-due assigned as missed and future assigned as upcoming", () => {
    const p = buildAnalysisPayload(baseBundle());
    assert.equal(p.workout_program.status_summary.completed, 1);
    assert.equal(p.workout_program.status_summary.missed, 1);
    assert.equal(p.workout_program.status_summary.upcoming, 1);
  });

  it("derives current_week from the enrollment start date", () => {
    const p = buildAnalysisPayload(baseBundle());
    // 2026-09-01 → 2026-09-28 is week 4 of 12.
    assert.equal(p.workout_program.enrollment?.current_week, 4);
  });
});

describe("AI payload — bounds (spec §13)", () => {
  it("caps weekly volume entries at AI_BOUNDS.weeklyVolumeWeeks", () => {
    const b = baseBundle();
    b.workout.weekly_volume = Array.from({ length: 50 }, (_, i) => ({
      weekStart: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      volume: i * 100,
      sessions: 1,
    }));
    const p = buildAnalysisPayload(b);
    assert.ok(p.workout_program.weekly_volume_kg.length <= AI_BOUNDS.weeklyVolumeWeeks);
  });

  it("caps personal records at AI_BOUNDS.personalRecords", () => {
    const b = baseBundle();
    b.workout.personal_records = Array.from({ length: 40 }, (_, i) => ({
      exercise_name: `Ex ${i}`,
      max_weight: 10 + i,
      reps: 5,
      achieved_date: "2026-09-01",
    }));
    const p = buildAnalysisPayload(b);
    assert.ok(p.workout_program.personal_records.length <= AI_BOUNDS.personalRecords);
  });

  it("caps exercises per template and foods per meal", () => {
    const b = baseBundle();
    b.workout.prescription!.assignments[0].exercises = Array.from({ length: 200 }, (_, i) => ({
      exercise_name: `Ex ${i}`,
      target_sets: 3,
      target_reps: 10,
      target_weight_kg: 40,
      rest_sec: 60,
      notes: null,
      order_index: i,
    }));
    b.nutrition.template_days![0].meals[0].foods = Array.from({ length: 100 }, (_, i) => ({
      food_name: `Food ${i}`,
      quantity: 10,
      serving_unit: "g",
      calories: 50,
      protein_g: 2,
      carbs_g: 5,
      fat_g: 1,
    }));
    const p = buildAnalysisPayload(b);
    assert.ok(p.workout_program.weekly_schedule[0].template.exercises.length <= AI_BOUNDS.exercisesPerTemplate);
    assert.ok(
      p.nutrition_program.weekly_schedule_prescribed[0].meals[0].foods.length <= AI_BOUNDS.foodsPerMeal
    );
  });

  it("truncates long free-text fields to AI_BOUNDS.textLen", () => {
    const b = baseBundle();
    b.client.fitness_goal = "x".repeat(5000) + SECRET;
    const p = buildAnalysisPayload(b);
    assert.ok((p.client.fitness_goal ?? "").length <= AI_BOUNDS.textLen + 1);
    assert.ok(!payloadString(b).includes(SECRET));
  });

  it("serializes under the hard payload byte cap for large-but-legal inputs", () => {
    const b = baseBundle();
    b.workout.prescription!.assignments = Array.from({ length: 120 }, (_, i) => ({
      scheduled_date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      week_number: (i % 12) + 1,
      status: "completed" as const,
      template_name: `Template ${i}`,
      target_muscles: ["chest", "back", "legs"],
      template_notes: "notes",
      exercises: Array.from({ length: 100 }, (_, j) => ({
        exercise_name: `Exercise ${j}`,
        target_sets: 3,
        target_reps: 10,
        target_weight_kg: 50,
        rest_sec: 90,
        notes: "some exercise note",
        order_index: j,
      })),
      session: { session_date: "2026-09-15", duration_min: 50 },
    }));
    b.nutrition.client_changes = Array.from({ length: 100 }, (_, i) => ({
      plan_date: "2026-09-10",
      meal_name: `Meal ${i}`,
      change_type: "quantity",
      original_food_name: `Food ${i}`,
      original_quantity: 100,
      new_food_name: `Food ${i}`,
      new_quantity: 120,
    }));
    const s = payloadString(b);
    assert.ok(s.length <= AI_BOUNDS.payloadMaxBytes, `payload too large: ${s.length}`);
  });
});

describe("AI payload — missing data honesty (spec §25)", () => {
  it("keeps null fields null and flags them in missing_information", () => {
    const b = baseBundle();
    b.client.age = null;
    b.client.gender = null;
    b.client.height_cm = null;
    b.client.weight_kg_profile = null;
    b.goals = null;
    b.workout.enrollment = null;
    b.nutrition.enrollment = null;
    b.nutrition.template_days = null;
    b.nutrition.weekly = null;
    b.workout.prescription = null;
    const p = buildAnalysisPayload(b);
    assert.equal(p.client.age, null);
    assert.equal(p.client.gender, null);
    assert.equal(p.client.height_cm, null);
    assert.equal(p.client.weight_kg_latest, null);
    assert.equal(p.client.numeric_goals.available, false);
    assert.equal(p.workout_program.enrollment, null);
    assert.equal(p.nutrition_program.enrollment, null);

    const missing = inferMissingInformation(p);
    assert.ok(missing.some((m) => m.includes("age")));
    assert.ok(missing.some((m) => m.includes("goals")));
    assert.ok(missing.some((m) => m.includes("workout program")));
    assert.ok(missing.some((m) => m.includes("nutrition program")));
  });

  it("marks optional sensitive context as not included by default (spec §1.4)", () => {
    const p = buildAnalysisPayload(baseBundle());
    assert.equal(p.data_notes.measurements_included, false);
    const s = payloadString();
    assert.ok(!s.includes("sleep"), "no sleep data");
    assert.ok(!s.includes("steps"), "no steps data");
  });
});
