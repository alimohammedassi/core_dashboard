import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Static authorization audit for the F1/F2 read-state SECURITY DEFINER RPCs
// (user_activity_read_state_migration.sql). Parses the migration SQL and
// asserts every function body enforces ownership before touching data, with
// an explicit service_role bypass for dashboard server routes, and that the
// REVOKE/GRANT blocks match the exact CREATE signatures (PostgreSQL
// privileges are signature-specific). No database required.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE = path.join(HERE, "..", "supabase");

const FILE = "user_activity_read_state_migration.sql";

const TARGETS = [
  "get_user_activity",
  "mark_all_notifications_read",
  "mark_notification_read",
  "mark_conversation_read",
  "unread_count",
] as const;

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

function fullDef(sql: string, fn: string): string {
  const re = new RegExp("create or replace function public\\." + fn + "\\([\\s\\S]*?\\$\\$;", "");
  const m = re.exec(sql);
  assert.ok(m, `definition of ${fn} must be parseable`);
  return m![0];
}

function argTypes(sql: string, fn: string): string[] {
  const re = new RegExp("create or replace function public\\." + fn + "\\(([\\s\\S]*?)\\)\\s+returns", "");
  const m = re.exec(sql);
  assert.ok(m, `signature of ${fn} must be parseable`);
  // strip -- comments and DEFAULT clauses, then take the type (last token) of each arg
  const cleaned = m![1].replace(/--[^\n]*/g, "");
  return cleaned
    .split(",")
    .map((a) => {
      const noDefault = a.split(/\s+default\s+/i)[0];
      return noDefault.trim().split(/\s+/).pop()!.toLowerCase();
    })
    .filter(Boolean);
}

describe("F1/F2 read-state RPC authorization", () => {
  for (const fn of TARGETS) {
    it(`${fn} enforces ownership in-body with service_role bypass`, () => {
      const body = bodyOf(read(FILE), fn);
      assert.ok(body.includes("auth.role() <> 'service_role'"), "service_role bypass present");
      assert.ok(body.includes("auth.uid()"), "resolves the authenticated user");
      assert.ok(
        body.includes("raise exception 'Not authorized'"),
        "fails closed with an exception"
      );
    });

    it(`${fn} rejects arbitrary user IDs`, () => {
      const body = bodyOf(read(FILE), fn);
      assert.ok(
        body.includes("p_user_id is null or p_user_id <> auth.uid()") ||
          body.includes("p_target is null"),
        "caller-supplied id is tied to auth.uid()"
      );
    });

    it(`${fn} grant block matches the exact CREATE signature`, () => {
      const sql = read(FILE);
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

    it(`${fn} stays SECURITY DEFINER with explicit search_path`, () => {
      const def = fullDef(read(FILE), fn).toLowerCase();
      assert.ok(def.includes("security definer"), "remains SECURITY DEFINER");
      assert.ok(def.includes("set search_path"), "sets an explicit search_path");
    });
  }

  it("get_user_activity allows self reads and active-subscriber coach reads", () => {
    const body = bodyOf(read(FILE), "get_user_activity");
    assert.ok(body.includes("p_target <> auth.uid()"), "own activity allowed");
    assert.ok(body.includes("from subscriptions"), "coach branch checks subscriptions");
    assert.ok(body.includes("join coaches"), "coach branch resolves the coach row");
    assert.ok(body.includes("s.status = 'active'"), "coach branch requires an active subscription");
    assert.ok(body.includes("c.user_id = auth.uid()"), "coach branch ties to the caller");
  });

  it("get_user_activity preserves business logic and volatility", () => {
    const sql = read(FILE);
    const body = bodyOf(sql, "get_user_activity");
    assert.ok(body.includes("from daily_summary ds"), "original activity query preserved");
    assert.ok(body.includes("day_commitment_score"), "score computation preserved");
    assert.ok(fullDef(sql, "get_user_activity").toLowerCase().includes("stable"), "stays STABLE");
  });

  it("mark_notification_read verifies the notification row belongs to the caller", () => {
    const body = bodyOf(read(FILE), "mark_notification_read");
    assert.ok(
      body.includes("from notifications") && body.includes("where id = p_notification_id"),
      "row ownership re-checked"
    );
  });

  it("mark_conversation_read verifies conversation participation", () => {
    const body = bodyOf(read(FILE), "mark_conversation_read");
    assert.ok(body.includes("from conversations"), "checks the conversations table");
    assert.ok(body.includes("coach_id = auth.uid()"), "coach participant accepted");
    assert.ok(body.includes("client_id = auth.uid()"), "client participant accepted");
  });

  it("unread_count preserves the aggregation and volatility", () => {
    const sql = read(FILE);
    const body = bodyOf(sql, "unread_count");
    assert.ok(body.includes("client_unread") && body.includes("coach_unread"), "counters preserved");
    const def = fullDef(sql, "unread_count").toLowerCase();
    assert.ok(def.includes("volatile"), "stays VOLATILE to match Production");
    assert.ok(!def.includes("stable"), "does not change volatility");
  });

  it("no overloads of the 5 functions exist anywhere in supabase/", () => {
    const files = readdirSync(SUPABASE).filter((f) => f.endsWith(".sql"));
    for (const fn of TARGETS) {
      let count = 0;
      for (const f of files) {
        const re = new RegExp("create or replace function public\\." + fn + "\\(", "g");
        count += (read(f).match(re) ?? []).length;
      }
      assert.equal(count, 1, `${fn} must have exactly one definition (grants are signature-specific)`);
    }
  });

  it("no RPC grants expose public execution", () => {
    const sql = read(FILE);
    assert.ok(!sql.match(/grant execute[^;]*to public/i), "no grant to public");
  });
});
