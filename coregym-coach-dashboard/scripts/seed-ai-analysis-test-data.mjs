// ============================================================================
// CoreGym — AI Analysis test-data seeder  (scripts/seed-ai-analysis-test-data.mjs)
//
// PURPOSE
//   Populates ONE coach account (default: coachmohammed@gmail.com) with clearly
//   tagged synthetic clients + programs + 4-5 weeks of history so the dashboard
//   and the AI Analysis feature can be inspected against realistic data.
//
// SAFETY / CREDENTIALS
//   * No passwords, tokens or keys are printed, hardcoded or committed.
//     The service-role key is read from .env.local at runtime, never logged.
//   * The coach is resolved with the app's own flow (profiles.email →
//     coaches.user_id → coaches.id = resolveCoachId). Seeding aborts unless the
//     coach row exists and is active.
//   * NOTHING is deleted except previously seeded, tagged rows (idempotent
//     re-runs). Pre-existing clients/programs are never touched.
//   * Client programs/enrollments are created through the app's own atomic RPCs
//     (create_workout_template_atomic, upsert_coach_program_atomic,
//     create_program_enrollment_atomic, upsert_nutrition_program_atomic,
//     create_nutrition_enrollment_atomic) so seeded structures are exactly
//     what the dashboard itself would create. History (statuses, sessions,
//     sets, summaries, measurements) is patched afterwards.
//
// TAGS (all seeded rows are identifiable and removable)
//   * clients:  ai.test.client.NN@coregym.test  (profiles name "AI Test Client NN")
//   * plans/templates/programs: names starting "[AI]"
//
// ROLLBACK
//   Re-run this script to refresh the tagged set, or remove it by deleting the
//   tagged rows (the wipe phase at the top does exactly that, FK-safe).
//
// USAGE
//   node scripts/seed-ai-analysis-test-data.mjs          # seed/refresh
//   node scripts/seed-ai-analysis-test-data.mjs --dry-run # verify food picks only
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COACH_EMAIL = process.env.SEED_COACH_EMAIL || "coachmohammed@gmail.com";
const CLIENT_TAG_DOMAIN = "coregym.test";
const log = (step, msg) => console.log(`[seed-ai] ${step}: ${msg}`);
const fail = (step, msg) => {
  console.error(`[seed-ai] FATAL ${step}: ${msg}`);
  process.exit(1);
};

// ── Deterministic PRNG (mulberry32) + date helpers ───────────────────────────
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rng = mulberry32(20261003);
const range = (min, max) => min + Math.floor(rng() * (max - min + 1));
const pickOne = (arr) => arr[Math.floor(rng() * arr.length)];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const todayStr = iso(new Date());
// Monday of the week containing a date string (UTC ISO week).
const mondayOf = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return iso(d);
};
const thisMonday = mondayOf(todayStr); // current week's Monday
const W5_MONDAY = addDays(thisMonday, -35); // ~5 weeks ago → 5 elapsed weeks
const W4_MONDAY = addDays(thisMonday, -28); // ~4 weeks ago → 4 elapsed weeks

// ── 1) Coach resolution (mirrors resolveCoachId: profiles → coaches.user_id) ─
log("coach", `resolving ${COACH_EMAIL} …`);
const { data: coachProfile, error: coachProfileErr } = await sb
  .from("profiles").select("id, email, role").eq("email", COACH_EMAIL).maybeSingle();
if (coachProfileErr) fail("coach", coachProfileErr.message);
if (!coachProfile) fail("coach", `no profiles row for ${COACH_EMAIL} — aborting`);
const { data: coachRow } = await sb
  .from("coaches").select("id, user_id, is_active").eq("user_id", coachProfile.id).maybeSingle();
if (!coachRow) fail("coach", "no coaches row for this profile — aborting (do not seed against a non-coach)");
if (coachRow.is_active === false) fail("coach", "coach row is inactive — aborting");
const coachId = coachRow.id;
log("coach", `verified (coaches.id resolved via user_id, is_active=${coachRow.is_active})`);

// ── 2) Food catalog lookup (exact, case-insensitive; ambiguous → abort) ──────
const FOOD_NAMES = [
  "Grilled Chicken Breast", "Chicken Breast (grilled 150g)", "Chicken Breast (baked)",
  "White Rice (cooked)", "Brown Rice (cooked)", "Egyptian Rice (cooked)", "White Rice",
  "Dry Oats (40g)", "Oats (dry)", "Whole Eggs", "Boiled Eggs (2)", "Boiled Eggs x3", "Egg Whites",
  "Greek Yogurt 0% (200g)", "Greek Yogurt 2% (200g)", "Salmon Fillet (grilled)",
  "Canned Tuna in Water (drained)", "Olive Oil", "Dates (3 pcs)", "Whey Protein Isolate (1 scoop)",
  "Sweet Potato (baked)", "French Fries (medium)", "Lean Ground Beef (95%)", "Ground Turkey (cooked)",
  "Whole Wheat Bread", "Baladi Bread", "Rice cakes (2 pcs)", "Hummus", "Low Fat Cottage Cheese (150g)",
  "Steamed Broccoli", "Spinach", "Sauteed Spinach with Garlic", "Lentils (cooked)", "Chickpeas (cooked)",
  "Avocado", "Full Cream Milk", "Labneh (100g)", "Foul Medames (cooked)", "Grilled Tilapia",
  "Grilled Shrimp (150g)", "Ice Cream Scoop (vanilla)", "Milk chocolate (45g)", "Oreo (3 cookies, 33g)",
  "Cheese Burger", "BBQ Chicken Pizza (slice)", "Margherita Pizza (small)", "Chicken Shawarma Sandwich",
  "Molto Croissant (55g)", "Quinoa (cooked)", "Chicken Biryani Plate", "Fried Rice (portion)",
  "Orange Juice (fresh)", "Cheese Sticks (4 pcs)",
];
const foods = {};
{
  let fetched = 0;
  for (let i = 0; i < FOOD_NAMES.length; i += 40) {
    const chunk = FOOD_NAMES.slice(i, i + 40);
    const or = chunk.map((n) => `name.ilike."${n.replace(/["\\]/g, "")}"`).join(",");
    const { data, error } = await sb.from("foods").select("id, name, serving_unit, serving_size, calories, protein_g, carbs_g, fat_g").or(or);
    if (error) fail("foods", error.message);
    fetched += (data ?? []).length;
    for (const n of chunk) {
      const exact = (data ?? []).filter((f) => f.name.toLowerCase() === n.toLowerCase());
      if (exact.length === 1) foods[n] = exact[0];
    }
  }
  const missing = FOOD_NAMES.filter((n) => !foods[n]);
  if (missing.length) fail("foods", `missing/ambiguous catalog foods: ${missing.join(" | ")}`);
  log("foods", `${FOOD_NAMES.length} catalog foods resolved (${fetched} rows scanned)`);
}
// Macros for a given quantity — mirrors the enrollment RPC:
//   scaled = base × quantity / serving_size  (quantity in the food's own unit)
const kcalOf = (name, qty) => Math.round((foods[name].calories * qty) / (foods[name].serving_size || 1));
const macrosOf = (name, qty) => ({
  calories: kcalOf(name, qty),
  protein_g: Math.round(((foods[name].protein_g ?? 0) * qty) / (foods[name].serving_size || 1) * 10) / 10,
  carbs_g: Math.round(((foods[name].carbs_g ?? 0) * qty) / (foods[name].serving_size || 1) * 10) / 10,
  fat_g: Math.round(((foods[name].fat_g ?? 0) * qty) / (foods[name].serving_size || 1) * 10) / 10,
});

// ── 3) Client + program specifications ───────────────────────────────────────
// Workout exercise shorthand: [name, sets, reps, weightKg|null, restSec|null]
// Base weights are week-1 targets; sessions progress ~2% per completed week.

