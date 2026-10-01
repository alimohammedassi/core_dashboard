import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleProposalApplyRequest, resolveFoods, type ProposalApplyDeps } from "../src/lib/ai/proposal-apply-handler.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// RUNTIME test for the AI proposal-apply flow — executes
// handleProposalApplyRequest end-to-end with injected fakes and a scripted
// Supabase fake: no Next.js, no Supabase, no network, no database (repo
// convention). It proves:
//   * auth/ownership: no coach row → 403; foreign subscription → 404 (no
//     existence oracle); inactive subscription → 403 — all before any write;
//   * validation: kind/date/duration/proposal failures → 400, no writes;
//   * one-active-enrollment 409 for both kinds;
//   * workout chain: templates → program → enrollment RPCs in order;
//     a mid-chain failure compensates (deletes created rows) — no orphans;
//   * nutrition: unmatched/ambiguous foods → 422 with the food list and ZERO
//     writes; resolved foods → program + enrollment; an enrollment failure
//     deletes the created program.

const COACH_ID = "c0000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

const OWNED_SUB = { id: SUBSCRIPTION_ID, client_id: CLIENT_ID, status: "active" };
const INACTIVE_SUB = { id: SUBSCRIPTION_ID, client_id: CLIENT_ID, status: "past_due" };

// ── Fixtures ─────────────────────────────────────────────────────────────────

function workoutProposal() {
  return {
    name: "AI Upper/Lower",
    description: "Two upper and two lower days.",
    rationale: "Matches the client's 4-day availability and current strength levels.",
    days: [
      {
        day_of_week: 1,
        focus: "Upper",
        notes: null,
        exercises: [
          { name: "Bench Press", sets: 4, reps: 8, weight_kg: 60, rest_sec: 120, notes: null },
          { name: "Row", sets: 4, reps: 10, weight_kg: 50, rest_sec: 90, notes: null },
        ],
      },
      {
        day_of_week: 3,
        focus: "Lower",
        notes: null,
        exercises: [{ name: "Squat", sets: 5, reps: 5, weight_kg: 100, rest_sec: 180, notes: null }],
      },
    ],
  };
}

function nutritionProposal() {
  return {
    name: "AI Maintenance Week",
    description: null,
    rationale: "Aligns prescribed calories with the recorded training demand.",
    days: [
      {
        day_of_week: 1,
        notes: null,
        meals: [
          {
            name: "Breakfast",
            foods: [
              { name: "Oats", quantity: 80, serving_unit: "g", calories: 300, protein_g: 10, carbs_g: 50, fat_g: 6 },
              { name: "Chicken Breast", quantity: 150, serving_unit: "g", calories: 250, protein_g: 45, carbs_g: 0, fat_g: 5 },
            ],
          },
        ],
      },
    ],
  };
}

const FOOD_CATALOG = [
  { id: "f0000000-0000-4000-8000-000000000001", name: "Oats" },
  { id: "f0000000-0000-4000-8000-000000000002", name: "chicken breast" },
  { id: "f0000000-0000-4000-8000-000000000003", name: "Chicken breast (raw)" },
];

// ── Scripted Supabase fake ───────────────────────────────────────────────────
// Tracks every .from() read, .delete() write and .rpc() call. Tables return
// programmed rows for the ownership lookups; RPCs return programmed
// { data, error } per function name in call order.

type RpcCall = { fn: string; params: Record<string, unknown> };
type DeleteCall = { table: string; filters: Record<string, unknown> };

