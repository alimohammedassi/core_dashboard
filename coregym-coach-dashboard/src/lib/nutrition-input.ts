// Shared validation for nutrition program create/update payloads.
// Kept framework-free so API routes reuse it (same pattern as workout-input.ts).

export type ParsedProgramFood = {
  food_id: string;
  quantity: number;
};

export type ParsedProgramMeal = {
  name: string;
  foods: ParsedProgramFood[];
};

export type ParsedProgramDay = {
  day_of_week: number;
  notes: string | null;
  meals: ParsedProgramMeal[];
};

export type ParsedNutritionProgram = {
  name: string;
  description: string | null;
  days: ParsedProgramDay[];
};

export type ParseResult =
  | { ok: true; data: ParsedNutritionProgram }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseNutritionPayload(body: unknown): ParseResult {
  if (body == null || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  if (!name) return { ok: false, error: "Program name is required" };
  if (name.length > 200) return { ok: false, error: "Program name must be 200 characters or fewer" };

  const description =
    b.description == null || String(b.description).trim() === "" ? null : String(b.description).trim();
  if (description != null && description.length > 2000) {
    return { ok: false, error: "Description must be 2000 characters or fewer" };
  }

  if (!Array.isArray(b.days) || b.days.length === 0) {
    return { ok: false, error: "At least one day must have meals" };
  }

  const seen = new Set<number>();
  const days: ParsedProgramDay[] = [];
  for (const [di, rawDay] of (b.days as unknown[]).entries()) {
    if (rawDay == null || typeof rawDay !== "object") {
      return { ok: false, error: `Day ${di + 1} is invalid` };
    }
    const d = rawDay as Record<string, unknown>;
    const dayOfWeek = Number(d.day_of_week);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return { ok: false, error: `Day ${di + 1}: weekday must be Monday (1) .. Sunday (7)` };
    }
    if (seen.has(dayOfWeek)) return { ok: false, error: "Each weekday can only appear once" };
    seen.add(dayOfWeek);

    if (!Array.isArray(d.meals) || d.meals.length === 0) {
      return { ok: false, error: `Day ${di + 1}: add at least one meal` };
    }
    if (d.meals.length > 20) {
      return { ok: false, error: `Day ${di + 1}: at most 20 meals` };
    }

    const meals: ParsedProgramMeal[] = [];
    for (const [mi, rawMeal] of (d.meals as unknown[]).entries()) {
      if (rawMeal == null || typeof rawMeal !== "object") {
        return { ok: false, error: `Day ${di + 1}, meal ${mi + 1} is invalid` };
      }
      const m = rawMeal as Record<string, unknown>;
      const mealName = String(m.name ?? "").trim();
      if (!mealName) return { ok: false, error: `Day ${di + 1}, meal ${mi + 1}: name is required` };
      if (mealName.length > 120) {
        return { ok: false, error: `Day ${di + 1}, meal ${mi + 1}: name must be 120 characters or fewer` };
      }
      if ((m.foods as unknown[]).length > 50) {
        return { ok: false, error: `Meal “${mealName}”: at most 50 foods` };
      }

      if (!Array.isArray(m.foods) || m.foods.length === 0) {
        return { ok: false, error: `Meal “${mealName}”: add at least one food` };
      }

      const foods: ParsedProgramFood[] = [];
      for (const [fi, rawFood] of (m.foods as unknown[]).entries()) {
        if (rawFood == null || typeof rawFood !== "object") {
          return { ok: false, error: `Meal “${mealName}”, food ${fi + 1} is invalid` };
        }
        const f = rawFood as Record<string, unknown>;
        const foodId = String(f.food_id ?? "");
        if (!UUID_RE.test(foodId)) {
          return { ok: false, error: `Meal “${mealName}”, food ${fi + 1}: select a food from the library` };
        }
        const qty = Number(f.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          return { ok: false, error: `Meal “${mealName}”, food ${fi + 1}: quantity must be greater than 0` };
        }
        foods.push({ food_id: foodId, quantity: qty });
      }
      meals.push({ name: mealName, foods });
    }

    days.push({
      day_of_week: dayOfWeek,
      notes: d.notes == null || String(d.notes).trim() === "" ? null : String(d.notes).trim(),
      meals,
    });
  }

  return { ok: true, data: { name, description, days } };
}