const CLIENTS = [
  {
    nn: "01", label: "Weight Loss", scenario: "A — healthy/aligned (deficit, high steps, 4/wk)",
    profile: { gender: "female", age: 34, height_cm: 168, weight_kg: 88, fitness_goal: "weight_loss" },
    goals: { daily_calories: 1800, daily_protein_g: 140, daily_carbs_g: 160, daily_fat_g: 55, daily_water_ml: 2500, daily_steps: 10000, daily_sleep_hours: 7.5, weekly_workouts: 4, target_weight_kg: 74 },
    weights: [88.0, 87.4, 86.7, 86.1, 85.7, 85.4], bodyFat: [38.5, 38.1, 37.6, 37.2, 36.9, 36.6], waist: [96, 95.2, 94.3, 93.5, 93, 92.6],
    plan: { price: 250, tier: "premium" },
    workout: {
      name: "[AI] Upper/Lower Fat Loss", desc: "Four-day upper/lower split for steady fat loss.",
      durationWeeks: 6, start: W5_MONDAY, trainDays: [
        { day: 1, focus: ["Chest", "Back", "Shoulders"], ex: [
          ["Dumbbell Bench Press", 3, 12, 14, 75], ["Lat Pulldown", 3, 12, 45, 75], ["Seated Shoulder Press", 3, 12, 10, 60],
          ["Seated Cable Row", 3, 12, 40, 75], ["Incline Dumbbell Curl", 2, 15, 7.5, 45], ["Plank", 3, 1, null, 45]] },
        { day: 2, focus: ["Quads", "Glutes", "Hamstrings"], ex: [
          ["Goblet Squat", 3, 12, 16, 75], ["Romanian Deadlift (Dumbbell)", 3, 12, 18, 75], ["Walking Lunge", 3, 12, 10, 60],
          ["Leg Press", 3, 15, 70, 75], ["Standing Calf Raise", 3, 15, 30, 45]] },
        { day: 4, focus: ["Chest", "Back", "Arms"], ex: [
          ["Incline Dumbbell Press", 3, 12, 12, 75], ["One-Arm Dumbbell Row", 3, 12, 16, 75], ["Cable Chest Fly", 3, 15, 15, 60],
          ["Face Pull", 3, 15, 20, 45], ["Triceps Rope Pushdown", 2, 15, 20, 45], ["Crunch", 3, 20, null, 45]] },
        { day: 5, focus: ["Legs", "Glutes", "Core"], ex: [
          ["Barbell Back Squat", 3, 10, 40, 90], ["Dumbbell Romanian Deadlift", 3, 12, 16, 75], ["Bulgarian Split Squat", 3, 10, 8, 75],
          ["Hip Thrust", 3, 12, 40, 75], ["Mountain Climbers", 3, 30, null, 45]] },
      ],
      adherence: { complete: 0.85, skip: 0.05 }, duration: [50, 65], steps: [9000, 11000],
      summaryCalories: [1650, 1950], summarySlipDays: 2, summaryCoverage: 1.0, slipBump: 650,
      water: [2000, 2800], sleep: [7.0, 8.0],
    },
    nutrition: {
      name: "[AI] Fat Loss Deficit Plan", desc: "Moderate deficit, protein-forward, three meals plus a snack.",
      durationWeeks: 6, start: W5_MONDAY,
      variants: {
        TD: [ // training day
          ["Breakfast", [["Oats (dry)", 60], ["Egg Whites", 150], ["Greek Yogurt 0% (200g)", 200]]],
          ["Snack", [["Whey Protein Isolate (1 scoop)", 30], ["Rice cakes (2 pcs)", 2]]],
          ["Lunch", [["Grilled Chicken Breast", 170], ["Egyptian Rice (cooked)", 200], ["Steamed Broccoli", 120], ["Olive Oil", 5]]],
          ["Dinner", [["Grilled Tilapia", 250], ["Sweet Potato (baked)", 150], ["Spinach", 80], ["Olive Oil", 5]]]],
        RD: [ // rest day
          ["Breakfast", [["Boiled Eggs (2)", 120], ["Baladi Bread", 60], ["Greek Yogurt 0% (200g)", 200]]],
          ["Snack", [["Labneh (100g)", 80], ["Dates (3 pcs)", 48]]],
          ["Lunch", [["Grilled Chicken Breast", 180], ["Foul Medames (cooked)", 150], ["Sauteed Spinach with Garlic", 150]]],
          ["Dinner", [["Grilled Shrimp (150g)", 150], ["Egyptian Rice (cooked)", 150], ["Avocado", 50], ["Olive Oil", 5]]]],
      },
      dayMap: { 1: "TD", 2: "TD", 3: "RD", 4: "TD", 5: "TD", 6: "RD", 7: "RD" },
      adherence: { complete: 0.85, skip: 0.08 },
    },
  },
  {
    nn: "02", label: "Muscle Gain", scenario: "A — healthy/aligned (surplus, 5/wk, progressive overload)",
    profile: { gender: "male", age: 26, height_cm: 180, weight_kg: 72, fitness_goal: "muscle_gain" },
    goals: { daily_calories: 2900, daily_protein_g: 170, daily_carbs_g: 340, daily_fat_g: 80, daily_water_ml: 3000, daily_steps: 7000, daily_sleep_hours: 8, weekly_workouts: 5, target_weight_kg: 80 },
    weights: [72.0, 72.4, 72.8, 73.1, 73.4, 73.6], bodyFat: [12.5, 12.6, 12.7, 12.8, 12.9, 13.0], waist: [76, 76.3, 76.5, 76.8, 77, 77.2],
    plan: { price: 350, tier: "premium" },
    workout: {
      name: "[AI] PPL Hypertrophy 5-Day", desc: "Push/pull/legs with an upper accessory and second leg day.",
      durationWeeks: 6, start: W5_MONDAY, trainDays: [
        { day: 1, focus: ["Chest", "Shoulders", "Triceps"], ex: [
          ["Barbell Bench Press", 4, 8, 70, 150], ["Incline Dumbbell Press", 3, 10, 24, 120], ["Seated Shoulder Press", 3, 10, 20, 90],
          ["Cable Chest Fly", 3, 12, 20, 75], ["Triceps Rope Pushdown", 3, 12, 25, 60], ["Overhead Triceps Extension", 2, 12, 15, 60]] },
        { day: 2, focus: ["Back", "Biceps"], ex: [
          ["Deadlift (Conventional)", 3, 6, 120, 180], ["Lat Pulldown", 4, 10, 60, 120], ["Seated Cable Row", 3, 10, 55, 90],
          ["Barbell Curl", 3, 10, 25, 75], ["Hammer Curl", 3, 12, 12, 60]] },
        { day: 3, focus: ["Quads", "Hamstrings", "Calves"], ex: [
          ["Barbell Back Squat", 4, 8, 100, 180], ["Leg Press", 3, 12, 140, 120], ["Romanian Deadlift (Barbell)", 3, 10, 70, 120],
          ["Leg Curl", 3, 12, 45, 75], ["Standing Calf Raise", 4, 15, 60, 60]] },
        { day: 4, focus: ["Chest", "Back", "Arms"], ex: [
          ["Dumbbell Bench Press", 4, 10, 26, 120], ["One-Arm Dumbbell Row", 4, 10, 28, 90], ["Cable Chest Fly", 3, 12, 22, 75],
          ["Face Pull", 3, 15, 25, 60], ["Incline Dumbbell Curl", 3, 12, 10, 60], ["Hanging Leg Raise", 3, 12, null, 60]] },
        { day: 5, focus: ["Legs", "Glutes", "Core"], ex: [
          ["Front Squat", 4, 8, 70, 150], ["Bulgarian Split Squat", 3, 10, 20, 105], ["Hip Thrust", 4, 10, 80, 105],
          ["Leg Extension", 3, 15, 55, 60], ["Seated Calf Raise", 3, 15, 40, 60]] },
      ],
      adherence: { complete: 0.96, skip: 0.0 }, duration: [60, 80], steps: [6500, 8000],
      summaryCalories: [2750, 3050], summarySlipDays: 1, summaryCoverage: 1.0, slipBump: 400,
      water: [2800, 3400], sleep: [7.5, 8.5],
    },
    nutrition: {
      name: "[AI] Lean Bulk Plan", desc: "Calorie surplus with four feedings to support muscle gain.",
      durationWeeks: 6, start: W5_MONDAY,
      variants: {
        TD: [
          ["Breakfast", [["Oats (dry)", 90], ["Whole Eggs", 150], ["Full Cream Milk", 250]]],
          ["Lunch", [["Chicken Breast (grilled 150g)", 225], ["White Rice (cooked)", 300], ["Steamed Broccoli", 120], ["Olive Oil", 10]]],
          ["Snack", [["Whey Protein Isolate (1 scoop)", 30], ["Rice cakes (2 pcs)", 2], ["Labneh (100g)", 100]]],
          ["Dinner", [["Lean Ground Beef (95%)", 200], ["Quinoa (cooked)", 200], ["Avocado", 60], ["Sauteed Spinach with Garlic", 150]]]],
        RD: [
          ["Breakfast", [["Oats (dry)", 80], ["Boiled Eggs x3", 3], ["Full Cream Milk", 250]]],
          ["Lunch", [["Salmon Fillet (grilled)", 150], ["Egyptian Rice (cooked)", 250], ["Olive Oil", 10]]],
          ["Snack", [["Whey Protein Isolate (1 scoop)", 30], ["Dates (3 pcs)", 48], ["Full Cream Milk", 150]]],
          ["Dinner", [["Ground Turkey (cooked)", 200], ["Brown Rice (cooked)", 250], ["Avocado", 60], ["Steamed Broccoli", 120]]]],
      },
      dayMap: { 1: "TD", 2: "TD", 3: "TD", 4: "RD", 5: "TD", 6: "RD", 7: "RD" },
      adherence: { complete: 0.95, skip: 0.02 },
    },
  },
  {
    nn: "03", label: "Recomposition", scenario: "A — healthy/aligned (maintenance cals, balanced 4/wk)",
    profile: { gender: "male", age: 31, height_cm: 178, weight_kg: 84, fitness_goal: "endurance" },
    goals: { daily_calories: 2300, daily_protein_g: 165, daily_carbs_g: 220, daily_fat_g: 65, daily_water_ml: 2800, daily_steps: 8500, daily_sleep_hours: 7.5, weekly_workouts: 4, target_weight_kg: 80 },
    weights: [84.2, 83.9, 83.5, 83.2, 83.0, 82.8], bodyFat: [22.0, 21.7, 21.4, 21.2, 21.0, 20.8], waist: [92, 91.5, 91, 90.7, 90.5, 90.2],
    plan: { price: 290, tier: "premium" },
    workout: {
      name: "[AI] Recomp Full-Body", desc: "Four full-body sessions with balanced muscle coverage.",
      durationWeeks: 6, start: W5_MONDAY, trainDays: [
        { day: 1, focus: ["Full Body"], ex: [
          ["Barbell Back Squat", 3, 8, 80, 120], ["Bench Press (Dumbbell)", 3, 10, 22, 90], ["Lat Pulldown", 3, 10, 55, 90],
          ["Seated Shoulder Press", 3, 10, 16, 75], ["Plank", 3, 1, null, 60]] },
        { day: 2, focus: ["Full Body", "Conditioning"], ex: [
          ["Romanian Deadlift (Barbell)", 3, 10, 70, 120], ["Incline Dumbbell Press", 3, 10, 20, 90], ["Seated Cable Row", 3, 10, 50, 90],
          ["Walking Lunge", 3, 12, 12, 75], ["Rowing Machine", 1, 1, null, null]] },
        { day: 4, focus: ["Full Body"], ex: [
          ["Deadlift (Conventional)", 3, 6, 100, 150], ["Pull-up (Assisted)", 3, 10, 20, 105], ["Dumbbell Bench Press", 3, 10, 22, 90],
          ["Leg Press", 3, 12, 120, 90], ["Crunch", 3, 20, null, 45]] },
        { day: 5, focus: ["Full Body", "Conditioning"], ex: [
          ["Goblet Squat", 3, 12, 20, 90], ["One-Arm Dumbbell Row", 3, 10, 24, 75], ["Seated Shoulder Press", 3, 10, 14, 75],
          ["Hip Thrust", 3, 12, 60, 90], ["Mountain Climbers", 3, 30, null, 45]] },
      ],
      adherence: { complete: 0.8, skip: 0.08 }, duration: [50, 70], steps: [8000, 9500],
      summaryCalories: [2150, 2450], summarySlipDays: 2, summaryCoverage: 1.0, slipBump: 500,
      water: [2400, 3000], sleep: [7.0, 8.0],
    },
    nutrition: {
      name: "[AI] Recomp Balance Plan", desc: "Near-maintenance calories with high protein for recomposition.",
      durationWeeks: 6, start: W5_MONDAY,
      variants: {
        TD: [
          ["Breakfast", [["Greek Yogurt 0% (200g)", 200], ["Oats (dry)", 60], ["Whey Protein Isolate (1 scoop)", 30]]],
          ["Lunch", [["Grilled Chicken Breast", 200], ["Brown Rice (cooked)", 260], ["Hummus", 60], ["Steamed Broccoli", 120], ["Olive Oil", 5]]],
          ["Snack", [["Low Fat Cottage Cheese (150g)", 150], ["Rice cakes (2 pcs)", 2]]],
          ["Dinner", [["Salmon Fillet (grilled)", 150], ["Sweet Potato (baked)", 250], ["Spinach", 100], ["Olive Oil", 5]]]],
        RD: [
          ["Breakfast", [["Oats (dry)", 60], ["Boiled Eggs (2)", 150], ["Greek Yogurt 0% (200g)", 200]]],
          ["Lunch", [["Canned Tuna in Water (drained)", 160], ["Baladi Bread", 90], ["Avocado", 60], ["Steamed Broccoli", 120]]],
          ["Snack", [["Whey Protein Isolate (1 scoop)", 30], ["Dates (3 pcs)", 48]]],
          ["Dinner", [["Grilled Chicken Breast", 180], ["Lentils (cooked)", 180], ["Sauteed Spinach with Garlic", 150], ["Olive Oil", 5]]]],
      },
      dayMap: { 1: "TD", 2: "TD", 3: "RD", 4: "TD", 5: "TD", 6: "RD", 7: "RD" },
      adherence: { complete: 0.82, skip: 0.07 },
    },
  },
  {
    nn: "04", label: "Low Adherence", scenario: "F — poor adherence, reasonable program",
    profile: { gender: "male", age: 29, height_cm: 172, weight_kg: 95, fitness_goal: "weight_loss" },
    goals: { daily_calories: 2000, daily_protein_g: 130, daily_carbs_g: 190, daily_fat_g: 60, daily_water_ml: 2200, daily_steps: 6000, daily_sleep_hours: 7, weekly_workouts: 3, target_weight_kg: 85 },
    weights: [95.0, 95.2, 95.4, 95.6, 95.7, 95.8], bodyFat: [33.0, 33.1, 33.2, 33.2, 33.3, 33.4], waist: [104, 104.2, 104.4, 104.5, 104.6, 104.8],
    plan: { price: 220, tier: "standard" },
    workout: {
      name: "[AI] Beginner Full-Body", desc: "Three machine-friendly full-body sessions for beginners.",
      durationWeeks: 5, start: W4_MONDAY, trainDays: [
        { day: 1, focus: ["Full Body"], ex: [
          ["Leg Press", 3, 12, 80, 90], ["Chest Press Machine", 3, 12, 35, 90], ["Lat Pulldown", 3, 12, 40, 90],
          ["Seated Shoulder Press", 2, 12, 12, 60], ["Plank", 2, 1, null, 45]] },
        { day: 3, focus: ["Full Body"], ex: [
          ["Goblet Squat", 3, 12, 14, 90], ["Seated Cable Row", 3, 12, 35, 90], ["Dumbbell Bench Press", 3, 12, 14, 90],
          ["Leg Curl", 2, 12, 30, 60], ["Crunch", 2, 15, null, 45]] },
        { day: 5, focus: ["Full Body"], ex: [
          ["Romanian Deadlift (Dumbbell)", 3, 12, 14, 90], ["Incline Dumbbell Press", 3, 12, 12, 90], ["One-Arm Dumbbell Row", 3, 12, 14, 90],
          ["Standing Calf Raise", 2, 15, 25, 60], ["Mountain Climbers", 2, 20, null, 45]] },
      ],
      adherence: { complete: 0.3, skip: 0.25 }, duration: [35, 50], steps: [3500, 5200],
      summaryCalories: [2100, 2600], summarySlipDays: 5, summaryCoverage: 0.55, slipBump: 700,
      water: [1200, 2200], sleep: [5.5, 7.5],
    },
    nutrition: {
      name: "[AI] Starter Deficit Plan", desc: "Simple three-meal deficit plan for a beginner.",
      durationWeeks: 5, start: W4_MONDAY,
      variants: {
        TD: [
          ["Breakfast", [["Boiled Eggs (2)", 100], ["Baladi Bread", 60], ["Full Cream Milk", 150], ["Dates (3 pcs)", 48]]],
          ["Lunch", [["Grilled Chicken Breast", 180], ["Egyptian Rice (cooked)", 200], ["Sauteed Spinach with Garlic", 150]]],
          ["Dinner", [["Grilled Tilapia", 250], ["White Rice (cooked)", 250], ["Steamed Broccoli", 120], ["Olive Oil", 5]]]],
        RD: [
          ["Breakfast", [["Greek Yogurt 2% (200g)", 200], ["Oats (dry)", 80], ["Dates (3 pcs)", 48]]],
          ["Lunch", [["Canned Tuna in Water (drained)", 160], ["Baladi Bread", 60], ["Avocado", 50], ["Hummus", 80]]],
          ["Dinner", [["Ground Turkey (cooked)", 180], ["Brown Rice (cooked)", 180], ["Steamed Broccoli", 120], ["Olive Oil", 5]]]],
      },
      dayMap: { 1: "TD", 2: "RD", 3: "TD", 4: "RD", 5: "TD", 6: "RD", 7: "RD" },
      adherence: { complete: 0.45, skip: 0.3 },
    },
  },
  {
    nn: "05", label: "Strong Adherence / Extreme Program", scenario: "B+E — excellent adherence but excessive program",
    profile: { gender: "female", age: 41, height_cm: 163, weight_kg: 61, fitness_goal: "flexibility" },
    goals: { daily_calories: 1700, daily_protein_g: 100, daily_carbs_g: 180, daily_fat_g: 50, daily_water_ml: 2400, daily_steps: 12000, daily_sleep_hours: 7.5, weekly_workouts: 6, target_weight_kg: 58 },
    weights: [61.0, 61.0, 60.9, 61.0, 60.9, 60.9], bodyFat: [27.5, 27.5, 27.4, 27.5, 27.4, 27.4], waist: [74, 73.9, 74, 73.8, 74, 73.9],
    plan: { price: 290, tier: "premium" },
    workout: {
      name: "[AI] 6-Day Extreme Volume Split", desc: "Six consecutive days, upper-biased, very high set volume.",
      durationWeeks: 6, start: W5_MONDAY, trainDays: [
        { day: 1, focus: ["Chest", "Triceps"], ex: [
          ["Barbell Bench Press", 4, 10, 35, 45], ["Incline Dumbbell Press", 4, 12, 12, 45], ["Cable Chest Fly", 4, 15, 15, 45],
          ["Dips (Assisted)", 3, 12, 5, 45], ["Triceps Rope Pushdown", 4, 15, 20, 45], ["Overhead Triceps Extension", 3, 15, 8, 45],
          ["Push-ups", 3, 20, null, 45], ["Crunch", 4, 25, null, 45]] },
        { day: 2, focus: ["Back", "Biceps"], ex: [
          ["Lat Pulldown", 4, 12, 40, 45], ["Seated Cable Row", 4, 12, 40, 45], ["One-Arm Dumbbell Row", 4, 12, 14, 45],
          ["Face Pull", 4, 15, 20, 45], ["Barbell Curl", 4, 12, 15, 45], ["Hammer Curl", 3, 15, 8, 45],
          ["Cable Curl", 3, 15, 15, 45], ["Plank", 4, 1, null, 45]] },
        { day: 3, focus: ["Shoulders", "Arms"], ex: [
          ["Seated Shoulder Press", 4, 12, 12, 45], ["Lateral Raise", 4, 15, 6, 45], ["Front Raise", 3, 15, 5, 45],
          ["Rear Delt Fly", 4, 15, 5, 45], ["Incline Dumbbell Curl", 4, 12, 7, 45], ["Triceps Rope Pushdown", 4, 15, 18, 45],
          ["Shrug (Dumbbell)", 3, 15, 14, 45], ["Crunch", 3, 25, null, 45]] },
        { day: 4, focus: ["Chest", "Shoulders"], ex: [
          ["Dumbbell Bench Press", 4, 12, 12, 45], ["Machine Chest Press", 4, 15, 25, 45], ["Cable Chest Fly", 4, 15, 15, 45],
          ["Seated Shoulder Press", 4, 12, 10, 45], ["Lateral Raise", 4, 15, 5, 45], ["Cable Lateral Raise", 3, 15, 5, 45],
          ["Push-ups", 3, 20, null, 45], ["Hanging Leg Raise", 3, 12, null, 45]] },
        { day: 5, focus: ["Back", "Biceps"], ex: [
          ["Pull-up (Assisted)", 4, 12, 10, 45], ["Lat Pulldown", 4, 12, 42, 45], ["Seated Cable Row", 4, 12, 42, 45],
          ["Straight-Arm Pulldown", 3, 15, 20, 45], ["Barbell Curl", 4, 12, 15, 45], ["Cable Curl", 4, 15, 15, 45],
          ["Reverse Curl", 3, 15, 8, 45], ["Plank", 3, 1, null, 45]] },
        { day: 6, focus: ["Legs", "Glutes"], ex: [
          ["Leg Press", 4, 15, 80, 45], ["Goblet Squat", 4, 15, 14, 45], ["Leg Extension", 4, 15, 35, 45],
          ["Leg Curl", 4, 15, 30, 45], ["Hip Thrust", 4, 12, 40, 45], ["Standing Calf Raise", 4, 20, 40, 45],
          ["Walking Lunge", 3, 15, 8, 45], ["Mountain Climbers", 3, 30, null, 45]] },
      ],
      adherence: { complete: 1.0, skip: 0.0 }, duration: [75, 95], steps: [11000, 13000],
      summaryCalories: [1650, 1850], summarySlipDays: 1, summaryCoverage: 1.0, slipBump: 400,
      water: [2200, 2800], sleep: [5.5, 6.5],
    },
    nutrition: {
      name: "[AI] Fitness Maintenance Plan", desc: "Maintenance calories with modest protein across three meals and a snack.",
      durationWeeks: 6, start: W5_MONDAY,
      variants: {
        TD: [
          ["Breakfast", [["Greek Yogurt 2% (200g)", 200], ["Oats (dry)", 50], ["Full Cream Milk", 100]]],
          ["Lunch", [["Grilled Chicken Breast", 130], ["Egyptian Rice (cooked)", 150], ["Steamed Broccoli", 120], ["Olive Oil", 5]]],
          ["Snack", [["Labneh (100g)", 100], ["Rice cakes (2 pcs)", 2]]],
          ["Dinner", [["Grilled Tilapia", 250], ["Sweet Potato (baked)", 150], ["Spinach", 100], ["Olive Oil", 5]]]],
        RD: [
          ["Breakfast", [["Boiled Eggs (2)", 100], ["Baladi Bread", 50], ["Greek Yogurt 2% (200g)", 200]]],
          ["Lunch", [["Canned Tuna in Water (drained)", 160], ["Egyptian Rice (cooked)", 150], ["Sauteed Spinach with Garlic", 150]]],
          ["Snack", [["Whey Protein Isolate (1 scoop)", 30], ["Dates (3 pcs)", 48]]],
          ["Dinner", [["Grilled Chicken Breast", 130], ["Lentils (cooked)", 150], ["Steamed Broccoli", 120], ["Olive Oil", 5]]]],
      },
      dayMap: { 1: "TD", 2: "TD", 3: "TD", 4: "TD", 5: "TD", 6: "RD", 7: "RD" },
      adherence: { complete: 0.97, skip: 0.02 },
    },
  },
  {
    nn: "06", label: "Program Mismatch", scenario: "D — both workout and nutrition misaligned with the goal",
    profile: { gender: "male", age: 38, height_cm: 175, weight_kg: 97, fitness_goal: "weight_loss" },
    goals: { daily_calories: 2400, daily_protein_g: 150, daily_carbs_g: 240, daily_fat_g: 70, daily_water_ml: 2600, daily_steps: 5000, daily_sleep_hours: 7, weekly_workouts: 5, target_weight_kg: 88 },
    weights: [97.0, 97.1, 97.3, 97.4, 97.5, 97.6], bodyFat: [35.0, 35.1, 35.2, 35.2, 35.3, 35.4], waist: [110, 110.3, 110.5, 110.7, 110.9, 111.0],
    plan: { price: 250, tier: "standard" },
    workout: {
      name: "[AI] 5-Day High-Volume Bodybuilding", desc: "Five consecutive high-volume days, barbell-centric, no conditioning.",
      durationWeeks: 5, start: W4_MONDAY, trainDays: [
        { day: 1, focus: ["Chest", "Triceps"], ex: [
          ["Barbell Bench Press", 4, 12, 60, 60], ["Incline Barbell Press", 4, 12, 50, 60], ["Dips (Assisted)", 4, 12, 10, 60],
          ["Cable Chest Fly", 4, 15, 20, 60], ["Triceps Rope Pushdown", 4, 15, 25, 60], ["Close-Grip Bench Press", 3, 12, 40, 60],
          ["Overhead Triceps Extension", 3, 15, 12, 60]] },
        { day: 2, focus: ["Back", "Biceps"], ex: [
          ["Deadlift (Conventional)", 4, 12, 100, 60], ["Barbell Row", 4, 12, 60, 60], ["Lat Pulldown", 4, 15, 55, 60],
          ["Seated Cable Row", 4, 15, 50, 60], ["Barbell Curl", 4, 12, 22, 60], ["Hammer Curl", 3, 15, 10, 60],
          ["Shrug (Barbell)", 3, 15, 60, 60]] },
        { day: 3, focus: ["Quads", "Calves"], ex: [
          ["Barbell Back Squat", 4, 15, 80, 60], ["Leg Press", 4, 20, 150, 60], ["Walking Lunge", 4, 20, 16, 60],
          ["Leg Extension", 4, 20, 50, 60], ["Standing Calf Raise", 5, 20, 60, 45], ["Seated Calf Raise", 4, 20, 40, 45]] },
        { day: 4, focus: ["Shoulders", "Traps"], ex: [
          ["Seated Shoulder Press", 4, 12, 25, 60], ["Upright Row", 4, 15, 30, 60], ["Lateral Raise", 4, 20, 8, 60],
          ["Rear Delt Fly", 4, 20, 6, 60], ["Shrug (Dumbbell)", 4, 20, 22, 60], ["Face Pull", 3, 20, 20, 45],
          ["Arnold Press", 3, 15, 12, 60]] },
        { day: 5, focus: ["Hamstrings", "Arms"], ex: [
          ["Romanian Deadlift (Barbell)", 4, 12, 80, 60], ["Leg Curl", 4, 15, 45, 60], ["Good Morning", 3, 15, 40, 60],
          ["Barbell Curl", 4, 15, 20, 60], ["Preacher Curl", 3, 15, 15, 60], ["Skull Crusher", 4, 15, 15, 60],
          ["Wrist Curl", 3, 20, 10, 45]] },
      ],
      adherence: { complete: 0.6, skip: 0.1 }, duration: [70, 90], steps: [4000, 6000],
      summaryCalories: [2900, 3400], summarySlipDays: 6, summaryCoverage: 1.0, slipBump: 800,
      water: [1500, 2400], sleep: [5.5, 7.0],
    },
    nutrition: {
      name: "[AI] Mass Building Plan", desc: "Two large calorie-dense meals — a surplus plan on a fat-loss client.",
      durationWeeks: 5, start: W4_MONDAY,
      variants: {
        ALL: [
          ["Lunch", [["Chicken Biryani Plate", 400], ["French Fries (medium)", 1], ["Cheese Sticks (4 pcs)", 120], ["Orange Juice (fresh)", 300]]],
          ["Dinner", [["Cheese Burger", 1], ["Margherita Pizza (small)", 260], ["Oreo (3 cookies, 33g)", 33], ["Full Cream Milk", 250]]]],
      },
      dayMap: { 1: "ALL", 2: "ALL", 3: "ALL", 4: "ALL", 5: "ALL", 6: "ALL", 7: "ALL" },
      adherence: { complete: 0.55, skip: 0.15 },
    },
  },
  {
    nn: "07", label: "Mixed Data", scenario: "C — good workout, inconsistent nutrition with client modifications",
    profile: { gender: "female", age: 27, height_cm: 165, weight_kg: 70, fitness_goal: "muscle_gain" },
    goals: { daily_calories: 2100, daily_protein_g: 120, daily_carbs_g: 220, daily_fat_g: 65, daily_water_ml: 2400, daily_steps: 8000, daily_sleep_hours: 7.5, weekly_workouts: 4, target_weight_kg: 65 },
    weights: [70.4, 70.9, 69.8, 70.2, 69.5, 70.1], bodyFat: [28.5, 28.8, 28.2, 28.4, 27.9, 28.3], waist: [79, 79.6, 78.8, 79.1, 78.4, 79.0],
    plan: { price: 290, tier: "premium" },
    workout: {
      name: "[AI] Upper/Lower Tone", desc: "Four-day upper/lower with moderate hypertrophy ranges.",
      durationWeeks: 6, start: W5_MONDAY, trainDays: [
        { day: 1, focus: ["Chest", "Back", "Shoulders"], ex: [
          ["Dumbbell Bench Press", 3, 12, 12, 75], ["Lat Pulldown", 3, 12, 40, 75], ["Seated Shoulder Press", 3, 12, 10, 75],
          ["Seated Cable Row", 3, 12, 35, 75], ["Lateral Raise", 3, 15, 5, 45]] },
        { day: 2, focus: ["Glutes", "Quads", "Hamstrings"], ex: [
          ["Hip Thrust", 3, 12, 50, 90], ["Goblet Squat", 3, 12, 14, 75], ["Romanian Deadlift (Dumbbell)", 3, 12, 14, 75],
          ["Leg Extension", 3, 15, 35, 60], ["Standing Calf Raise", 3, 15, 35, 45]] },
        { day: 4, focus: ["Chest", "Back", "Arms"], ex: [
          ["Incline Dumbbell Press", 3, 12, 10, 75], ["One-Arm Dumbbell Row", 3, 12, 14, 75], ["Cable Chest Fly", 3, 15, 12, 60],
          ["Incline Dumbbell Curl", 3, 15, 6, 45], ["Triceps Rope Pushdown", 3, 15, 15, 45]] },
        { day: 5, focus: ["Legs", "Core"], ex: [
          ["Bulgarian Split Squat", 3, 12, 10, 90], ["Leg Curl", 3, 15, 30, 60], ["Walking Lunge", 3, 15, 8, 75],
          ["Hip Thrust", 3, 12, 50, 90], ["Hanging Leg Raise", 3, 12, null, 45]] },
      ],
      adherence: { complete: 0.75, skip: 0.1 }, duration: [45, 65], steps: [7000, 9500],
      summaryCalories: [1850, 2250], summarySlipDays: 0, summaryCoverage: 1.0, slipBump: 0,
      weekendBinge: true, water: [1800, 2600], sleep: [6.5, 8.0],
    },
    nutrition: {
      name: "[AI] Weekend Flex Plan", desc: "Weekday structure with large unstructured weekend meals.",
      durationWeeks: 6, start: W5_MONDAY,
      variants: {
        WD: [
          ["Brunch", [["Boiled Eggs x3", 3], ["Baladi Bread", 90], ["Labneh (100g)", 100], ["Greek Yogurt 2% (200g)", 200], ["Hummus", 60], ["Dates (3 pcs)", 48]]],
          ["Dinner", [["Grilled Chicken Breast", 200], ["Egyptian Rice (cooked)", 300], ["Olive Oil", 10], ["Hummus", 60]]]],
        WE: [
          ["Brunch", [["Molto Croissant (55g)", 110], ["Full Cream Milk", 250], ["Cheese Sticks (4 pcs)", 120], ["Oreo (3 cookies, 33g)", 33]]],
          ["Dinner", [["Cheese Burger", 1], ["French Fries (medium)", 1], ["Ice Cream Scoop (vanilla)", 2], ["Orange Juice (fresh)", 300], ["BBQ Chicken Pizza (slice)", 2]]]],
      },
      dayMap: { 1: "WD", 2: "WD", 3: "WD", 4: "WD", 5: "WD", 6: "WE", 7: "WE" },
      adherence: { complete: 0.8, skip: 0.1 }, weekendAdherence: { complete: 0.45, skip: 0.3 },
    },
  },
  {
    nn: "08", label: "Minimal History", scenario: "G — insufficient data (fresh enrollments)",
    profile: { gender: "male", age: 45, height_cm: 179, weight_kg: 91, fitness_goal: "weight_loss" },
    goals: { daily_calories: 1900, daily_protein_g: 140, daily_carbs_g: 170, daily_fat_g: 60, daily_water_ml: 2400, daily_steps: 7000, daily_sleep_hours: 7, weekly_workouts: 3, target_weight_kg: 82 },
    weights: [91.0], bodyFat: [31.0], waist: [106],
    plan: { price: 220, tier: "standard" },
    workout: {
      name: "[AI] Returner Foundation", desc: "Two light full-body sessions to rebuild the habit.",
      durationWeeks: 4, start: thisMonday, trainDays: [
        { day: 1, focus: ["Full Body"], ex: [
          ["Leg Press", 3, 12, 70, 90], ["Chest Press Machine", 3, 12, 30, 90], ["Lat Pulldown", 3, 12, 35, 90],
          ["Plank", 2, 1, null, 45]] },
        { day: 4, focus: ["Full Body"], ex: [
          ["Goblet Squat", 3, 12, 12, 90], ["Seated Cable Row", 3, 12, 30, 90], ["Dumbbell Bench Press", 3, 12, 12, 90],
          ["Crunch", 2, 15, null, 45]] },
      ],
      adherence: { complete: 0.5, skip: 0.0 }, duration: [40, 50], steps: [6000, 8000],
      summaryCalories: [1800, 2100], summarySlipDays: 0, summaryCoverage: 1.0, slipBump: 0,
      water: [1800, 2400], sleep: [6.5, 7.5],
    },
    nutrition: {
      name: "[AI] Starter Reset Plan", desc: "Two balanced meals per day to restart tracking.",
      durationWeeks: 4, start: addDays(thisMonday, 2), // Wednesday — only ~3 elapsed days
      variants: {
        ALL: [
          ["Breakfast", [["Oats (dry)", 100], ["Greek Yogurt 0% (200g)", 200], ["Whey Protein Isolate (1 scoop)", 30], ["Full Cream Milk", 200]]],
          ["Dinner", [["Grilled Chicken Breast", 200], ["Egyptian Rice (cooked)", 320], ["Steamed Broccoli", 120], ["Olive Oil", 7]]]],
      },
      dayMap: { 1: "ALL", 2: "ALL", 3: "ALL", 4: "ALL", 5: "ALL", 6: "ALL", 7: "ALL" },
      adherence: { complete: 0.67, skip: 0.17 },
    },
  },
  {
    nn: "09", label: "No Programs", scenario: "Edge — active subscription with no programs (422 path)",
    profile: { gender: "female", age: 33, height_cm: 170, weight_kg: 78, fitness_goal: "endurance" },
    goals: { daily_calories: 2000, daily_protein_g: 110, daily_carbs_g: 200, daily_fat_g: 60, daily_water_ml: 2400, daily_steps: 8000, daily_sleep_hours: 7.5, weekly_workouts: 3, target_weight_kg: 70 },
    weights: [78.0], bodyFat: [30.0], waist: [86],
    plan: { price: 220, tier: "standard" },
    workout: null, nutrition: null,
  },
];

