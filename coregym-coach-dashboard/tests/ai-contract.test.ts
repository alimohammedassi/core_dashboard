import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAnalysisResult, DISCLAIMER_TEXT } from "../src/lib/ai/contract.ts";

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
