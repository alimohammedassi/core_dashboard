// READ-ONLY: logs in as the QA coach and queries PostgREST exactly like the
// dashboard's user-context client does. JWT kept in memory only.
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim();
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "apikey": anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "loadtest+uiqa@coregym.test", password: "UiQa!C0ach#2026x" }),
});
const session = await login.json();
if (!session.access_token) { console.log("LOGIN FAILED:", login.status, JSON.stringify(session).slice(0, 200)); process.exit(1); }
const jwt = session.access_token;
const coachId = "e7f7b76b-001e-412d-bc4d-aebe4021dfcd";

async function count(table, filter) {
  const r = await fetch(`${url}/rest/v1/${table}?${filter}&select=id,name`, {
    headers: { apikey: anon, Authorization: `Bearer ${jwt}`, Prefer: "count=exact", Range: "0-4" },
  });
  const range = r.headers.get("content-range") ?? "n/a";
  const body = await r.json();
  return `${table}: status=${r.status} count=${range} rows=${JSON.stringify(body).slice(0, 120)}`;
}
console.log(await count("workout_templates", `coach_id=eq.${coachId}`));
console.log(await count("subscription_plans", `coach_id=eq.${coachId}`));
console.log(await count("coach_programs", `coach_id=eq.${coachId}`));
console.log(await count("subscriptions", `coach_id=eq.${coachId}`));