// ── 4) Wipe previous AI-tagged rows (idempotent; FK-safe, child-first) ───────
if (!DRY_RUN) {
  log("wipe", "removing previously seeded [AI] rows…");
  const { data: oldClients } = await sb.from("profiles").select("id").like("email", `ai.test.client.%@${CLIENT_TAG_DOMAIN}`);
  const ids = (oldClients ?? []).map((c) => c.id);
  if (ids.length > 0) {
    const sessIds = (await sb.from("workout_sessions").select("id").in("user_id", ids)).data?.map((r) => r.id) ?? [];
    for (let i = 0; i < sessIds.length; i += 50) {
      await sb.from("workout_sets").delete().in("session_id", sessIds.slice(i, i + 50));
    }
    if (sessIds.length) await sb.from("workout_sessions").delete().in("user_id", ids);
    for (let i = 0; i < ids.length; i += 50) {
      const slice = ids.slice(i, i + 50);
      const naIds = (await sb.from("nutrition_assignments").select("id").in("client_id", slice)).data?.map((r) => r.id) ?? [];
      for (let j = 0; j < naIds.length; j += 50) {
        const { error } = await sb.from("nutrition_assignment_foods").delete().in("assignment_id", naIds.slice(j, j + 50));
        if (error) fail("wipe nutrition_assignment_foods", error.message);
      }
      // FK order: assignments → enrollments → coach programs (RESTRICT chains)
      const chk = async (label, q) => { const { error } = await q; if (error) fail(`wipe ${label}`, error.message); };
      await chk("nutrition_assignments", sb.from("nutrition_assignments").delete().in("client_id", slice));
      await chk("nutrition_change_log", sb.from("nutrition_change_log").delete().in("client_id", slice));
      await chk("client_nutrition_enrollments", sb.from("client_nutrition_enrollments").delete().in("client_id", slice));
      await chk("workout_assignments", sb.from("workout_assignments").delete().in("client_id", slice));
      await chk("client_program_enrollments", sb.from("client_program_enrollments").delete().in("client_id", slice));
      await chk("daily_summary", sb.from("daily_summary").delete().in("user_id", slice));
      await chk("nutrition_logs", sb.from("nutrition_logs").delete().in("user_id", slice));
      await chk("body_measurements", sb.from("body_measurements").delete().in("user_id", slice));
      await chk("user_goals", sb.from("user_goals").delete().in("user_id", slice));
      await chk("subscriptions", sb.from("subscriptions").delete().in("client_id", slice));
    }
    // auth users last — profile rows cascade with them
    const { data: authList } = await sb.auth.admin.listUsers({ perPage: 500, page: 1 });
    for (const u of authList.users ?? []) {
      if ((u.email ?? "").startsWith("ai.test.client.")) await sb.auth.admin.deleteUser(u.id);
    }
    log("wipe", `removed ${ids.length} previous AI clients + their rows`);
  }
  // coach-scoped [AI] program rows (programs BEFORE templates — FK order)
  const del = async (table, col, ids2) => {
    for (let i = 0; i < ids2.length; i += 50) {
      const { error } = await sb.from(table).delete().in(col, ids2.slice(i, i + 50));
      if (error) fail(`wipe ${table}`, error.message);
    }
  };
  const nutriProgIds = (await sb.from("nutrition_programs").select("id").eq("coach_id", coachId).like("name", "[AI]%")).data?.map((r) => r.id) ?? [];
  if (nutriProgIds.length) {
    const orphanNEnr = (await sb.from("client_nutrition_enrollments").select("id").in("program_id", nutriProgIds)).data?.map((r) => r.id) ?? [];
    if (orphanNEnr.length) {
      const orphanMeals = (await sb.from("nutrition_assignments").select("id").in("enrollment_id", orphanNEnr)).data?.map((r) => r.id) ?? [];
      if (orphanMeals.length) await del("nutrition_assignment_foods", "assignment_id", orphanMeals);
      await del("nutrition_assignments", "enrollment_id", orphanNEnr);
      await del("client_nutrition_enrollments", "id", orphanNEnr);
    }
    const dayIds = (await sb.from("nutrition_program_days").select("id").in("program_id", nutriProgIds)).data?.map((r) => r.id) ?? [];
    const mealIds = dayIds.length ? (await sb.from("nutrition_program_meals").select("id").in("day_id", dayIds)).data?.map((r) => r.id) ?? [] : [];
    if (mealIds.length) await del("nutrition_program_foods", "meal_id", mealIds);
    if (dayIds.length) await del("nutrition_program_meals", "day_id", dayIds);
    await del("nutrition_program_days", "program_id", nutriProgIds);
    await del("nutrition_programs", "id", nutriProgIds);
  }
  const progIds = (await sb.from("coach_programs").select("id").eq("coach_id", coachId).like("name", "[AI]%")).data?.map((r) => r.id) ?? [];
  if (progIds.length) {
    // Orphan sweep: enrollments whose client profile is already gone (from an
    // interrupted earlier run) would RESTRICT-delete the programs. Remove any
    // enrollment + assignment referencing [AI] programs before deleting them.
    const orphanEnr = (await sb.from("client_program_enrollments").select("id").in("program_id", progIds)).data?.map((r) => r.id) ?? [];
    if (orphanEnr.length) {
      await del("workout_assignments", "enrollment_id", orphanEnr);
      await del("client_program_enrollments", "id", orphanEnr);
    }
    await del("coach_program_days", "program_id", progIds);
    await del("coach_programs", "id", progIds);
  }
  const tplIds = (await sb.from("workout_templates").select("id").eq("coach_id", coachId).like("name", "[AI]%")).data?.map((r) => r.id) ?? [];
  if (tplIds.length) {
    await del("workout_template_exercises", "template_id", tplIds);
    await del("workout_templates", "id", tplIds);
  }
  const planIds = (await sb.from("subscription_plans").select("id").eq("coach_id", coachId).like("name", "[AI]%")).data?.map((r) => r.id) ?? [];
  if (planIds.length) await del("subscription_plans", "id", planIds);
  log("wipe", "done");
}

