import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAnalysisResult, validateProgramProposal, DISCLAIMER_TEXT } from "../src/lib/ai/contract.ts";

// Contract tests (spec §16, §17, §26): valid responses pass; malformed,
// incomplete, over-specified and mis-typed responses fail. No framework, no
// network — mirrors tests/ownership.test.ts conventions.

function validResult(): Record<string, unknown> {
  return {
    overall_assessment: "The program is broadly consistent. Adherence is solid. Volume is stable.",
    workout_analysis: {
      summary: "Three training days per week with balanced push/pull/legs coverage.",
      observations: ["Weekly volume is stable across the window."],
      potential_weaknesses: ["No dedicated hamstring exercise."],
      adjustment_ideas: ["Consider adding a hinge movement."],
    },
    nutrition_analysis: {
      summary: "Prescribed plan averages about 1,800 kcal per day across the week.",
      observations: ["Protein is distributed across four meals."],
      potential_weaknesses: ["Limited vegetable variety."],
      adjustment_ideas: ["Add a leafy-green side to lunch."],
    },
    cross_program_analysis: {
      summary: "Training frequency and meal schedule align on training days.",
      conflicts: [],
    },
    strengths: ["Consistent completion in recent weeks."],
    issues: [
      {
        title: "Volume plateau",
        detail: "Weekly volume has not increased over the window.",
        evidence: "workout_program.weekly_volume_kg shows flat totals for the last four weeks.",
      },
    ],
    improvements: [
      { title: "Add hinge movement", detail: "Balances posterior chain volume.", target: "workout" },
    ],
    missing_information: ["No injury or limitation information is available."],
    coach_action_items: [
      { action: "Review hamstring exercise selection.", priority: "medium" },
    ],
    program_proposal: { workout: null, nutrition: null },
    disclaimer: DISCLAIMER_TEXT,
  };
}

