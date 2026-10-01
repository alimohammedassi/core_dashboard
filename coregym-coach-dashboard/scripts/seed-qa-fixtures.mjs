// ============================================================================
// CoreGym QA FIXTURE SEEDER — tagged synthetic data ONLY (docs directive §7/§8)
// Every row is identifiable:  coach name   = "CoreGym QA Coach"
//                             client emails = qa.client.NNN@coregym.test
//                             names         = "QA Client NNN"
//                             entity names  = "[QA] …"   (plus the pre-existing
//                             "[LOADTEST] UI QA Coach" manual-session rows)
// Service-role key stays in .env.local and is NEVER printed or bundled.
// Idempotent: re-running deletes the tagged set first (see cleanup-qa-fixtures).
// Rollback:  node scripts/cleanup-qa-fixtures.mjs
// ============================================================================
import { createClient } from "@supabase/supabase-js";


// Fixture credentials live in scripts/.qa-credentials.local.json (gitignored).
// Nothing in this file is a production secret. Env overrides supported.
import { readFileSync } from "node:fs";
function loadQaCredentials() {
  const file = new URL("./.qa-credentials.local.json", import.meta.url);
  let creds;
  try {
    creds = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.error("Missing scripts/.qa-credentials.local.json — see scripts/README-QA-FIXTURES.md");
    process.exit(1);
  }
  return {
    coachEmail: process.env.QA_COACH_EMAIL ?? creds.coachEmail,
    coachPassword: process.env.QA_COACH_PASSWORD ?? creds.coachPassword,
    clientPassword: process.env.QA_CLIENT_PASSWORD ?? creds.clientPasswordTemplate,
  };
}

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CLIENT_COUNT = 27;
const { coachEmail: QA_COACH_EMAIL, coachPassword: QA_COACH_PASSWORD, clientPassword: QA_PASSWORD } = loadQaCredentials();
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const ts = (d) => d.toISOString();

function log(step, msg) {
  console.log(`[seed] ${step}: ${msg}`);
}


// PostgREST URL length caps break giant .in() lists — chunk every large delete.
async function deleteInChunks(table, column, ids, extra) {
  let removed = 0;
  const list = ids ?? [];
  for (let i = 0; i < list.length; i += 50) {
    const slice = list.slice(i, i + 50);
    let q = sb.from(table).delete();
    if (extra) q = q.eq(extra.col, extra.val).like(extra.like.col, extra.like.pat);
    const { data, error } = await q.in(column, slice);
    if (error) throw new Error(`${table} chunk delete failed: ${error.message}`);
    removed += data?.length ?? 0;
  }
  return removed;
}