if (DRY_RUN) {
  for (const c of CLIENTS) {
    if (!c.nutrition) continue;
    for (const [vname, meals] of Object.entries(c.nutrition.variants)) {
      const lines = meals.map(([mealName, picks]) => {
        const m = picks.reduce((t, [f, q]) => {
          const mm = macrosOf(f, q);
          return { calories: t.calories + mm.calories, protein_g: Math.round((t.protein_g + mm.protein_g) * 10) / 10 };
        }, { calories: 0, protein_g: 0 });
        return `    ${mealName.padEnd(10)} ${String(m.calories).padStart(5)} kcal  P ${m.protein_g}`;
      });
      const day = meals.reduce((t, [, picks]) => picks.reduce((tt, [f, q]) => {
        const mm = macrosOf(f, q);
        return { calories: tt.calories + mm.calories, protein_g: Math.round((tt.protein_g + mm.protein_g) * 10) / 10 };
      }, t), { calories: 0, protein_g: 0 });
      console.log(`  ${c.nn} ${vname}: ${day.calories} kcal / P ${day.protein_g}\n${lines.join("\n")}`);
    }
  }
  console.log("[seed-ai] dry-run done (no writes).");
  process.exit(0);
}

// ── 5) Plans, clients, subscriptions, goals ──────────────────────────────────
const { data: planAI, error: planErr } = await sb.from("subscription_plans").insert({
  coach_id: coachId, name: "[AI] Premium Coaching", price_usd: 290, duration_days: 30, max_clients: 50,
}).select("id").single();
if (planErr) fail("plans", planErr.message);
log("plans", "[AI] Premium Coaching created");

