import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
for (const t of ["subscriptions","workout_assignments","workout_sessions","workout_sets","payment_intents","conversations","messages","user_goals","daily_summary","nutrition_logs","client_program_enrollments","nutrition_programs","nutrition_program_days","nutrition_program_meals","nutrition_program_foods","nutrition_assignments","nutrition_assignment_foods","foods"]) {
  const { data, error } = await sb.from(t).select("*").limit(1);
  if (error) { console.log(t, "ERR", error.message.slice(0, 80)); continue; }
  console.log(t, "::", data[0] ? Object.keys(data[0]).join(",") : "(empty)");
}