// ── 0) Wipe previous tagged fixtures (idempotency) ──────────────────────────
log("wipe", "removing previously tagged QA rows…");
{
  const { data: oldClients } = await sb.from("profiles").select("id").like("email", "qa.client.%@coregym.test");
  const ids = (oldClients ?? []).map((c) => c.id);
  if (ids.length > 0) {
    // child-first deletes scoped to this fixture set
    const convIds = (await sb.from("conversations").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
    if (convIds.length) await sb.from("messages").delete().in("conversation_id", convIds);
    await sb.from("conversations").delete().in("client_id", ids);
    const naIds = (await sb.from("nutrition_assignments").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
    if (naIds.length) await sb.from("nutrition_assignment_foods").delete().in("assignment_id", naIds);
    await sb.from("nutrition_assignments").delete().in("client_id", ids);
    await sb.from("client_nutrition_enrollments").delete().in("client_id", ids);
    const sessIds = (await sb.from("workout_sessions").select("id").in("user_id", ids)).data?.map((r) => r.id) ?? [];
    if (sessIds.length) await sb.from("workout_sets").delete().in("session_id", sessIds);
    await sb.from("workout_sessions").delete().in("user_id", ids);
    await sb.from("workout_assignments").delete().in("client_id", ids);
    await sb.from("client_program_enrollments").delete().in("client_id", ids);
    await sb.from("daily_summary").delete().in("user_id", ids);
    await sb.from("nutrition_logs").delete().in("user_id", ids);
    await sb.from("user_goals").delete().in("user_id", ids);
    await sb.from("subscriptions").delete().in("client_id", ids);
    await sb.from("payment_intents").delete().in("client_id", ids);
  }
  // coach-scoped fixture rows (programs BEFORE their templates — FK order)
  const { data: coachProf } = await sb.from("profiles").select("id").eq("email", QA_COACH_EMAIL).maybeSingle();
  if (coachProf) {
    const { data: cRow } = await sb.from("coaches").select("id").eq("user_id", coachProf.id).maybeSingle();
    if (cRow) {
      const nutriProgIds = [
        ...((await sb.from("nutrition_programs").select("id").eq("coach_id", cRow.id).like("name", "[LOADTEST]%")).data ?? []),
        ...((await sb.from("nutrition_programs").select("id").eq("coach_id", cRow.id).like("name", "[QA]%")).data ?? []),
      ].map((r) => r.id);
      const dayIds = nutriProgIds.length ? (await sb.from("nutrition_program_days").select("id").in("program_id", nutriProgIds)).data?.map((r) => r.id) ?? [] : [];
      const mealIds = dayIds.length ? (await sb.from("nutrition_program_meals").select("id").in("day_id", dayIds)).data?.map((r) => r.id) ?? [] : [];
      if (mealIds.length) await sb.from("nutrition_program_foods").delete().in("meal_id", mealIds);
      if (dayIds.length) await sb.from("nutrition_program_meals").delete().in("day_id", dayIds);
      if (nutriProgIds.length) await sb.from("nutrition_program_days").delete().in("program_id", nutriProgIds);
      if (nutriProgIds.length) await sb.from("nutrition_programs").delete().in("id", nutriProgIds);

      const progIds = [
        ...((await sb.from("coach_programs").select("id").eq("coach_id", cRow.id).like("name", "[LOADTEST]%")).data ?? []),
        ...((await sb.from("coach_programs").select("id").eq("coach_id", cRow.id).like("name", "[QA]%")).data ?? []),
      ].map((r) => r.id);
      if (progIds.length) await sb.from("coach_program_days").delete().in("program_id", progIds);
      if (progIds.length) await sb.from("coach_programs").delete().in("id", progIds);

      const tplIds = [
        ...((await sb.from("workout_templates").select("id").eq("coach_id", cRow.id).like("name", "[LOADTEST]%")).data ?? []),
        ...((await sb.from("workout_templates").select("id").eq("coach_id", cRow.id).like("name", "[QA]%")).data ?? []),
      ].map((r) => r.id);
      await deleteInChunks("workout_template_exercises", "template_id", tplIds);
      await deleteInChunks("workout_templates", "id", tplIds);

      await sb.from("subscription_plans").delete().eq("coach_id", cRow.id).like("name", "[QA]%");
      await sb.from("subscription_plans").delete().eq("coach_id", cRow.id).like("name", "[LOADTEST]%");
    }
  }
  // auth users last (profile rows are trigger-created from auth users)
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 500, page: 1 });
  for (const u of authList.users ?? []) {
    if ((u.email ?? "").startsWith("qa.client.")) await sb.auth.admin.deleteUser(u.id);
  }
  log("wipe", "done");
}

// ── 1) Coach identity ───────────────────────────────────────────────────────
const { data: coachProf } = await sb.from("profiles").select("id").eq("email", QA_COACH_EMAIL).single();
const coachUid = coachProf.id;
const { data: coachRow } = await sb.from("coaches").select("id").eq("user_id", coachUid).single();
const coachId = coachRow.id;
await sb.from("profiles").update({ name: "CoreGym QA Coach" }).eq("id", coachUid);
await sb.from("coaches").update({ is_active: true }).eq("id", coachId);
log("coach", `uid=${coachUid} coaches.id=${coachId}`);

// ── 2) QA clients (auth users → profiles) ───────────────────────────────────
const clients = [];
for (let i = 1; i <= CLIENT_COUNT; i++) {
  const nn = String(i).padStart(3, "0");
  const email = `qa.client.${nn}@coregym.test`;
  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: { name: `QA Client ${nn}` },
  });
  if (error) {
    // already exists (partial previous run): recover the id
    const { data: p } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!p) throw error;
    clients.push({ nn, id: p.id });
    continue;
  }
  await sb.from("profiles").update({ name: `QA Client ${nn}` }).eq("id", created.user.id);
  clients.push({ nn, id: created.user.id });
}
log("clients", `${clients.length} QA clients ready`);