const seeded = [];
for (const spec of CLIENTS) {
  const email = `ai.test.client.${spec.nn}@${CLIENT_TAG_DOMAIN}`;
  const displayName = `AI Test Client ${spec.nn}`;
  const password = crypto.randomUUID() + crypto.randomUUID(); // never printed or stored
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: displayName },
  });
  let uid = created?.user?.id;
  if (createErr) {
    const { data: p } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!p) fail(`client ${spec.nn}`, createErr.message);
    uid = p.id;
  }
  // full_name is GENERATED ALWAYS on the live DB (mirrors name) — never written.
  const { error: profErr } = await sb.from("profiles").update({
    name: displayName, email,
    gender: spec.profile.gender, age: spec.profile.age,
    height_cm: spec.profile.height_cm, weight_kg: spec.profile.weight_kg,
    fitness_goal: spec.profile.fitness_goal,
  }).eq("id", uid);
  if (profErr) fail(`client ${spec.nn} profile`, profErr.message);

  let subId = null;
  const { data: sub, error: subErr } = await sb.from("subscriptions").insert({
    coach_id: coachId, client_id: uid, plan_id: planAI.id, status: "active", tier: spec.plan.tier,
    start_date: W5_MONDAY, end_date: null, payment_status: null,
  }).select("id").single();
  if (subErr) fail(`client ${spec.nn} subscription`, subErr.message);
  subId = sub.id;

  const { error: goalsErr } = await sb.from("user_goals").insert({ user_id: uid, ...spec.goals });
  if (goalsErr) fail(`client ${spec.nn} goals`, goalsErr.message);

  seeded.push({ spec, uid, subId, email, displayName });
  log("client", `${displayName} created (${spec.label})`);
}

