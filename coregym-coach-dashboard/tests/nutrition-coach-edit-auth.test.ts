import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Static authorization audit for the F3 coach meal-edit RPC
// (nutrition_coach_meal_edit_migration.sql, finalizes the pending
// nutrition_coach_edits_migration.sql). The dashboard route
// POST/DELETE /api/nutrition-assignments/[id]/foods calls it via
// service_role after verifying assignment ownership; direct JWT callers
// must own the coach row behind the target assignment. No database required.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE = path.join(HERE, "..", "supabase");

const FILE = "nutrition_coach_meal_edit_migration.sql";
const FN = "apply_coach_meal_edit";
const SIG = "(uuid, text, uuid, numeric, uuid, text)";

function read(name: string): string {
  return readFileSync(path.join(SUPABASE, name), "utf8");
}

function bodyOf(sql: string, fn: string): string {
  const re = new RegExp(
    "create or replace function public\\." + fn + "\\([\\s\\S]*?\\)\\s+returns\\s[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$;",
    ""
  );
  const m = re.exec(sql);
  assert.ok(m, `function ${fn} must be defined`);
  return m![1];
}

describe("F3 apply_coach_meal_edit authorization", () => {
  it("has the exact expected signature", () => {
    const sql = read(FILE);
    assert.ok(
      sql.includes(`create or replace function public.${FN}(`),
      "function defined"
    );
    assert.ok(sql.includes("p_assignment_id uuid"), "assignment id arg");
    assert.ok(sql.includes("p_action text"), "action arg");
    assert.ok(sql.includes("p_assignment_food_id uuid"), "assignment food id arg");
    assert.ok(sql.includes(`revoke all on function public.${FN}${SIG} from public, anon;`), "revoke matches");
    assert.ok(
      sql.includes(`grant execute on function public.${FN}${SIG} to authenticated, service_role;`),
      "grant matches"
    );
  });

  it("enforces coach ownership in-body with service_role bypass", () => {
    const body = bodyOf(read(FILE), FN);
    assert.ok(body.includes("auth.role() <> 'service_role'"), "service_role bypass present");
    assert.ok(body.includes("user_id = auth.uid()"), "resolves via coaches.user_id");
    assert.ok(body.includes("v_assignment.coach_id"), "ownership derived from the target meal row");
    assert.ok(
      body.includes("raise exception 'Not authorized for this coach'"),
      "fails closed with an exception"
    );
  });

  it("preserves the edit-window business logic", () => {
    const body = bodyOf(read(FILE), FN);
    assert.ok(body.includes("Edits are allowed only on active enrollments"), "active enrollment required");
    assert.ok(body.includes("Completed meals cannot be edited"), "completed guard");
    assert.ok(body.includes("Past meals cannot be edited"), "past guard");
    assert.ok(body.includes("'addition'") && body.includes("'removal'"), "history tags preserved");
  });

  it("stays SECURITY DEFINER with explicit search_path", () => {
    const sql = read(FILE);
    const def = sql.slice(0, sql.indexOf("as $$")).toLowerCase();
    assert.ok(def.includes("security definer"), "remains SECURITY DEFINER");
    assert.ok(def.includes("set search_path"), "sets an explicit search_path");
  });

  it("has exactly one definition anywhere in supabase/ (pending file superseded)", () => {
    const files = readdirSync(SUPABASE).filter((f) => f.endsWith(".sql"));
    let count = 0;
    for (const f of files) {
      const re = new RegExp("create or replace function public\\." + FN + "\\(", "g");
      count += (read(f).match(re) ?? []).length;
    }
    assert.equal(count, 1, "exactly one definition (grants are signature-specific)");
  });

  it("no grant exposes public execution", () => {
    const sql = read(FILE);
    assert.ok(!sql.match(/grant execute[^;]*to public/i), "no grant to public");
  });
});