// ── 3) Plans ────────────────────────────────────────────────────────────────
const { data: planElite } = await sb.from("subscription_plans").insert({
  coach_id: coachId, name: "[QA] Elite 1-on-1 Hypertrophy", price_usd: 350, duration_days: 30, max_clients: 20,
}).select("id").single();
const { data: planStrength } = await sb.from("subscription_plans").insert({
  coach_id: coachId, name: "[QA] Strength & Conditioning Pro", price_usd: 290, duration_days: 30, max_clients: 20,
}).select("id").single();
await sb.from("subscription_plans").insert({
  coach_id: coachId, name: "[QA] Nutrition & Recomp Protocol", price_usd: 220, duration_days: 30, max_clients: 15,
});
log("plans", "3 tagged plans");

// ── 4) Workout templates ────────────────────────────────────────────────────
const templateSpecs = [
  { name: "[QA] Heavy Upper Power A", muscles: ["Chest", "Back", "Arms"], exercises: [
    ["Barbell Bench Press", 4, 6, 100, 180], ["Weighted Pull-up", 4, 8, 12.5, 120],
    ["Incline DB Press", 3, 10, 30, 90], ["Chest-Supported Row", 3, 10, 55, 90],
  ] },
  { name: "[QA] Posterior Chain & Deadlift", muscles: ["Back", "Legs"], exercises: [
    ["Deadlift (Conventional)", 5, 3, 180, 240], ["Glute-Ham Raise", 4, 10, null, 90],
    ["Barbell Good Morning", 3, 8, 60, 120], ["Snatch-Grip Shrug", 3, 12, 70, 75],
  ] },
  { name: "[QA] Quad Dominant Volume", muscles: ["Legs", "Core"], exercises: [
    ["Barbell Back Squat", 5, 5, 140, 210], ["Bulgarian Split Squat", 3, 12, 24, 90],
    ["Leg Extension", 4, 15, 55, 60], ["Hanging Leg Raise", 3, 15, null, 60],
  ] },
  { name: "[QA] Athletic Explosiveness", muscles: ["Full Body", "Core"], exercises: [
    ["Power Clean", 5, 3, 80, 150], ["Box Jump", 4, 5, null, 90],
    ["Med-Ball Slam", 3, 10, 10, 60], ["Plank", 3, 1, null, 60],
  ] },
];
const templateIds = [];
for (const spec of templateSpecs) {
  const { data: t } = await sb.from("workout_templates").insert({
    coach_id: coachId, name: spec.name, target_muscles: spec.muscles, notes: "QA fixture template.",
  }).select("id").single();
  templateIds.push(t.id);
  await sb.from("workout_template_exercises").insert(
    spec.exercises.map(([exercise_name, sets, reps, weight, rest], exerciseIndex) => ({
      template_id: t.id, exercise_name, target_sets: sets, target_reps: reps,
      target_weight_kg: weight, rest_sec: rest, order_index: exerciseIndex,
    }))
  );
}
// lightweight fillers so the library exercises pagination (page size 20)
for (let i = 5; i <= 22; i++) {
  const { data: t } = await sb.from("workout_templates").insert({
    coach_id: coachId, name: `[QA] Accessory Circuit ${String(i).padStart(2, "0")}`,
    target_muscles: ["Arms"], notes: null,
  }).select("id").single();
  templateIds.push(t.id);
  await sb.from("workout_template_exercises").insert({
    template_id: t.id, exercise_name: "Cable Superset", target_sets: 3, target_reps: 12,
    target_weight_kg: 20, rest_sec: 60, order_index: 0,
  });
}
log("templates", `${templateIds.length}`);

// ── 5) Weekly program + days ────────────────────────────────────────────────
const { data: program } = await sb.from("coach_programs").insert({
  coach_id: coachId, name: "[QA] Hypertrophy Elite PPL", description: "QA fixture weekly split.", is_active: true,
}).select("id").single();
await sb.from("coach_program_days").insert([
  { program_id: program.id, day_of_week: 1, template_id: templateIds[0], order_index: 0 },
  { program_id: program.id, day_of_week: 3, template_id: templateIds[2], order_index: 1 },
  { program_id: program.id, day_of_week: 5, template_id: templateIds[1], order_index: 2 },
]);
log("program", "weekly PPL with Mon/Wed/Fri days");