// live workout_sessions.muscle_group CHECK set (probed 2026-10-03)
function muscleGroupFor(focus, firstExercise) {
  const f = focus.join(" ");
  const ex = firstExercise ?? "";
  const fromFocus = /quad|glute|hamstring|leg|calf/i.test(f) ? "legs"
    : /shoulder/i.test(f) ? "shoulders"
    : /chest/i.test(f) ? "chest"
    : /back/i.test(f) ? "back"
    : /arm|bicep|tricep/i.test(f) ? "arms"
    : /core|ab/i.test(f) ? "core"
    : null;
  if (fromFocus) return fromFocus;
  if (/squat|deadlift|lunge|leg press|leg curl|calf|hip thrust/i.test(ex)) return "legs";
  if (/row|pulldown|pull-up|shrug/i.test(ex)) return "back";
  if (/curl|pushdown|extension|skull/i.test(ex)) return "arms";
  if (/raise|press/i.test(ex)) return "shoulders";
  return "chest";
}

// ── 6) Workout programs via the app's atomic RPCs + history patch ────────────
const insertChunked = async (table, rows, chunk = 400) => {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + chunk));
    if (error) fail(`insert ${table}`, error.message);
  }
};
// daily_summary has a live trigger on workout_sessions that pre-creates rows
// for logged session dates — upsert (user_id, summary_date) merges cleanly.
const upsertChunked = async (table, rows, conflict, chunk = 400) => {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + chunk), { onConflict: conflict });
    if (error) fail(`upsert ${table}`, error.message);
  }
};