describe("AI response contract — valid input", () => {
  it("accepts a fully valid response", () => {
    const r = validateAnalysisResult(validResult());
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  it("accepts empty arrays where lists may be empty", () => {
    const v = validResult();
    v.issues = [];
    v.improvements = [];
    v.coach_action_items = [];
    v.strengths = [];
    const r = validateAnalysisResult(v);
    assert.ok(r.ok, r.ok ? "" : r.error);
  });
});

describe("AI response contract — structure failures", () => {
  it("rejects non-object input", () => {
    assert.equal(validateAnalysisResult("nope").ok, false);
    assert.equal(validateAnalysisResult(null).ok, false);
    assert.equal(validateAnalysisResult([1]).ok, false);
  });

  it("rejects missing required sections", () => {
    for (const key of [
      "overall_assessment",
      "workout_analysis",
      "nutrition_analysis",
      "cross_program_analysis",
      "strengths",
      "issues",
      "improvements",
      "missing_information",
      "coach_action_items",
      "disclaimer",
    ]) {
      const v = validResult();
      delete v[key];
      const r = validateAnalysisResult(v);
      assert.equal(r.ok, false, `expected failure when ${key} is missing`);
    }
  });

  it("rejects unexpected extra fields (no scores, no arbitrary keys)", () => {
    const v = validResult();
    v.suitability_score = 82; // the classic forbidden score
    assert.equal(validateAnalysisResult(v).ok, false);
    const v2 = validResult();
    v2.random_extra = "hello";
    assert.equal(validateAnalysisResult(v2).ok, false);
  });

  it("rejects a percentage-style field anywhere in the object graph", () => {
    const v = validResult();
    (v.workout_analysis as Record<string, unknown>).score = 0.82;
    assert.equal(validateAnalysisResult(v).ok, false);
  });
});

describe("AI response contract — field rules", () => {
  it("rejects overall_assessment longer than 3 sentences", () => {
    const v = validResult();
    v.overall_assessment = "One. Two. Three. Four.";
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("accepts overall_assessment up to exactly 3 sentences", () => {
    const v = validResult();
    v.overall_assessment = "One. Two. Three.";
    assert.equal(validateAnalysisResult(v).ok, true);
  });

  it("rejects issues without evidence (every issue must cite payload evidence)", () => {
    const v = validResult();
    (v.issues as { title: string; detail: string; evidence: string }[])[0].evidence = "";
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("rejects invalid improvement targets", () => {
    const v = validResult();
    (v.improvements as { target: string }[])[0].target = "medical";
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("rejects invalid action-item priorities", () => {
    const v = validResult();
    (v.coach_action_items as { priority: string }[])[0].priority = "urgent";
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("rejects a modified disclaimer", () => {
    const v = validResult();
    v.disclaimer = "Trust me, I am a doctor.";
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("rejects non-string members in string arrays", () => {
    const v = validResult();
    (v.strengths as unknown[]).push(42);
    assert.equal(validateAnalysisResult(v).ok, false);
  });

  it("rejects extra keys inside analysis sections", () => {
    const v = validResult();
    (v.workout_analysis as Record<string, unknown>).extra = true;
    assert.equal(validateAnalysisResult(v).ok, false);
  });
});

// ── program_proposal (coach-actionable extension) ─────────────────────────────

function validWorkoutProposal(): Record<string, unknown> {
  return {
    name: "AI Upper/Lower",
    description: "Two upper and two lower days.",
    rationale: "Matches the client's 4-day availability and current strength levels.",
    days: [
      {
        day_of_week: 1,
        focus: "Upper",
        notes: "Tempo work",
        exercises: [{ name: "Bench Press", sets: 4, reps: 8, weight_kg: 60, rest_sec: 120, notes: null }],
      },
      {
        day_of_week: 3,
        focus: null,
        notes: null,
        exercises: [{ name: "Squat", sets: 5, reps: 5, weight_kg: 100, rest_sec: 180, notes: null }],
      },
    ],
  };
}

function validNutritionProposal(): Record<string, unknown> {
  return {
    name: "AI Maintenance Week",
    description: null,
    rationale: "Aligns prescribed calories with the recorded training demand.",
    days: [
      {
        day_of_week: 1,
        notes: null,
        meals: [
          {
            name: "Breakfast",
            foods: [
              { name: "Oats", quantity: 80, serving_unit: "g", calories: 300, protein_g: 10, carbs_g: 50, fat_g: 6 },
            ],
          },
        ],
      },
    ],
  };
}

describe("AI contract — program_proposal structure", () => {
  it("accepts both proposals as null (insufficient data is a valid outcome)", () => {
    const r = validateAnalysisResult(validResult());
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  it("accepts a complete workout proposal and a complete nutrition proposal", () => {
    const v = validResult();
    v.program_proposal = { workout: validWorkoutProposal(), nutrition: validNutritionProposal() };
    const r = validateAnalysisResult(v);
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  it("accepts each half independently null", () => {
    const v = validResult();
    v.program_proposal = { workout: validWorkoutProposal(), nutrition: null };
    assert.ok(validateAnalysisResult(v).ok);
    const v2 = validResult();
    v2.program_proposal = { workout: null, nutrition: validNutritionProposal() };
    assert.ok(validateAnalysisResult(v2).ok);
  });

  it("rejects a missing or malformed program_proposal key", () => {
    const v = validResult();
    delete v.program_proposal;
    assert.equal(validateAnalysisResult(v).ok, false);
    const v2 = validResult();
    v2.program_proposal = "nope";
    assert.equal(validateAnalysisResult(v2).ok, false);
  });

  it("rejects unexpected keys inside program_proposal", () => {
    const v = validResult();
    v.program_proposal = { workout: null, nutrition: null, score: 90 };
    assert.equal(validateAnalysisResult(v).ok, false);
  });
});

describe("AI contract — workout proposal validation (fail closed)", () => {
  it("accepts a valid workout proposal via the exported validator", () => {
    const r = validateProgramProposal({ workout: validWorkoutProposal(), nutrition: null });
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  it("rejects duplicate weekdays and weekdays outside 1–7", () => {
    const dup = validWorkoutProposal();
    (dup.days as Record<string, unknown>[])[1].day_of_week = 1;
    assert.equal(validateProgramProposal({ workout: dup, nutrition: null }).ok, false);

    for (const bad of [0, 8, 1.5, "Monday"]) {
      const v = validWorkoutProposal();
      (v.days as Record<string, unknown>[])[0].day_of_week = bad;
      assert.equal(validateProgramProposal({ workout: v, nutrition: null }).ok, false, `day_of_week=${bad}`);
    }
  });

  it("rejects more than 7 days and empty exercise lists", () => {
    const many = validWorkoutProposal();
    const day = (dow: number) => ({
      day_of_week: dow,
      focus: null,
      notes: null,
      exercises: [{ name: "X", sets: 3, reps: 10, weight_kg: null, rest_sec: null, notes: null }],
    });
    // 8 entries — the count cap fires before the (necessarily present) duplicate.
    many.days = [1, 2, 3, 4, 5, 6, 7, 1].map((dow) => day(dow));
    assert.equal(validateProgramProposal({ workout: many, nutrition: null }).ok, false);

    const noEx = validWorkoutProposal();
    (noEx.days as Record<string, unknown>[])[0].exercises = [];
    assert.equal(validateProgramProposal({ workout: noEx, nutrition: null }).ok, false);
  });

  it("rejects sets outside 1–20 and non-integer sets", () => {
    for (const bad of [0, 21, 2.5, "4"]) {
      const v = validWorkoutProposal();
      ((v.days as Record<string, unknown>[])[0].exercises as Record<string, unknown>[])[0].sets = bad;
      assert.equal(validateProgramProposal({ workout: v, nutrition: null }).ok, false, `sets=${bad}`);
    }
  });

  it("rejects reps/weight/rest outside the existing schema bounds", () => {
    const cases: Record<string, unknown>[] = [
      { field: "reps", value: 0 },
      { field: "reps", value: 10001 },
      { field: "weight_kg", value: -1 },
      { field: "weight_kg", value: 5001 },
      { field: "rest_sec", value: -5 },
      { field: "rest_sec", value: 86401 },
    ];
    for (const c of cases) {
      const v = validWorkoutProposal();
      ((v.days as Record<string, unknown>[])[0].exercises as Record<string, unknown>[])[0][c.field as string] = c.value;
      assert.equal(validateProgramProposal({ workout: v, nutrition: null }).ok, false, `${c.field}=${c.value}`);
    }
  });

  it("rejects oversized names and missing rationale", () => {
    const bigName = validWorkoutProposal();
    bigName.name = "x".repeat(201);
    assert.equal(validateProgramProposal({ workout: bigName, nutrition: null }).ok, false);

    const bigRationale = validWorkoutProposal();
    bigRationale.rationale = "y".repeat(501);
    assert.equal(validateProgramProposal({ workout: bigRationale, nutrition: null }).ok, false);

    const noRationale = validWorkoutProposal();
    delete noRationale.rationale;
    assert.equal(validateProgramProposal({ workout: noRationale, nutrition: null }).ok, false);
  });

  it("accepts null optional fields and normalizes empty strings to null", () => {
    const v = validWorkoutProposal();
    const ex = ((v.days as Record<string, unknown>[])[0].exercises as Record<string, unknown>[])[0];
    ex.reps = null;
    ex.weight_kg = null;
    ex.rest_sec = null;
    ex.notes = "";
    const r = validateProgramProposal({ workout: v, nutrition: null });
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (r.ok) {
      assert.equal(r.value.workout?.days[0].exercises[0].notes, null);
    }
  });

  it("rejects a non-numeric type smuggled into a numeric field", () => {
    const v = validWorkoutProposal();
    const ex = ((v.days as Record<string, unknown>[])[0].exercises as Record<string, unknown>[])[0];
    ex.weight_kg = "60";
    assert.equal(validateProgramProposal({ workout: v, nutrition: null }).ok, false);
  });
});

describe("AI contract — nutrition proposal validation (fail closed)", () => {
  it("accepts a valid nutrition proposal", () => {
    const r = validateProgramProposal({ workout: null, nutrition: validNutritionProposal() });
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  it("rejects duplicate weekdays and out-of-range weekdays", () => {
    const dup = validNutritionProposal();
    dup.days = [
      (dup.days as Record<string, unknown>[])[0],
      { ...(dup.days as Record<string, unknown>[])[0], day_of_week: 1 },
    ];
    assert.equal(validateProgramProposal({ workout: null, nutrition: dup }).ok, false);

    const bad = validNutritionProposal();
    (bad.days as Record<string, unknown>[])[0].day_of_week = 0;
    assert.equal(validateProgramProposal({ workout: null, nutrition: bad }).ok, false);
  });

  it("rejects more than 20 meals per day and more than 50 foods per meal", () => {
    const meals = validNutritionProposal();
    meals.days = [
      {
        day_of_week: 1,
        notes: null,
        meals: Array.from({ length: 21 }, (_, i) => ({
          name: `Meal ${i}`,
          foods: [{ name: "Oats", quantity: 80, serving_unit: "g", calories: 300, protein_g: 10, carbs_g: 50, fat_g: 6 }],
        })),
      },
    ];
    assert.equal(validateProgramProposal({ workout: null, nutrition: meals }).ok, false);

    const foods = validNutritionProposal();
    (foods.days as Record<string, unknown>[])[0].meals = [
      {
        name: "Breakfast",
        foods: Array.from({ length: 51 }, () => ({
          name: "Oats",
          quantity: 80,
          serving_unit: "g",
          calories: 300,
          protein_g: 10,
          carbs_g: 50,
          fat_g: 6,
        })),
      },
    ];
    assert.equal(validateProgramProposal({ workout: null, nutrition: foods }).ok, false);
  });

  it("rejects quantities ≤ 0 and negative macros", () => {
    const qty = validNutritionProposal();
    (((qty.days as Record<string, unknown>[])[0].meals as Record<string, unknown>[])[0].foods as Record<string, unknown>[])[0].quantity = 0;
    assert.equal(validateProgramProposal({ workout: null, nutrition: qty }).ok, false);

    const macro = validNutritionProposal();
    (((macro.days as Record<string, unknown>[])[0].meals as Record<string, unknown>[])[0].foods as Record<string, unknown>[])[0].protein_g = -1;
    assert.equal(validateProgramProposal({ workout: null, nutrition: macro }).ok, false);
  });

  it("rejects oversized food names and malformed food entries", () => {
    const name = validNutritionProposal();
    (((name.days as Record<string, unknown>[])[0].meals as Record<string, unknown>[])[0].foods as Record<string, unknown>[])[0].name = "z".repeat(201);
    assert.equal(validateProgramProposal({ workout: null, nutrition: name }).ok, false);

    const shape = validNutritionProposal();
    (((shape.days as Record<string, unknown>[])[0].meals as Record<string, unknown>[])[0].foods as Record<string, unknown>[])[0].extra = true;
    assert.equal(validateProgramProposal({ workout: null, nutrition: shape }).ok, false);
  });
});
