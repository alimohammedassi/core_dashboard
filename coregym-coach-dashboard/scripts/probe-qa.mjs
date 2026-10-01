// READ-ONLY diagnostic probe for the QA fixture account. Uses the service
// role key from .env.local — server-side only, never printed or bundled.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const { data: prof } = await sb.from("profiles").select("id, email, role").eq("email", "loadtest+uiqa@coregym.test").maybeSingle();
console.log("profile:", prof);
if (!prof) process.exit(0);
const uid = prof.id;

const { data: coach } = await sb.from("coaches").select("id, user_id, is_active, created_at").eq("user_id", uid).maybeSingle();
console.log("coaches row:", coach);

const { data: onb } = await sb.from("coach_onboarding").select("display_name, is_completed").eq("user_id", uid).maybeSingle();
console.log("coach_onboarding:", onb);

const coachId = coach?.id ?? null;
for (const [table, label] of [
  ["workout_templates", "templates"],
  ["subscription_plans", "plans"],
  ["coach_programs", "programs"],
  ["nutrition_programs", "nutrition programs"],
]) {
  const byCoach = coachId
    ? await sb.from(table).select("id, name").eq("coach_id", coachId).limit(5)
    : { data: [] };
  const byUid = await sb.from(table).select("id, name").eq("coach_id", uid).limit(5);
  console.log(`${label}: by-coaches.id=${byCoach.data?.length ?? 0} [${(byCoach.data ?? []).map((r) => r.name).join(", ")}] · by-uid=${byUid.data?.length ?? 0} [${(byUid.data ?? []).map((r) => r.name).join(", ")}]`);
}

const { data: recent } = await sb
  .from("coaches")
  .select("id, user_id, is_active, created_at")
  .gte("created_at", "2026-09-28")
  .order("created_at", { ascending: false })
  .limit(6);
console.log("recent coaches rows:", recent);
