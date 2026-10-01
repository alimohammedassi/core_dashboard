// ============================================================================
// CoreGym QA FIXTURE CLEANUP — removes every row created by seed-qa-fixtures
// plus the earlier manual "[LOADTEST]" session rows. FK-safe order.
// Rollback companion of scripts/seed-qa-fixtures.mjs (directive §7).
// Keeps the QA coach identity (coaches row / onboarding / role) so the seeder
// can re-run against the same account; see the note at the bottom.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const n = (r) => r?.length ?? 0;

// PostgREST URL length caps break giant .in() lists — chunk every large delete.
async function deleteInChunks(table, column, ids) {
  let removed = 0;
  const list = ids ?? [];
  for (let i = 0; i < list.length; i += 50) {
    const { data, error } = await sb.from(table).delete().in(column, list.slice(i, i + 50));
    if (error) throw new Error(`${table} chunk delete failed: ${error.message}`);
    removed += data?.length ?? 0;
  }
  return removed;
}

const { data: coachProf } = await sb.from("profiles").select("id").eq("email", "loadtest+uiqa@coregym.test").maybeSingle();
let coachId = null;
if (coachProf) {
  const { data: c } = await sb.from("coaches").select("id").eq("user_id", coachProf.id).maybeSingle();
  coachId = c?.id ?? null;
}

// ── 1) client-scoped fixture data ───────────────────────────────────────────
const { data: clients } = await sb.from("profiles").select("id").like("email", "qa.client.%@coregym.test");
const ids = (clients ?? []).map((c) => c.id);
if (ids.length) {
  const convIds = (await sb.from("conversations").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("messages:", n((await sb.from("messages").delete().in("conversation_id", convIds)).data));
  console.log("conversations:", n((await sb.from("conversations").delete().in("client_id", ids)).data));
  const naIds = (await sb.from("nutrition_assignments").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("nutrition_assignment_foods:", await deleteInChunks("nutrition_assignment_foods", "assignment_id", naIds));
  console.log("nutrition_assignments:", await deleteInChunks("nutrition_assignments", "id", naIds));
  console.log("client_nutrition_enrollments:", n((await sb.from("client_nutrition_enrollments").delete().in("client_id", ids)).data));
  const sessIds = (await sb.from("workout_sessions").select("id").in("user_id", ids)).data?.map((r) => r.id) ?? [];
  console.log("workout_sets:", await deleteInChunks("workout_sets", "session_id", sessIds));
  console.log("workout_sessions:", await deleteInChunks("workout_sessions", "id", sessIds));
  console.log("workout_assignments:", await deleteInChunks("workout_assignments", "id",
    (await sb.from("workout_assignments").select("id").in("client_id", ids)).data?.map((r) => r.id) ?? []));
  console.log("client_program_enrollments:", n((await sb.from("client_program_enrollments").delete().in("client_id", ids)).data));
  console.log("daily_summary:", n((await sb.from("daily_summary").delete().in("user_id", ids)).data));
  console.log("nutrition_logs:", n((await sb.from("nutrition_logs").delete().in("user_id", ids)).data));
  console.log("user_goals:", n((await sb.from("user_goals").delete().in("user_id", ids)).data));
  console.log("subscriptions:", n((await sb.from("subscriptions").delete().in("client_id", ids)).data));
  console.log("payment_intents:", n((await sb.from("payment_intents").delete().in("client_id", ids)).data));
  console.log("body_measurements:", n((await sb.from("body_measurements").delete().in("user_id", ids)).data));
}

// ── 2) coach-scoped fixture rows (programs BEFORE their templates — FK order)
if (coachId) {
  const nutriProgIds = [
    ...((await sb.from("nutrition_programs").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data ?? []),
    ...((await sb.from("nutrition_programs").select("id").eq("coach_id", coachId).like("name", "[LOADTEST]%")).data ?? []),
  ].map((r) => r.id);
  const dayIds = nutriProgIds.length ? (await sb.from("nutrition_program_days").select("id").in("program_id", nutriProgIds)).data?.map((r) => r.id) ?? [] : [];
  const mealIds = dayIds.length ? (await sb.from("nutrition_program_meals").select("id").in("day_id", dayIds)).data?.map((r) => r.id) ?? [] : [];
  console.log("nutrition_program_foods:", await deleteInChunks("nutrition_program_foods", "meal_id", mealIds));
  console.log("nutrition_program_meals:", await deleteInChunks("nutrition_program_meals", "day_id", dayIds));
  console.log("nutrition_program_days:", await deleteInChunks("nutrition_program_days", "program_id", nutriProgIds));
  console.log("nutrition_programs:", await deleteInChunks("nutrition_programs", "id", nutriProgIds));

  const progIds = [
    ...((await sb.from("coach_programs").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data ?? []),
    ...((await sb.from("coach_programs").select("id").eq("coach_id", coachId).like("name", "[LOADTEST]%")).data ?? []),
  ].map((r) => r.id);
  console.log("coach_program_days:", await deleteInChunks("coach_program_days", "program_id", progIds));
  console.log("coach_programs:", await deleteInChunks("coach_programs", "id", progIds));

  const tplIds = [
    ...((await sb.from("workout_templates").select("id").eq("coach_id", coachId).like("name", "[QA]%")).data ?? []),
    ...((await sb.from("workout_templates").select("id").eq("coach_id", coachId).like("name", "[LOADTEST]%")).data ?? []),
  ].map((r) => r.id);
  console.log("workout_template_exercises:", await deleteInChunks("workout_template_exercises", "template_id", tplIds));
  console.log("workout_templates:", await deleteInChunks("workout_templates", "id", tplIds));

  console.log("subscription_plans:", n((await sb.from("subscription_plans").delete().eq("coach_id", coachId).like("name", "[QA]%")).data));
  console.log("subscription_plans(loadtest):", n((await sb.from("subscription_plans").delete().eq("coach_id", coachId).like("name", "[LOADTEST]%")).data));
  console.log("Coach identity kept (coaches row, onboarding, role) so the seeder can re-run.");
}

// ── 3) auth users for QA clients (profiles are trigger-created → gone with user)
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
console.log("To remove the QA coach entirely, delete its coaches/onboarding rows");
console.log("and the loadtest+uiqa auth user via the Supabase dashboard.");
console.log("DONE.");