function fakeSupabase(opts: {
  subscriptionRow?: unknown;
  activeEnrollment?: { table: string; row: unknown } | null;
  foodRows?: { id: string; name: string }[] | null;
  foodQueryError?: string | null;
  rpcResults?: Record<string, { data?: unknown; error?: { message: string } }[]>;
} = {}) {
  const state = {
    fromCalls: [] as string[],
    deleteCalls: [] as DeleteCall[],
    rpcCalls: [] as RpcCall[],
    orQueries: [] as string[],
  };
  const rpcIndex: Record<string, number> = {};

  const client = {
    from: (table: string) => {
      state.fromCalls.push(table);
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        in: (col: string, vals: unknown) => {
          filters[col] = vals;
          return chain;
        },
        or: (query: string) => {
          state.orQueries.push(query);
          if (table === "foods") return Promise.resolve({ data: opts.foodQueryError ? null : opts.foodRows ?? [], error: opts.foodQueryError ? { message: opts.foodQueryError } : null });
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle: async () => {
          if (table === "subscriptions") {
            return { data: opts.subscriptionRow === undefined ? null : opts.subscriptionRow };
          }
          if (table === "client_program_enrollments" || table === "client_nutrition_enrollments") {
            const active = opts.activeEnrollment ?? null;
            return { data: active && active.table === table ? active.row : null };
          }
          return { data: null };
        },
        delete: () => {
          const rec: DeleteCall = { table, filters: {} };
          state.deleteCalls.push(rec);
          const delChain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              rec.filters[col] = val;
              return delChain;
            },
            in: (col: string, vals: unknown) => {
              rec.filters[col] = vals;
              return delChain;
            },
          };
          return delChain;
        },
      };
      return chain;
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, params });
      const results = opts.rpcResults?.[fn] ?? [];
      const idx = rpcIndex[fn] ?? 0;
      rpcIndex[fn] = idx + 1;
      return results[idx] ?? { data: `id-${state.rpcCalls.length}`, error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

function makeDeps(client: SupabaseClient, coachContext: { userId: string; coachId: string } | null = { userId: "u1", coachId: COACH_ID }): ProposalApplyDeps {
  return {
    createServiceClient: async () => client,
    requireCoachContext: async () => coachContext,
  };
}

async function run(deps: ProposalApplyDeps, body: unknown) {
  return handleProposalApplyRequest(deps, body);
}

const WORKOUT_BODY = {
  subscription_id: SUBSCRIPTION_ID,
  kind: "workout",
  proposal: workoutProposal(),
  start_date: "2026-10-05",
  duration_weeks: 8,
};

// ── Authentication & ownership ───────────────────────────────────────────────

describe("proposal-apply — authentication and ownership", () => {
  it("403 without a coach row, before any read or write", async () => {
    const { client, state } = fakeSupabase();
    const res = await run(makeDeps(client, null), WORKOUT_BODY);
    assert.equal(res.status, 403);
    assert.equal(state.fromCalls.length, 0, "no table reads without a coach");
    assert.equal(state.rpcCalls.length, 0, "no writes without a coach");
  });

  it("404 for a foreign/missing subscription — no existence oracle, no writes", async () => {
    const { client, state } = fakeSupabase({ subscriptionRow: null });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: "Client not found" });
    assert.equal(state.rpcCalls.length, 0);
  });

  it("403 when the subscription is not active", async () => {
    const { client, state } = fakeSupabase({ subscriptionRow: INACTIVE_SUB });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 403);
    assert.equal(state.rpcCalls.length, 0);
  });

  it("400 for a malformed subscription id before any lookup", async () => {
    const { client, state } = fakeSupabase();
    const res = await run(makeDeps(client), { ...WORKOUT_BODY, subscription_id: "../etc/passwd" });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: "A valid subscription id is required" });
    assert.equal(state.fromCalls.length, 0);
  });

  it("400 for an unparseable body", async () => {
    const { client } = fakeSupabase();
    const res = await run(makeDeps(client), null);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: "Invalid request body" });
  });
});

// ── Request validation ───────────────────────────────────────────────────────

describe("proposal-apply — request validation", () => {
  it("400 for an unknown kind", async () => {
    const { client } = fakeSupabase({ subscriptionRow: OWNED_SUB });
    const res = await run(makeDeps(client), { ...WORKOUT_BODY, kind: "both" });
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error: string }).error), /kind/);
  });

  it("400 for an invalid start date", async () => {
    const { client } = fakeSupabase({ subscriptionRow: OWNED_SUB });
    for (const bad of ["", "not-a-date", "2026-13-40", "2026/10/05"]) {
      const res = await run(makeDeps(client), { ...WORKOUT_BODY, start_date: bad });
      assert.equal(res.status, 400, `expected 400 for start_date=${bad}`);
    }
  });

  it("400 for duration outside 1–52", async () => {
    const { client } = fakeSupabase({ subscriptionRow: OWNED_SUB });
    for (const bad of [0, -1, 53, 1.5, "many"]) {
      const res = await run(makeDeps(client), { ...WORKOUT_BODY, duration_weeks: bad });
      assert.equal(res.status, 400, `expected 400 for duration_weeks=${bad}`);
    }
  });

  it("400 for a malformed proposal (contract re-validated server-side)", async () => {
    const { client, state } = fakeSupabase({ subscriptionRow: OWNED_SUB });
    const bad = workoutProposal();
    (bad.days as { day_of_week: number }[])[0].day_of_week = 9;
    const res = await run(makeDeps(client), { ...WORKOUT_BODY, proposal: bad });
    assert.equal(res.status, 400);
    assert.equal(state.rpcCalls.length, 0, "an invalid proposal never triggers writes");
  });

  it("400 when kind and proposal disagree (nutrition proposal sent as workout)", async () => {
    const { client, state } = fakeSupabase({ subscriptionRow: OWNED_SUB });
    const res = await run(makeDeps(client), { ...WORKOUT_BODY, proposal: nutritionProposal() });
    assert.equal(res.status, 400);
    assert.equal(state.rpcCalls.length, 0);
  });
});

