// ============================================================================
// CoreGym QA FIXTURE CLEANUP — removes every row created by seed-qa-fixtures
// (plus the earlier manual "[LOADTEST]" session rows). FK-safe order.
// Rollback companion of scripts/seed-qa-fixtures.mjs (directive §7).
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const NOID = "00000000-0000-0000-0000-000000000000";
const n = (r) => r?.length ?? 0;

const { data: coachProf } = await sb.from("profiles").select("id").eq("email", "loadtest+uiqa@coregym.test").maybeSingle();
let coachId = null;
if (coachProf) {
  const { data: c } = await sb.from("coaches").select("id").eq("user_id", coachProf.id).maybeSingle();
  coachId = c?.id ?? null;
}

// 1) client-scoped fixture data
const { data: clients } = await sb.from("profiles").select("id").like("email", "qa.client.%@coregym.test");
const ids = (clients ?? []).map((c) => c.id);
if (ids.length) {
  const convIds = (await sb.from("conversations").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("messages:", n((await sb.from("messages").delete().in("conversation_id", convIds.length ? convIds : [NOID])).data));
  console.log("conversations:", n((await sb.from("conversations").delete().in("client_id", ids)).data));
  const naIds = (await sb.from("nutrition_assignments").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("nutrition_assignment_foods:", n((await sb.from("nutrition_assignment_foods").delete().in("assignment_id", naIds.length ? naIds : [NOID])).data));
  console.log("nutrition_assignments:", n((await sb.from("nutrition_assignments").delete().in("client_id", ids)).data));
  console.log("client_nutrition_enrollments:", n((await sb.from("client_nutrition_enrollments").delete().in("client_id", ids)).data));
  const sessIds = (await sb.from("workout_sessions").select("id").in("user_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("workout_sets:", n((await sb.from("workout_sets").delete().in("session_id", sessIds.length ? sessIds : [NOID])).data));
  console.log("workout_sessions:", n((await sb.from("workout_sessions").delete().in("user_id", ids)).data));
  console.log("workout_assignments:", n((await sb.from("workout_assignments").delete().in("client_id", ids)).data));
  console.log("client_program_enrollments:", n((await sb.from("client_program_enrollments").delete().in("client_id", ids)).data));
  console.log("daily_summary:", n((await sb.from("daily_summary").delete().in("user_id", ids)).data));
  console.log("nutrition_logs:", n((await sb.from("nutrition_logs").delete().in("user_id", ids)).data));
  console.log("user_goals:", n((await sb.from("user_goals").delete().in("user_id", ids)).data));
  console.log("subscriptions:", n((await sb.from("subscriptions").delete().in("client_id", ids)).data));
  console.log("payment_intents:", n((await sb.from("payment_intents").delete().in("client_id", ids)).data));
  console.log("body_measurements:", n((await sb.from("body_measurements").delete().in("user_id", ids)).data));
}

// 2) coach-scoped fixture rows
if (coachId) {
  const nutriProgIds = (await sb.from("nutrition_programs").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data?.map((r) => r.id) ?? [];
  const dayIds = nutriProgIds.length ? (await sb.from("nutrition_program_days").select("id").in("program_id", nutriProgIds)).data?.map((r) => r.id) ?? [] : [];
  const mealIds = dayIds.length ? (await sb.from("nutrition_program_meals").select("id").in("day_id", dayIds)).data?.map((r) => r.id) ?? [] : [];
  console.log("nutrition_program_foods:", n((await sb.from("nutrition_program_foods").delete().in("meal_id", mealIds.length ? mealIds : [NOID])).data));
  console.log("nutrition_program_meals:", n((await sb.from("nutrition_program_meals").delete().in("day_id", dayIds.length ? dayIds : [NOID])).data));
  console.log("nutrition_program_days:", n((await sb.from("nutrition_program_days").delete().in("program_id", nutriProgIds.length ? nutriProgIds : [NOID])).data));
  console.log("nutrition_programs:", n((await sb.from("nutrition_programs").delete().in("id", nutriProgIds.length ? nutriProgIds : [NOID])).data));

  const loadTplIds = (await sb.from("workout_templates").select("id").eq("coach_id", coachId).like("name", "[LOADTEST]%")).data?.map((r) => r.id) ?? [];
  const qaTplIds = (await sb.from("workout_templates").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data?.map((r) => r.id) ?? [];
  const tplIds = [...loadTplIds, ...qaTplIds];
  console.log("workout_template_exercises:", n((await sb.from("workout_template_exercises").delete().in("template_id", tplIds.length ? tplIds : [NOID])).data));
  console.log("workout_templates:", n((await sb.from("workout_templates").delete().in("id", tplIds.length ? tplIds : [NOID])).data));

  const loadProgIds = (await sb.from("coach_programs").select("id").eq("coach_id", coachId).like("name", "[LOADTEST]%")).data?.map((r) => r.id) ?? [];
  const qaProgIds = (await sb.from("coach_programs").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data?.map((r) => r.id) ?? [];
  const progIds = [...loadProgIds, ...qaProgIds];
  console.log("coach_program_days:", n((await sb.from("coach_program_days").delete().in("program_id", progIds.length ? progIds : [NOID])).data));
  console.log("coach_programs:", n((await sb.from("coach_programs").delete().in("id", progIds.length ? progIds : [NOID])).data));

  console.log("subscription_plans:", n((await sb.from("subscription_plans").delete().eq("coach_id", coachId).like("name", "[QA]%")).data));
  console.log("subscription_plans(loadtest):", n((await sb.from("subscription_plans").delete().eq("coach_id", coachId).like("name", "[LOADTEST]%")).data));

  // remove the QA coach rows themselves + onboarding (keep auth user so the
  // login still works for future QA; owners can delete via Auth admin too)
  if (coachProf) {
    console.log("coach_onboarding:", n((await sb.from("coach_onboarding").delete().eq("user_id", coachProf.id)).data));
    console.log("coaches:", n((await sb.from("coaches").delete().eq("user_id", coachProf.id)).data));
    console.log("profile reset to client role:", (await sb.from("profiles").update({ role: "client" }).eq("id", coachProf.id)).error?.message ?? "ok");
  }
}

// 3) auth users for QA clients (profiles are trigger-created → gone with user)
const { data: authList } = await sb.auth.admin.listUsers({ perPage: 500, page: 1 });
let removed = 0;
for (const u of authList.users ?? []) {
  if ((u.email ?? "").startsWith("qa.client.")) {
    await sb.auth.admin.deleteUser(u.id);
    removed++;
  }
}
console.log("auth users removed:", removed);
console.log("QA coach auth user kept for future QA: loadtest+uiqa@coregym.test");
console.log("DONE.");