// ── 6) Subscriptions (mixed statuses) ───────────────────────────────────────
const subRows = clients.map((c, i) => {
  // live enum = 'active' | 'cancelled' | 'expired' (trialing/past_due exist in
  // app labels only; the live DB type rejects them — verified by probe)
  const status = i < 20 ? "active" : i < 24 ? "cancelled" : "expired";
  return {
    coach_id: coachId, client_id: c.id, plan_id: i % 3 === 1 ? planStrength.id : planElite.id,
    status, tier: i < 10 ? "premium" : "standard",
    start_date: iso(daysAgo(30 + i)), payment_status: null,
  };
});
const { error: subErr } = await sb.from("subscriptions").insert(subRows);
if (subErr) throw subErr;
log("subscriptions", `${subRows.length} (20 active / 4 cancelled / 3 expired)`);

// ── 7) Program enrollment + assignments + sessions + sets ───────────────────
const { data: enrollment } = await sb.from("client_program_enrollments").insert({
  program_id: program.id, coach_id: coachId, client_id: clients[0].id,
  start_date: iso(daysAgo(21)), duration_weeks: 8, status: "active",
}).select("id").single();

const trainDays = [1, 3, 5]; // Mon/Wed/Fri
let sessionCount = 0, setCount = 0;
function datesForWeeks(weeks, start) {
  const out = [];
  for (let w = 0; w < weeks; w++) {
    for (const dow of trainDays) {
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7);
      while (d.getDay() !== dow % 7) d.setDate(d.getDate() + 1);
      out.push({ date: iso(d), week: w + 1, dow });
    }
  }
  return out;
}
const enrolledDates = datesForWeeks(4, daysAgo(21));
const assignRows = enrolledDates.map((slot) => ({
  template_id: templateIds[slot.dow === 1 ? 0 : slot.dow === 3 ? 2 : 1],
  coach_id: coachId, client_id: clients[0].id, program_id: program.id, enrollment_id: enrollment.id,
  scheduled_date: slot.date, week_number: slot.week,
  status: slot.date < iso(today) ? "completed" : "assigned",
}));
const { data: assignments } = await sb.from("workout_assignments").insert(assignRows).select("id, status, scheduled_date, template_id");

const liftProgress = [
  { name: "Barbell Bench Press", base: 92.5, step: 2.5 },
  { name: "Barbell Back Squat", base: 130, step: 5 },
  { name: "Deadlift (Conventional)", base: 160, step: 5 },
];
for (const a of assignments.filter((x) => x.status === "completed")) {
  const { data: session, error: ssErr } = await sb.from("workout_sessions").insert({
    user_id: clients[0].id, assignment_id: a.id,
    session_name: templateSpecs.find((t) => t.name.includes("Upper")) ? "QA Session" : "QA Session",
    muscle_group: sessionCount % 3 === 0 ? "chest" : sessionCount % 3 === 1 ? "legs" : "back",
    duration_min: 48 + (sessionCount % 4) * 5,
    session_date: a.scheduled_date, started_at: ts(new Date(a.scheduled_date + "T18:00:00Z")),
  }).select("id").single();
  if (!session) { throw new Error("session insert failed: " + JSON.stringify(ssErr ?? "data null")); }
  sessionCount++;
  const lift = liftProgress[sessionCount % liftProgress.length];
  const topWeight = lift.base + Math.floor(sessionCount / 2) * lift.step;
  const rows = [];
  for (let s = 1; s <= 4; s++) {
    rows.push({ session_id: session.id, user_id: clients[0].id, exercise_name: lift.name,
      set_number: s, reps: 6, weight_kg: topWeight, is_warmup: false,
      logged_at: ts(new Date(a.scheduled_date + "T18:30:00Z")) });
  }
  rows.push({ session_id: session.id, user_id: clients[0].id, exercise_name: lift.name,
    set_number: 1, reps: 8, weight_kg: Math.round(topWeight * 0.5), is_warmup: true,
    logged_at: ts(new Date(a.scheduled_date + "T18:05:00Z")) });
  await sb.from("workout_sets").insert(rows);
  setCount += rows.length;
}
log("assignments/sessions", `${assignments.length} assignments, ${sessionCount} sessions, ${setCount} sets`);