// ── One-active-enrollment rule ───────────────────────────────────────────────

describe("proposal-apply — one-active-enrollment rule", () => {
  it("409 when the client already has an active workout program", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      activeEnrollment: { table: "client_program_enrollments", row: { id: "e1" } },
    });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 409);
    assert.match(String((res.body as { error: string }).error), /already has an active program/);
    assert.equal(state.rpcCalls.length, 0);
  });

  it("409 when the client already has an active nutrition program", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      activeEnrollment: { table: "client_nutrition_enrollments", row: { id: "e2" } },
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 409);
    assert.match(String((res.body as { error: string }).error), /already has an active nutrition program/);
    assert.equal(state.rpcCalls.length, 0);
  });

  it("a workout 409 does not block the nutrition kind (independent tables)", async () => {
    const { client } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      activeEnrollment: { table: "client_program_enrollments", row: { id: "e1" } },
      foodRows: FOOD_CATALOG,
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 200, "workout enrollment conflict must not leak into the nutrition kind");
  });
});

// ── Workout apply ────────────────────────────────────────────────────────────

describe("proposal-apply — workout chain", () => {
  it("happy path: one template per day, then program, then enrollment — in order", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      rpcResults: {
        create_workout_template_atomic: [
          { data: "tpl-1", error: null },
          { data: "tpl-2", error: null },
        ],
        upsert_coach_program_atomic: [{ data: "prog-1", error: null }],
        create_program_enrollment_atomic: [{ data: "enr-1", error: null }],
      },
    });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { program_id: "prog-1", enrollment_id: "enr-1" });

    assert.deepEqual(
      state.rpcCalls.map((c) => c.fn),
      ["create_workout_template_atomic", "create_workout_template_atomic", "upsert_coach_program_atomic", "create_program_enrollment_atomic"]
    );
    const tpl1 = state.rpcCalls[0].params;
    assert.equal(tpl1.p_coach_id, COACH_ID, "template RPC is coach-scoped");
    assert.equal(tpl1.p_name, "AI Upper/Lower - Mon");
    assert.deepEqual(tpl1.p_target_muscles, ["Upper"]);
    const enroll = state.rpcCalls[3].params;
    assert.equal(enroll.p_client_id, CLIENT_ID, "enrollment uses the server-resolved client");
    assert.equal(enroll.p_program_id, "prog-1");
    assert.equal(enroll.p_start_date, "2026-10-05");
    assert.equal(enroll.p_duration_weeks, 8);
    assert.equal(state.deleteCalls.length, 0, "no cleanup on success");
  });

  it("mid-chain failure (template 2) deletes template 1 and returns sanitized 400", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      rpcResults: {
        create_workout_template_atomic: [
          { data: "tpl-1", error: null },
          { data: null, error: { message: "db exploded: secret detail" } },
        ],
      },
    });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: "Something went wrong. Please try again." }, "DB internals never reach the client");
    assert.deepEqual(
      state.deleteCalls.map((d) => ({ table: d.table, ids: d.filters["id"] })),
      [{ table: "workout_templates", ids: ["tpl-1"] }],
      "created templates are compensated away"
    );
    const programCalls = state.rpcCalls.filter((c) => c.fn === "upsert_coach_program_atomic");
    assert.equal(programCalls.length, 0, "the chain stops at the first failure");
  });

  it("enrollment failure deletes the created program AND templates", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      rpcResults: {
        create_workout_template_atomic: [
          { data: "tpl-1", error: null },
          { data: "tpl-2", error: null },
        ],
        upsert_coach_program_atomic: [{ data: "prog-1", error: null }],
        create_program_enrollment_atomic: [{ data: null, error: { message: "no training days" } }],
      },
    });
    const res = await run(makeDeps(client), WORKOUT_BODY);
    assert.equal(res.status, 400);
    const deletedTables = state.deleteCalls.map((d) => d.table).sort();
    assert.deepEqual(deletedTables, ["coach_programs", "workout_templates"], "program + templates compensated");
    assert.deepEqual(state.deleteCalls.find((d) => d.table === "workout_templates")?.filters["id"], ["tpl-1", "tpl-2"]);
  });
});

// ── Nutrition apply ──────────────────────────────────────────────────────────