const wkStats = [];
for (const s of seeded) {
  const spec = s.spec;
  if (!spec.workout) { wkStats.push({ nn: spec.nn, sessions: 0, sets: 0 }); continue; }
  const w = spec.workout;
  const templateIdsByDay = [];
  for (const day of w.trainDays) {
    const { data: tplId, error } = await sb.rpc("create_workout_template_atomic", {
      p_coach_id: coachId, p_name: `${w.name} — ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day.day - 1]}`,
      p_target_muscles: day.focus, p_notes: w.desc,
      p_exercises: day.ex.map(([exercise_name, target_sets, target_reps, target_weight_kg, rest_sec], order_index) => ({
        exercise_name, target_sets, target_reps, target_weight_kg, rest_sec, notes: null, order_index,
      })),
    });
    if (error) fail(`workout template ${spec.nn}`, error.message);
    templateIdsByDay.push({ day: day.day, template_id: tplId, ex: day.ex, focus: day.focus });
  }
  const { data: programId, error: progErr } = await sb.rpc("upsert_coach_program_atomic", {
    p_program_id: null, p_coach_id: coachId, p_name: w.name, p_description: w.desc,
    p_days: templateIdsByDay.map((t, i) => ({ day_of_week: t.day, template_id: t.template_id, order_index: i })),
  });
  if (progErr) fail(`workout program ${spec.nn}`, progErr.message);
  const { data: enrollmentId, error: enrErr } = await sb.rpc("create_program_enrollment_atomic", {
    p_program_id: programId, p_coach_id: coachId, p_client_id: s.uid,
    p_start_date: w.start, p_duration_weeks: w.durationWeeks,
  });
  if (enrErr) fail(`workout enrollment ${spec.nn}`, enrErr.message);

  // History patch: statuses for elapsed assignments + sessions/sets/PRs.
  const { data: assignments } = await sb.from("workout_assignments")
    .select("id, template_id, scheduled_date, week_number").eq("enrollment_id", enrollmentId).order("scheduled_date");
  const tplById = new Map(templateIdsByDay.map((t) => [t.template_id, t]));
  let completedCount = 0, skippedCount = 0, missedCount = 0, upcomingCount = 0, startedCount = 0;
  let sessionCount = 0, setCount = 0;
  const sessionIds = [];
  const prBest = new Map(); // exercise_name → {max_weight, reps, date}
  for (const a of assignments ?? []) {
    const tpl = tplById.get(a.template_id);
    const isFuture = a.scheduled_date >= todayStr;
    if (isFuture) { upcomingCount++; continue; }
    const roll = rng();
    let status;
    if (roll < w.adherence.complete) status = "completed";
    else if (roll < w.adherence.complete + w.adherence.skip) status = "skipped";
    else status = "assigned"; // past + assigned = missed
    if (status !== "assigned") {
      const { error } = await sb.from("workout_assignments").update({ status }).eq("id", a.id);
      if (error) fail(`assignment status ${spec.nn}`, error.message);
    }
    if (status === "skipped") { skippedCount++; continue; }
    if (status === "assigned") { missedCount++; continue; }
    completedCount++;
    // Optional "started" flavor: small chance a completed slot is instead
    // left in-progress with a partial session (client closed the app mid-set).
    const isStarted = rng() < 0.06;
    const dur = range(w.duration[0], w.duration[1]);
    const startAt = new Date(`${a.scheduled_date}T${String(range(17, 20)).padStart(2, "0")}:${pickOne(["00", "15", "30", "45"])}:00Z`);
    const endAt = new Date(startAt.getTime() + dur * 60000);
    const { data: session, error: sessErr } = await sb.from("workout_sessions").insert({
      user_id: s.uid, assignment_id: a.id, session_name: w.name.replace("[AI] ", ""),
      // live CHECK allows: chest | back | legs | shoulders | arms | core
      muscle_group: muscleGroupFor(tpl?.focus ?? [], tpl?.ex?.[0]?.[0] ?? ""),
      duration_min: isStarted ? Math.round(dur * 0.6) : dur,
      session_date: a.scheduled_date, started_at: startAt.toISOString(), ended_at: endAt.toISOString(),
      notes: null,
    }).select("id").single();
    if (sessErr) fail(`session ${spec.nn}`, sessErr.message);
    sessionIds.push(session.id);
    sessionCount++;
    if (isStarted) {
      await sb.from("workout_assignments").update({ status: "started" }).eq("id", a.id);
      completedCount--; startedCount++;
    }
    const setRows = [];
    const exercises = tpl?.ex ?? [];
    const nEx = isStarted ? Math.max(1, Math.floor(exercises.length * 0.5)) : exercises.length;
    for (let ei = 0; ei < nEx; ei++) {
      const [exName, targetSets, targetReps, baseWeight] = exercises[ei];
      const progress = 1 + 0.02 * Math.max(0, (a.week_number ?? 1) - 1); // ~2%/week
      const rounding = /barbell|deadlift|squat|press/i.test(exName) ? 2.5 : 1;
      const nSets = isStarted ? Math.max(1, targetSets - 1) : (rng() < 0.12 ? Math.max(1, targetSets - 1) : targetSets);
      for (let sn = 1; sn <= nSets; sn++) {
        const reps = targetReps ? Math.max(1, targetReps + range(-1, 1)) : range(10, 15);
        const weightKg = baseWeight != null ? Math.round(baseWeight * progress / rounding) * rounding : null;
        setRows.push({
          session_id: session.id, user_id: s.uid, exercise_name: exName, set_number: sn,
          reps, weight_kg: weightKg, is_warmup: false,
          logged_at: new Date(startAt.getTime() + sn * 90000 + ei * 300000).toISOString(),
        });
        if (weightKg != null) {
          const cur = prBest.get(exName);
          if (!cur || weightKg > cur.max_weight) prBest.set(exName, { max_weight: weightKg, reps, achieved_date: a.scheduled_date });
        }
      }
      // one warmup set on the first loaded exercise of the session
      if (ei === 0 && baseWeight != null && !isStarted) {
        setRows.push({
          session_id: session.id, user_id: s.uid, exercise_name: exName, set_number: 1,
          reps: targetReps ?? 10, weight_kg: Math.round((baseWeight * 0.5) / 2.5) * 2.5, is_warmup: true,
          logged_at: new Date(startAt.getTime() + 60000).toISOString(),
        });
      }
    }
    await insertChunked("workout_sets", setRows);
    setCount += setRows.length;
  }
  // personal_records is a VIEW derived from workout_sets on the live DB —
  // PRs materialize automatically from the logged sets above.
  const prCount = prBest.size;
  wkStats.push({ nn: spec.nn, assignments: assignments?.length ?? 0, completed: completedCount, started: startedCount, skipped: skippedCount, missed: missedCount, upcoming: upcomingCount, sessions: sessionCount, sets: setCount, prs: prCount });
  log("workout", `${s.displayName}: ${completedCount}C/${startedCount}S/${skippedCount}Sk/${missedCount}M/${upcomingCount}U · ${sessionCount} sessions · ${setCount} sets · ${prCount} distinct lifts`);
}

// ── 7) Nutrition programs via the app's atomic RPCs + history patch ─────────
const nuStats = [];
for (const s of seeded) {
  const spec = s.spec;
  if (!spec.nutrition) { nuStats.push({ nn: spec.nn, planned: 0, completed: 0, skipped: 0, upcoming: 0, total: 0 }); continue; }
  const n = spec.nutrition;
  const tree = Object.entries(n.dayMap).map(([dayStr, variant]) => ({
    day_of_week: Number(dayStr), notes: null,
    meals: n.variants[variant].map(([mealName, picks]) => ({
      name: mealName,
      foods: picks.map(([foodName, qty]) => ({ food_id: foods[foodName].id, quantity: qty })),
    })),
  }));
  const { data: programId, error: progErr } = await sb.rpc("upsert_nutrition_program_atomic", {
    p_program_id: null, p_coach_id: coachId, p_name: n.name, p_description: n.desc, p_tree: tree,
  });
  if (progErr) fail(`nutrition program ${spec.nn}`, progErr.message);
  const { data: enrollmentId, error: enrErr } = await sb.rpc("create_nutrition_enrollment_atomic", {
    p_program_id: programId, p_coach_id: coachId, p_client_id: s.uid,
    p_start_date: n.start, p_duration_weeks: n.durationWeeks,
  });
  if (enrErr) fail(`nutrition enrollment ${spec.nn}`, enrErr.message);

  // History patch: statuses on elapsed meals (today + future stay 'assigned').
  const { data: meals } = await sb.from("nutrition_assignments")
    .select("id, scheduled_date").eq("enrollment_id", enrollmentId);
  let planned = 0, completed = 0, skipped = 0, upcoming = 0;
  for (const m of meals ?? []) {
    if (m.scheduled_date >= todayStr) { upcoming++; continue; }
    planned++;
    const dow = new Date(`${m.scheduled_date}T00:00:00Z`).getUTCDay();
    const isWeekend = dow === 5 || dow === 6 || dow === 0; // Fri/Sat/Sun (Egypt-style weekend window)
    const prof = (spec.nn === "07" && isWeekend && n.weekendAdherence) ? n.weekendAdherence : n.adherence;
    const roll = rng();
    let status = roll < prof.complete ? "completed" : roll < prof.complete + prof.skip ? "skipped" : "assigned";
    const { error } = await sb.from("nutrition_assignments").update({ status }).eq("id", m.id);
    if (error) fail(`meal status ${spec.nn}`, error.message);
    if (status === "completed") completed++;
    else if (status === "skipped") skipped++;
  }
  nuStats.push({ nn: spec.nn, planned, completed, skipped, upcoming, total: meals?.length ?? 0 });
  log("nutrition", `${s.displayName}: ${completed}/${planned} completed · ${skipped} skipped · ${upcoming} upcoming`);
}

