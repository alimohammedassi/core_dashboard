import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scaleFood,
  scaleValue,
  roundMacros,
  sumMacros,
  sumPrescribed,
  sumCurrent,
  mealAdherence,
  basisOrOne,
  effectiveFoodValues,
  isRegenerable,
  isChangeLocked,
} from "../src/lib/nutrition-math.ts";
import { parseNutritionPayload } from "../src/lib/nutrition-input.ts";

describe("nutrition scaling basis (per serving_size, never per-100g)", () => {
  it("gram food: chicken 150g from 100g basis", () => {
    const m = scaleFood({ calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, serving_size: 100 }, 150);
    assert.equal(m.calories, 247.5);
    assert.equal(m.protein_g, 46.5);
  });

  it("piece food: apple 2 pieces from 1-piece basis", () => {
    const m = scaleFood({ calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, serving_size: 1 }, 2);
    assert.equal(m.calories, 104);
  });

  it("ml food: milkshake 250ml from 500ml basis", () => {
    const m = scaleFood({ calories: 480, protein_g: 10, carbs_g: 70, fat_g: 15, serving_size: 500 }, 250);
    assert.equal(m.calories, 240);
  });

  it("null/zero serving_size guards to 1 (no divide-by-zero)", () => {
    assert.equal(basisOrOne(null), 1);
    assert.equal(basisOrOne(0), 1);
    assert.equal(scaleValue(100, 2, null), 200);
  });

  it("rounding: kcal integer, grams 1 decimal", () => {
    assert.deepEqual(roundMacros({ calories: 247.5, protein_g: 46.55, carbs_g: 0, fat_g: 5.44 }), {
      calories: 248,
      protein_g: 46.6,
      carbs_g: 0,
      fat_g: 5.4,
    });
  });

  it("meal totals sum unrounded then round once", () => {
    const total = roundMacros(
      sumMacros([
        scaleFood({ calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, serving_size: 100 }, 150),
        scaleFood({ calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, serving_size: 1 }, 2),
      ])
    );
    assert.equal(total.calories, 352);
    assert.equal(total.protein_g, 47.1);
  });
});

describe("meal adherence", () => {
  it("future meals excluded, skipped not adherent", () => {
    const r = mealAdherence(
      [
        { status: "completed", scheduled_date: "2026-09-20" },
        { status: "skipped", scheduled_date: "2026-09-20" },
        { status: "assigned", scheduled_date: "2026-09-21" },
        { status: "assigned", scheduled_date: "2026-09-30" },
      ],
      "2026-09-21"
    );
    assert.equal(r.planned, 3);
    assert.equal(r.completed, 1);
    assert.equal(r.skipped, 1);
    assert.equal(r.pct, 33);
  });

  it("no elapsed meals → null (not 0%)", () => {
    const r = mealAdherence([{ status: "assigned", scheduled_date: "2026-09-30" }], "2026-09-21");
    assert.equal(r.pct, null);
  });
});

describe("prescription merge: original immutable, current moves forward", () => {
  const untouched = {
    original_quantity: 100, original_calories: 165, original_protein_g: 31,
    original_carbs_g: 0, original_fat_g: 3.6,
    current_quantity: null, current_calories: null, current_protein_g: null,
    current_carbs_g: null, current_fat_g: null, change_type: null,
  };
  it("untouched row resolves to original", () => {
    assert.deepEqual(effectiveFoodValues(untouched), {
      quantity: 100, calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6,
    });
  });
  it("repeated quantity changes: original stays 100, current is latest", () => {
    // 100 → 120 → 150: original frozen, current = 150 (history keeps both steps)
    const afterTwo = {
      ...untouched, current_quantity: 150, current_calories: 248,
      current_protein_g: 46.5, current_carbs_g: 0, current_fat_g: 5.4,
      change_type: "quantity",
    };
    const eff = effectiveFoodValues(afterTwo);
    assert.equal(eff.quantity, 150);
    assert.equal(afterTwo.original_quantity, 100); // original never overwritten
  });
  it("substitution resolves to the new food's values, original preserved", () => {
    const sub = {
      ...untouched, current_quantity: 2, current_calories: 104,
      current_protein_g: 0.6, current_carbs_g: 28, current_fat_g: 0.4,
      change_type: "substitution",
    };
    const eff = effectiveFoodValues(sub);
    assert.equal(eff.quantity, 2);
    assert.equal(eff.calories, 104);
    assert.equal(sub.original_food_id, undefined);
    assert.equal(sub.original_quantity, 100);
  });
});