// ── 8) Client logged data (goals, daily summaries, nutrition logs) ──────────
await sb.from("user_goals").insert([
  { user_id: clients[0].id, daily_calories: 2900, daily_protein_g: 180, daily_steps: 9000, weekly_workouts: 4, target_weight_kg: 84 },
  { user_id: clients[1].id, daily_calories: 2200, daily_protein_g: 150, daily_steps: 8000, weekly_workouts: 3, target_weight_kg: 68 },
  { user_id: clients[2].id, daily_calories: 2600, daily_protein_g: 165, daily_steps: 10000, weekly_workouts: 5, target_weight_kg: 90 },
]);
const summaryRows = [];
for (const c of clients.slice(0, 3)) {
  for (let d = 0; d < 14; d++) {
    summaryRows.push({
      user_id: c.id, summary_date: iso(daysAgo(d)),
      calories_consumed: 2100 + ((d * 137) % 800), steps: 4200 + ((d * 911) % 7000),
      calories_burned: 380 + ((d * 53) % 300), water_ml: 1500 + ((d * 211) % 1500),
      sleep_hours: 6.5 + ((d % 4) * 0.5), workout_done: d % 2 === 0,
      protein_g: 120 + ((d * 31) % 70), carbs_g: 180 + ((d * 17) % 90), fat_g: 60 + ((d * 13) % 40),
    });
  }
}
await sb.from("daily_summary").insert(summaryRows);
const logRows = [];
for (const c of clients.slice(0, 2)) {
  for (let d = 0; d < 10; d++) {
    logRows.push({ user_id: c.id, food_name: "Grilled Chicken Breast", meal_type: "lunch",
      quantity: 200, serving_unit: "g", calories: 330, protein_g: 62, carbs_g: 0, fat_g: 7,
      logged_date: iso(daysAgo(d)) });
    logRows.push({ user_id: c.id, food_name: "Rolled Oats", meal_type: "breakfast",
      quantity: 80, serving_unit: "g", calories: 303, protein_g: 11, carbs_g: 54, fat_g: 5,
      logged_date: iso(daysAgo(d)) });
  }
}
await sb.from("nutrition_logs").insert(logRows);
log("logged data", `${summaryRows.length} summaries, ${logRows.length} nutrition logs`);

// ── 9) Nutrition program + enrollment + assignments ─────────────────────────
const { data: nutriProg } = await sb.from("nutrition_programs").insert({
  coach_id: coachId, name: "[QA] Lean Bulk Blueprint", description: "QA fixture meal plan.", is_active: true,
}).select("id").single();
const { data: foods } = await sb.from("foods").select("id, name, serving_unit, serving_size, calories, protein_g, carbs_g, fat_g")
  .ilike("name", "%chicken%").limit(1);
const { data: oats } = await sb.from("foods").select("id, name, serving_unit, serving_size, calories, protein_g, carbs_g, fat_g")
  .ilike("name", "%oat%").limit(1);
const { data: rice } = await sb.from("foods").select("id, name, serving_unit, serving_size, calories, protein_g, carbs_g, fat_g")
  .ilike("name", "%rice%").limit(1);