// ── 8) Client modifications (Scenario C — client 07 only) ────────────────────
{
  const s = seeded.find((x) => x.spec.nn === "07");
  const { data: enr } = await sb.from("client_nutrition_enrollments")
    .select("id").eq("client_id", s.uid).eq("status", "active").maybeSingle();
  if (enr) {
    const changes = [
      { date: addDays(todayStr, -3), meal: "Dinner", orig: "Egyptian Rice (cooked)", type: "quantity", newFood: "Egyptian Rice (cooked)", newQty: 400 },
      { date: addDays(todayStr, -6), meal: "Dinner", orig: "Egyptian Rice (cooked)", type: "substitution", newFood: "Fried Rice (portion)", newQty: 1 },
      { date: addDays(todayStr, -8), meal: "Dinner", orig: "Grilled Chicken Breast", type: "quantity", newFood: "Grilled Chicken Breast", newQty: 120 },
      { date: addDays(todayStr, -10), meal: "Brunch", orig: "Greek Yogurt 2% (200g)", type: "removal", newFood: null, newQty: 0 },
      { date: addDays(todayStr, -4), meal: "Brunch", orig: null, type: "addition", newFood: "Milk chocolate (45g)", newQty: 45 },
    ];
    let applied = 0;
    for (const ch of changes) {
      if (ch.type === "addition") {
        const { data: mealRow } = await sb.from("nutrition_assignments")
          .select("id, order_index").eq("enrollment_id", enr.id).eq("scheduled_date", ch.date).eq("meal_name", ch.meal).maybeSingle();
        if (!mealRow) continue;
        const f = foods[ch.newFood];
        const mm = macrosOf(ch.newFood, ch.newQty);
        const { data: maxOrder } = await sb.from("nutrition_assignment_foods").select("order_index").eq("assignment_id", mealRow.id).order("order_index", { ascending: false }).limit(1);
        const { error } = await sb.from("nutrition_assignment_foods").insert({
          assignment_id: mealRow.id, template_food_id: null, food_id: f.id, food_name: f.name,
          serving_unit: f.serving_unit, serving_size: f.serving_size,
          original_quantity: ch.newQty, original_calories: mm.calories, original_protein_g: mm.protein_g,
          original_carbs_g: mm.carbs_g, original_fat_g: mm.fat_g,
          current_food_id: f.id, current_quantity: ch.newQty, current_calories: mm.calories,
          current_protein_g: mm.protein_g, current_carbs_g: mm.carbs_g, current_fat_g: mm.fat_g,
          change_type: "addition", changed_at: new Date(`${ch.date}T20:00:00Z`).toISOString(),
          order_index: (maxOrder?.[0]?.order_index ?? -1) + 1,
        });
        if (error) fail("change addition", error.message);
        await sb.from("nutrition_change_log").insert({
          enrollment_id: enr.id, coach_id: coachId, client_id: s.uid, plan_date: ch.date, meal_name: ch.meal,
          change_type: "addition", new_food_id: f.id, new_food_name: f.name, new_quantity: ch.newQty,
          source: "client_mobile", note: null,
        });
        applied++;
        continue;
      }
      const { data: row } = await sb.from("nutrition_assignments")
        .select("id").eq("enrollment_id", enr.id).eq("scheduled_date", ch.date).eq("meal_name", ch.meal).maybeSingle();
      if (!row) continue;
      const { data: foodRow } = await sb.from("nutrition_assignment_foods")
        .select("id, food_name, serving_size").eq("assignment_id", row.id).eq("food_name", ch.orig).maybeSingle();
      if (!foodRow) continue;
      const newFoodId = ch.newFood ? foods[ch.newFood].id : null;
      const mm = ch.newFood ? macrosOf(ch.newFood, ch.newQty) : null;
      const currentFields = ch.type === "removal"
        ? { current_food_id: null, current_quantity: 0, current_calories: 0, current_protein_g: 0, current_carbs_g: 0, current_fat_g: 0 }
        : {
            current_food_id: newFoodId, current_quantity: ch.newQty,
            current_calories: mm.calories, current_protein_g: mm.protein_g, current_carbs_g: mm.carbs_g, current_fat_g: mm.fat_g,
          };
      const { error } = await sb.from("nutrition_assignment_foods").update({
        change_type: ch.type, changed_at: new Date(`${ch.date}T20:00:00Z`).toISOString(), ...currentFields,
      }).eq("id", foodRow.id);
      if (error) fail("change update", error.message);
      await sb.from("nutrition_change_log").insert({
        enrollment_id: enr.id, coach_id: coachId, client_id: s.uid, plan_date: ch.date, meal_name: ch.meal,
        change_type: ch.type, original_food_name: ch.orig, original_quantity: ch.type === "quantity" ? 250 : null,
        new_food_id: ch.newFood ? foods[ch.newFood].id : null, new_food_name: ch.newFood, new_quantity: ch.newQty || null,
        source: "client_mobile", note: null,
      });
      applied++;
    }
    log("changes", `client 07: ${applied} client modifications applied`);
  }
}

// ── 9) Daily summaries, nutrition logs, body measurements ────────────────────
const summaryRows = [];
const logRows = [];
const measureRows = [];
for (const s of seeded) {
  const spec = s.spec;
  const w = spec.workout;
  const completedDates = new Set(
    (await sb.from("workout_sessions").select("session_date").eq("user_id", s.uid)).data?.map((r) => r.session_date) ?? []
  );
  const days = spec.nn === "08" ? 2 : 40;
  for (let d = 0; d < days; d++) {
    if (spec.nn !== "08" && rng() > (w?.summaryCoverage ?? 1)) continue;
    const date = addDays(todayStr, -d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const slip = rng() < (w?.summarySlipDays ?? 0) / 14;
    const weekendBinge = w?.weekendBinge && (dow === 5 || dow === 6);
    let cal;
    if (weekendBinge) cal = range(3100, 3700);
    else if (slip) cal = (w?.summaryCalories[1] ?? 2200) + (w?.slipBump ?? 400);
    else cal = range(w?.summaryCalories[0] ?? 1800, w?.summaryCalories[1] ?? 2100);
    const protein = Math.round(cal * (spec.nn === "06" ? 0.035 : spec.nn === "07" ? 0.05 : 0.075) * 10) / 10;
    const carbs = Math.round(cal * 0.42 * 10) / 10;
    const fat = Math.round(cal * 0.27 * 10) / 10;
    summaryRows.push({
      user_id: s.uid, summary_date: date,
      calories_consumed: cal, steps: range(w?.steps[0] ?? 4000, w?.steps[1] ?? 6000),
      calories_burned: range(250, 550), water_ml: range(w?.water[0] ?? 1500, w?.water[1] ?? 2500),
      sleep_hours: Math.round(range((w?.sleep[0] ?? 6.5) * 2, (w?.sleep[1] ?? 8) * 2)) / 2,
      workout_done: completedDates.has(date), workout_duration: completedDates.has(date) ? range(40, 70) : 0,
      protein_g: protein, carbs_g: carbs, fat_g: fat,
    });
  }
  // Food logs derived from the client's own plan (the live nutrition_logs
  // trigger aggregates logs into daily_summary.calories_consumed, so logs must
  // mirror the prescribed meals for the dashboard numbers to stay coherent).
  // Completed days log the full plan; skipped days log little/nothing; client
  // 09 has no plan and logs nothing.
  const MEAL_TYPE = { Breakfast: "breakfast", Brunch: "breakfast", Snack: "snack", Lunch: "lunch", Dinner: "dinner" }; // live CHECK set
  if (spec.nutrition) {
    const plan = spec.nutrition;
    const logDays = spec.nn === "08" ? 2 : 40;
    for (let d = 0; d < logDays; d++) {
      const date = addDays(todayStr, -d);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const isoDow = ((dow + 6) % 7) + 1; // ISO 1 = Monday
      const variant = plan.dayMap[isoDow];
      if (!variant) continue;
      const isWeekend = spec.nn === "07" && (isoDow === 6 || isoDow === 7);
      const prof = isWeekend && plan.weekendAdherence ? plan.weekendAdherence : plan.adherence;
      const roll = rng();
      const dayOutcome = roll < prof.complete ? "completed" : roll < prof.complete + prof.skip ? "skipped" : "partial";
      if (dayOutcome === "skipped" && rng() < 0.7) continue; // no logging at all
      for (const [mealName, picks] of plan.variants[variant]) {
        for (const [foodName, qty] of picks) {
          if (dayOutcome === "partial" && rng() < 0.45) continue;
          const f = foods[foodName];
          const mm = macrosOf(foodName, qty);
          logRows.push({
            user_id: s.uid, food_name: foodName, meal_type: MEAL_TYPE[mealName] ?? "snack", quantity: qty,
            serving_unit: f.serving_unit, calories: mm.calories, protein_g: mm.protein_g,
            carbs_g: mm.carbs_g, fat_g: mm.fat_g, logged_date: date,
          });
        }
      }
    }
  }
  // weekly body-measurement trend (last entry == profile weight)
  spec.weights.forEach((kg, i) => {
    measureRows.push({
      user_id: s.uid, measured_date: addDays(todayStr, -(spec.weights.length - 1 - i) * 7),
      weight_kg: kg, body_fat_pct: spec.bodyFat?.[i] ?? null, waist_cm: spec.waist?.[i] ?? null,
      notes: null,
    });
  });
  await sb.from("profiles").update({ weight_kg: spec.weights[spec.weights.length - 1] }).eq("id", s.uid);
}
// logs FIRST (their trigger recomputes daily_summary), then the summary
// upsert so the planned story is the final state on those rows.
await insertChunked("nutrition_logs", logRows);
await upsertChunked("daily_summary", summaryRows, "user_id,summary_date");
await insertChunked("body_measurements", measureRows);
log("logged data", `${summaryRows.length} summaries · ${logRows.length} nutrition logs · ${measureRows.length} measurements`);

// ── 10) Final report ──────────────────────────────────────────────────────────
console.log("\n[seed-ai] ═══ SEED REPORT ═══");
for (const st of wkStats) {
  console.log(`  workout  ${st.nn}: ${st.completed ?? 0} completed / ${st.started ?? 0} started / ${st.skipped ?? 0} skipped / ${st.missed ?? 0} missed / ${st.upcoming ?? 0} upcoming · ${st.sessions ?? 0} sessions · ${st.sets ?? 0} sets · ${st.prs ?? 0} PRs`);
}
for (const st of nuStats) {
  console.log(`  nutrition ${st.nn}: ${st.completed}/${st.planned} elapsed meals completed · ${st.skipped} skipped · ${st.upcoming} upcoming (total ${st.total})`);
}
console.log(`\n[seed-ai] DONE — ${seeded.length} AI test clients owned by the verified coach.`);
console.log("[seed-ai] All rows tagged: emails ai.test.client.*@coregym.test, names [AI] …");