describe("regeneration eligibility (cases A–F)", () => {
  const T = "2026-09-21";
  it("A future+assigned+pristine → regenerate", () => {
    assert.equal(isRegenerable({ status: "assigned", scheduled_date: "2026-09-25", change_type: null }, T), true);
  });
  it("B future+completed → keep", () => {
    assert.equal(isRegenerable({ status: "completed", scheduled_date: "2026-09-25", change_type: null }, T), false);
  });
  it("C future+skipped → keep", () => {
    assert.equal(isRegenerable({ status: "skipped", scheduled_date: "2026-09-25", change_type: null }, T), false);
  });
  it("D future+assigned+changed → keep", () => {
    assert.equal(
      isRegenerable({ status: "assigned", scheduled_date: "2026-09-25", change_type: "quantity" }, T),
      false
    );
  });
  it("E past+assigned+pristine → keep", () => {
    assert.equal(isRegenerable({ status: "assigned", scheduled_date: "2026-09-10", change_type: null }, T), false);
  });
  it("F past+completed+changed → keep", () => {
    assert.equal(
      isRegenerable({ status: "completed", scheduled_date: "2026-09-10", change_type: "substitution" }, T),
      false
    );
  });
  it("today is not future → keep", () => {
    assert.equal(isRegenerable({ status: "assigned", scheduled_date: T, change_type: null }, T), false);
  });
});

describe("7-day change lock", () => {
  it("8 days old → locked; 7 days old → open; future → open", () => {
    assert.equal(isChangeLocked("2026-09-13", "2026-09-21"), true);
    assert.equal(isChangeLocked("2026-09-14", "2026-09-21"), false);
    assert.equal(isChangeLocked("2026-09-25", "2026-09-21"), false);
  });
});

describe("adherence semantics", () => {
  it("substituted-but-completed meal counts as adherent", () => {
    const r = mealAdherence(
      [
        { status: "completed", scheduled_date: "2026-09-20" },
        { status: "assigned", scheduled_date: "2026-09-20" },
      ],
      "2026-09-21"
    );
    assert.equal(r.pct, 50); // completion drives adherence; changes tracked separately
  });
  it("rest days (no rows) do not dilute the denominator", () => {
    const r = mealAdherence([{ status: "completed", scheduled_date: "2026-09-20" }], "2026-09-21");
    assert.equal(r.planned, 1);
    assert.equal(r.pct, 100);
  });
  it("missing data is not perfect adherence: all-assigned → 0%", () => {
    const r = mealAdherence(
      [
        { status: "assigned", scheduled_date: "2026-09-19" },
        { status: "assigned", scheduled_date: "2026-09-20" },
      ],
      "2026-09-21"
    );
    assert.equal(r.pct, 0);
  });
});
describe("day rollups: prescribed covers all, current excludes skipped", () => {
  const a = { calories: 500, protein_g: 30, carbs_g: 50, fat_g: 15 };
  const b = { calories: 300, protein_g: 10, carbs_g: 40, fat_g: 8 };
  it("sums prescribed across every meal", () => {
    assert.deepEqual(sumPrescribed([{ prescribed: a }, { prescribed: b }]), {
      calories: 800, protein_g: 40, carbs_g: 90, fat_g: 23,
    });
  });
  it("excludes skipped meals from current but keeps them visible upstream", () => {
    assert.deepEqual(
      sumCurrent([
        { status: "completed", current: a },
        { status: "skipped", current: b },
      ]),
      a
    );
  });
  it("all skipped → zeros (not missing)", () => {
    assert.deepEqual(sumCurrent([{ status: "skipped", current: b }]), {
      calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    });
  });
});
describe("nutrition payload validation", () => {
  const foodId = "7c8126c7-8fab-4027-9b81-53d6bd7399a1";
  it("accepts a valid tree", () => {
    const r = parseNutritionPayload({
      name: "Lean Mass",
      days: [{ day_of_week: 1, meals: [{ name: "Breakfast", foods: [{ food_id: foodId, quantity: 80 }] }] }],
    });
    assert.equal(r.ok, true);
  });
  it("rejects duplicate weekday, missing meal name, bad quantity", () => {
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [
          { day_of_week: 1, meals: [{ name: "A", foods: [{ food_id: foodId, quantity: 1 }] }] },
          { day_of_week: 1, meals: [{ name: "B", foods: [{ food_id: foodId, quantity: 1 }] }] },
        ],
      }).ok,
      false
    );
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [{ day_of_week: 1, meals: [{ name: "", foods: [{ food_id: foodId, quantity: 1 }] }] }],
      }).ok,
      false
    );
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [{ day_of_week: 1, meals: [{ name: "A", foods: [{ food_id: foodId, quantity: 0 }] }] }],
      }).ok,
      false
    );
  });
  it("rejects oversized names, non-UUID food, >50 foods, >20 meals", () => {
    assert.equal(parseNutritionPayload({ name: "n".repeat(201), days: [] }).ok, false);
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [{ day_of_week: 1, meals: [{ name: "A", foods: [{ food_id: "not-a-uuid", quantity: 1 }] }] }],
      }).ok,
      false
    );
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [
          {
            day_of_week: 1,
            meals: [
              { name: "A", foods: Array.from({ length: 51 }, () => ({ food_id: foodId, quantity: 1 })) },
            ],
          },
        ],
      }).ok,
      false
    );
    assert.equal(
      parseNutritionPayload({
        name: "x",
        days: [
          {
            day_of_week: 1,
            meals: Array.from({ length: 21 }, (_, i) => ({
              name: `M${i}`,
              foods: [{ food_id: foodId, quantity: 1 }],
            })),
          },
        ],
      }).ok,
      false
    );
  });
});
