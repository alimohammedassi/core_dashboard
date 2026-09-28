import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Static authorization audit for the 5 workout/program SECURITY DEFINER RPCs
// (Migration #7 fix). Parses the migration SQL and asserts every function
// body enforces auth.uid() → coaches.user_id → coaches.id before mutating,
// with a service_role bypass for the dashboard server routes, and that the
// REVOKE/GRANT blocks match the exact CREATE signatures (PostgreSQL
// privileges are signature-specific). No database required.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE = path.join(HERE, "..", "supabase");

const FILES = ["workout_templates_migration.sql", "coach_programs_migration.sql"];

const TARGETS: Record<string, string> = {
  create_workout_template_atomic: "workout_templates_migration.sql",
  update_workout_template_atomic: "workout_templates_migration.sql",
  upsert_coach_program_atomic: "coach_programs_migration.sql",
  create_program_enrollment_atomic: "coach_programs_migration.sql",
  regenerate_remaining_enrollment_assignments: "coach_programs_migration.sql",
};

function read(name: string): string {
  return readFileSync(path.join(SUPABASE, name), "utf8");
}

function bodyOf(sql: string, fn: string): string {
  const re = new RegExp(
    "create or replace function public\\." + fn + "\\([\\s\\S]*?\\) returns [\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;",
    ""
  );
  const m = re.exec(sql);
  assert.ok(m, `function ${fn} must be defined`);
  return m![1];
}

function argTypes(sql: string, fn: string): string[] {
  const re = new RegExp("create or replace function public\\." + fn + "\\(([\\s\\S]*?)\\) returns", "");
  const m = re.exec(sql);
  assert.ok(m, `signature of ${fn} must be parseable`);
  // strip -- comments, then take the type (last token) of each arg
  const cleaned = m![1].replace(/--[^\n]*/g, "");
  return cleaned
    .split(",")
    .map((a) => a.trim().split(/\s+/).pop()!.toLowerCase())
    .filter(Boolean);
}

describe("Migration #7 RPC authorization", () => {
  for (const [fn, file] of Object.entries(TARGETS)) {
    it(`${fn} enforces auth.uid() ownership in-body`, () => {
      const body = bodyOf(read(file), fn);
      assert.ok(body.includes("auth.role() <> 'service_role'"), "service_role bypass present");
      assert.ok(body.includes("user_id = auth.uid()"), "resolves via coaches.user_id");
      assert.ok(body.includes("from coaches"), "checks the coaches table");
      assert.ok(
        body.includes("raise exception 'Not authorized for this coach'"),
        "fails closed with an exception"
      );
    });

    it(`${fn} grant block matches the exact CREATE signature`, () => {
      const sql = read(file);
      const sig = "(" + argTypes(sql, fn).join(", ") + ")";
      assert.ok(
        sql.includes(`revoke all on function public.${fn}${sig} from public, anon;`),
        `revoke matches ${sig}`
      );
      assert.ok(
        sql.includes(`grant execute on function public.${fn}${sig} to authenticated, service_role;`),
        `grant matches ${sig}`
      );
    });
  }

  it("update_workout_template_atomic resolves the owner from the row (no coach param)", () => {
    const body = bodyOf(read("workout_templates_migration.sql"), "update_workout_template_atomic");
    assert.ok(
      body.includes("from workout_templates where id = p_template_id"),
      "owner resolved from the template row"
    );
    assert.ok(body.includes("v_coach_id is null"), "unknown ids fail closed");
  });

  it("no overloads of the 5 functions exist anywhere in supabase/", () => {
    const files = readdirSync(SUPABASE).filter((f) => f.endsWith(".sql"));
    for (const fn of Object.keys(TARGETS)) {
      let count = 0;
      for (const f of files) {
        const re = new RegExp("create or replace function public\\." + fn + "\\(", "g");
        count += (read(f).match(re) ?? []).length;
      }
      assert.equal(count, 1, `${fn} must have exactly one definition (grants are signature-specific)`);
    }
  });

  it("no RPC grants expose public execution", () => {
    for (const f of FILES) {
      const sql = read(f);
      assert.ok(!sql.match(/grant execute[^;]*to public/i), `${f}: no grant to public`);
    }
  });
});
