import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyTemplateName, parseTemplatePayload } from "../src/lib/workout-input.ts";

const validExercise = {
  exercise_name: "Bench Press",
  target_sets: 4,
  target_reps: 8,
  target_weight_kg: 60,
  rest_sec: 90,
  notes: "",
};

const validBody = () => ({
  name: "Push Day",
  target_muscles: ["chest"],
  notes: "",
  exercises: [{ ...validExercise }],
});

describe("parseTemplatePayload W2 caps", () => {
  it("accepts a valid template", () => {
    const r = parseTemplatePayload(validBody());
    assert.equal(r.ok, true);
  });

  it("rejects names over 200 chars", () => {
    const b = validBody();
    b.name = "x".repeat(201);
    const r = parseTemplatePayload(b);
    assert.equal(r.ok, false);
  });

  it("rejects notes over 2000 chars", () => {
    const b = validBody();
    b.notes = "x".repeat(2001);
    const r = parseTemplatePayload(b);
    assert.equal(r.ok, false);
  });

  it("rejects more than 100 exercises", () => {
    const b = validBody();
    b.exercises = Array.from({ length: 101 }, (_, i) => ({ ...validExercise, exercise_name: `Ex ${i}` }));
    const r = parseTemplatePayload(b);
    assert.equal(r.ok, false);
  });

  it("rejects target_sets outside 1..100", () => {
    for (const sets of [0, -1, 101, 1000]) {
      const b = validBody();
      b.exercises = [{ ...validExercise, target_sets: sets }];
      assert.equal(parseTemplatePayload(b).ok, false, `sets=${sets}`);
    }
  });

  it("rejects negative or huge weights", () => {
    for (const w of [-1, 5001]) {
      const b = validBody();
      b.exercises = [{ ...validExercise, target_weight_kg: w }];
      assert.equal(parseTemplatePayload(b).ok, false, `weight=${w}`);
    }
  });

  it("rejects out-of-range reps/rest", () => {
    const b = validBody();
    b.exercises = [{ ...validExercise, target_reps: 10001 }];
    assert.equal(parseTemplatePayload(b).ok, false);
    const b2 = validBody();
    b2.exercises = [{ ...validExercise, rest_sec: 86401 }];
    assert.equal(parseTemplatePayload(b2).ok, false);
  });

  it("trims muscles to 20 and names to valid input", () => {
    const b = validBody();
    b.target_muscles = Array.from({ length: 30 }, (_, i) => `m${i}`);
    const r = parseTemplatePayload(b);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.target_muscles.length, 20);
  });

  it("still rejects empty names and empty exercise lists", () => {
    assert.equal(parseTemplatePayload({ ...validBody(), name: "  " }).ok, false);
    assert.equal(parseTemplatePayload({ ...validBody(), exercises: [] }).ok, false);
  });
});

// F-17: duplicate names must respect the same 200-char cap create/update
// enforce, so a copy is never saved in a state its own editor rejects.
describe("copyTemplateName", () => {
  it("appends ' (Copy)' to normal names", () => {
    assert.equal(copyTemplateName("Push Day"), "Push Day (Copy)");
  });

  it("trims the base before appending", () => {
    assert.equal(copyTemplateName("  Full Body  "), "Full Body (Copy)");
  });

  it("stays within the 200-char cap when the base name is at the cap", () => {
    const atCap = "A".repeat(200);
    const copy = copyTemplateName(atCap);
    assert.ok(copy.length <= 200, `copy length ${copy.length} exceeds cap`);
    assert.ok(copy.endsWith(" (Copy)"));
    assert.equal(copy, `${"A".repeat(193)} (Copy)`);
  });

  it("keeps the result parseable by parseTemplatePayload", () => {
    const atCap = "B".repeat(200);
    const r = parseTemplatePayload({
      name: copyTemplateName(atCap),
      exercises: [{ ...validExercise }],
    });
    assert.equal(r.ok, true, "a 200-char copy name must pass create/update validation");
  });

  it("handles empty bases and pathological caps without throwing", () => {
    assert.equal(copyTemplateName("", 200), " (Copy)");
    const tiny = copyTemplateName("Any", 6); // suffix >= cap → hard slice
    assert.ok(tiny.length <= 6, `length ${tiny.length} exceeds custom cap`);
  });
});