describe("proposal-apply — nutrition chain", () => {
  it("happy path: resolved foods feed the program RPC, then enrollment", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      foodRows: FOOD_CATALOG,
      rpcResults: {
        upsert_nutrition_program_atomic: [{ data: "nprog-1", error: null }],
        create_nutrition_enrollment_atomic: [{ data: "nenr-1", error: null }],
      },
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { program_id: "nprog-1", enrollment_id: "nenr-1" });

    const prog = state.rpcCalls[0];
    assert.equal(prog.fn, "upsert_nutrition_program_atomic");
    const tree = prog.params.p_tree as { meals: { foods: { food_id: string; quantity: number }[] }[] }[];
    assert.equal(tree[0].meals[0].foods[0].food_id, "f0000000-0000-4000-8000-000000000001", "Oats matched");
    assert.equal(tree[0].meals[0].foods[1].food_id, "f0000000-0000-4000-8000-000000000002", "case-insensitive match");
    assert.equal(tree[0].meals[0].foods[1].quantity, 150);
    const enroll = state.rpcCalls[1];
    assert.equal(enroll.fn, "create_nutrition_enrollment_atomic");
    assert.equal(state.deleteCalls.length, 0);
  });

  it("unmatched food → 422 UNMATCHED_FOODS with the food name and ZERO writes", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      foodRows: [{ id: "f1", name: "Oats" }],
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 422);
    const body = res.body as { error: string; foods: { name: string; reason: string }[] };
    assert.equal(body.error, "UNMATCHED_FOODS");
    assert.ok(body.foods.some((f) => f.name === "Chicken Breast" && f.reason === "not_found"));
    assert.ok(!body.foods.some((f) => f.name === "Oats"), "matched foods are not reported");
    assert.equal(state.rpcCalls.length, 0, "no program is created for an unmatched proposal");
    assert.equal(state.deleteCalls.length, 0);
  });

  it("ambiguous food (multiple exact case-insensitive matches) → 422, never guessed", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      foodRows: [
        { id: "f0000000-0000-4000-8000-000000000002", name: "Chicken Breast" },
        { id: "f0000000-0000-4000-8000-000000000004", name: "chicken breast" },
        { id: "f0000000-0000-4000-8000-000000000001", name: "Oats" },
      ],
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 422);
    const body = res.body as { error: string; foods: { name: string; reason: string; candidates?: string[] }[] };
    const ambiguous = body.foods.find((f) => f.name === "Chicken Breast");
    assert.ok(ambiguous, "the duplicated food is reported");
    assert.equal(ambiguous?.reason, "ambiguous");
    assert.ok((ambiguous?.candidates ?? []).length === 2, "candidates listed for the coach");
    assert.equal(state.rpcCalls.length, 0);
  });

  it("enrollment failure deletes the created nutrition program (compensation)", async () => {
    const { client, state } = fakeSupabase({
      subscriptionRow: OWNED_SUB,
      foodRows: FOOD_CATALOG,
      rpcResults: {
        upsert_nutrition_program_atomic: [{ data: "nprog-1", error: null }],
        create_nutrition_enrollment_atomic: [{ data: null, error: { message: "boom" } }],
      },
    });
    const res = await run(makeDeps(client), {
      subscription_id: SUBSCRIPTION_ID,
      kind: "nutrition",
      proposal: nutritionProposal(),
      start_date: "2026-10-05",
      duration_weeks: 4,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(state.deleteCalls.map((d) => d.table), ["nutrition_programs"]);
    assert.equal(state.deleteCalls[0].filters["id"], "nprog-1");
  });
});

// ── resolveFoods unit behavior ───────────────────────────────────────────────

describe("resolveFoods — matching semantics", () => {
  function fakeFoodClient(rows: { id: string; name: string }[]) {
    return {
      from: () => ({
        select: () => ({
          or: async () => ({ data: rows, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("exact case-insensitive single match resolves", async () => {
    const { matches, unresolved } = await resolveFoods(fakeFoodClient([{ id: "f1", name: "Oats" }]), ["oats"]);
    assert.equal(unresolved.length, 0);
    assert.equal(matches.get("oats")?.id, "f1");
  });

  it("zero matches → not_found; multiple exact → ambiguous (never picked)", async () => {
    const { unresolved } = await resolveFoods(
      fakeFoodClient([{ id: "f1", name: "Rice" }, { id: "f2", name: "rice" }]),
      ["Rice", "Bread"]
    );
    assert.deepEqual(
      unresolved.map((u) => ({ name: u.name, reason: u.reason })),
      [
        { name: "Rice", reason: "ambiguous" },
        { name: "Bread", reason: "not_found" },
      ]
    );
  });
});