const pickedFoods = [foods?.[0], oats?.[0], rice?.[0]].filter(Boolean);
const { data: nDay } = await sb.from("nutrition_program_days").insert({ program_id: nutriProg.id, day_of_week: 1, notes: null }).select("id").single();
const mealDefs = [
  { name: "Breakfast", order_index: 0, picks: [pickedFoods[1], pickedFoods[2]] },
  { name: "Lunch", order_index: 1, picks: [pickedFoods[0], pickedFoods[2]] },
];
let assignCount = 0;
if (pickedFoods.length >= 2) {
  const { data: nutriEnr } = await sb.from("client_nutrition_enrollments").insert({
    program_id: nutriProg.id, coach_id: coachId, client_id: clients[0].id,
    start_date: iso(daysAgo(7)), duration_weeks: 4, status: "active",
  }).select("id").single();
  for (const def of mealDefs) {
    if (!def.picks[0]) continue;
    const { data: meal } = await sb.from("nutrition_program_meals").insert({
      day_id: nDay.id, name: def.name, order_index: def.order_index,
    }).select("id").single();
    await sb.from("nutrition_program_foods").insert(def.picks.map((f, idx) => ({
      meal_id: meal.id, food_id: f.id, quantity: f.serving_size ?? 100, order_index: idx,
    })));
    for (let d = 0; d < 7; d++) {
      const day = daysAgo(6 - d);
      const { data: na } = await sb.from("nutrition_assignments").insert({
        enrollment_id: nutriEnr.id, coach_id: coachId, client_id: clients[0].id,
        scheduled_date: iso(day), week_number: 1, program_meal_id: meal.id,
        meal_name: def.name, order_index: def.order_index,
        status: d < 6 ? "completed" : "assigned",
      }).select("id").single();
      assignCount++;
      await sb.from("nutrition_assignment_foods").insert(def.picks.map((f, idx) => ({
        assignment_id: na.id, food_id: f.id, food_name: f.name,
        serving_unit: f.serving_unit, serving_size: f.serving_size,
        original_quantity: f.serving_size ?? 100,
        original_calories: f.calories, original_protein_g: f.protein_g,
        original_carbs_g: f.carbs_g, original_fat_g: f.fat_g,
        current_food_id: f.id, current_quantity: f.serving_size ?? 100,
        current_calories: f.calories, current_protein_g: f.protein_g,
        current_carbs_g: f.carbs_g, current_fat_g: f.fat_g,
        order_index: idx,
      })));
    }
  }
}
log("nutrition", `program + ${assignCount} meal assignments`);

// ── 10) Conversations + messages (unread badges for the roster) ─────────────
const convSpecs = clients.slice(0, 10);
for (let i = 0; i < convSpecs.length; i++) {
  const c = convSpecs[i];
  const unread = i === 0 ? 2 : i === 2 ? 1 : 0;
  const lastAt = new Date(today.getTime() - i * 3600_000);
  const { data: conv } = await sb.from("conversations").insert({
    client_id: c.id, coach_id: coachUid, subscription_id: null,
    last_message: i === 0 ? "Coach, just crushed the squat session!" : `QA check-in message ${i + 1}`,
    last_message_at: ts(lastAt), coach_unread: unread, client_unread: 0, is_active: true,
  }).select("id").single();
  const msgs = [];
  for (let m = 0; m < 4; m++) {
    const fromClient = m % 2 === 0;
    msgs.push({
      conversation_id: conv.id, sender_id: fromClient ? c.id : coachUid,
      content: fromClient
        ? ["Hey coach! Morning check-in done.", "Feeling strong this week.", "Can we review my squat depth?", `QA message ${m + 1}`][m % 4]
        : ["Great work — keep the cadence.", "Noted, I'll update Friday's session.", "Solid progress on volume.", `QA reply ${m + 1}`][m % 4],
      type: "text",
      is_read: !(fromClient && m >= 4 - unread - 1),
      created_at: ts(new Date(lastAt.getTime() - (4 - m) * 600_000)),
    });
  }
  await sb.from("messages").insert(msgs);
}
log("chat", `10 conversations, unread badges on 2`);

// ── 11) Payment intents (revenue ledger) ────────────────────────────────────
const payRows = clients.slice(0, 10).map((c, i) => ({
  stripe_payment_id: `pi_qa_${String(i).padStart(3, "0")}`,
  coach_id: coachId, client_id: c.id,
  amount: [35000, 29000, 35000, 22000, 29000, 35000, 22000, 29000, 35000, 29000][i],
  currency: "usd", status: i === 9 ? "pending" : "succeeded",
  created_at: ts(daysAgo(i * 3)),
}));
{ const { error: payErr } = await sb.from("payment_intents").insert(payRows); if (payErr) throw payErr; }
log("payments", `${payRows.length} intents (9 succeeded / 1 pending)`);

console.log("\n[seed] DONE — fixtures tagged [QA]/[LOADTEST] and owned by CoreGym QA Coach.");
console.log("[seed] Coach login: see scripts/.qa-credentials.local.json");
console.log("[seed] Client logins: qa.client.NNN@coregym.test (password in scripts/.qa-credentials.local.json)");
console.log("[seed] Rollback: node scripts/cleanup-qa-fixtures.mjs");
